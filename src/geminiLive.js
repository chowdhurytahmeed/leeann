// Gemini Live API client — real-time, bidirectional voice conversation.
//
// This is genuinely different from a normal API call: instead of
// "send text, get text back," this opens one persistent WebSocket and
// streams raw audio both directions continuously, so it feels like an
// actual phone call rather than a chat.
//
// Docs: https://ai.google.dev/gemini-api/docs/live-api
//
// IMPORTANT — security note: like the Anthropic key, this calls Google's
// API directly from the browser using a key you provide, which is fine for
// a personal demo (you're the only one using your own key) but is NOT
// Google's recommended pattern for a real multi-user product. The correct
// production approach is "ephemeral tokens" — short-lived tokens minted by
// a backend that holds your real key — see:
// https://ai.google.dev/gemini-api/docs/live-api#ephemeral-tokens
// That requires a backend, which this static site doesn't have (same
// tradeoff we already made for the Anthropic key).

const MODEL = 'models/gemini-3.1-flash-live-preview'; // Google's current recommended model for lowest-latency live conversation
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Downsamples a Float32 buffer at `inRate` to 16-bit PCM at `outRate`.
// The browser's mic almost never natively runs at 16kHz (usually 44.1/48kHz),
// so this conversion is required — sending unconverted audio makes Gemini
// either reject it or (if it guesses wrong) sound sped-up/slowed-down.
function floatTo16kPCM(float32Array, inRate, outRate) {
  const ratio = inRate / outRate;
  const outLength = Math.floor(float32Array.length / ratio);
  const result = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.floor(i * ratio);
    let sample = float32Array[srcIndex];
    sample = Math.max(-1, Math.min(1, sample));
    result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return result;
}

export class GeminiLiveSession {
  constructor({ apiKey, systemInstruction, voiceName = 'Kore', onOpen, onClose, onError, onSpeakingChange, onListeningChange, onTranscript }) {
    this.apiKey = apiKey;
    this.systemInstruction = systemInstruction;
    this.voiceName = voiceName;
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.onError = onError || (() => {});
    this.onSpeakingChange = onSpeakingChange || (() => {});
    this.onListeningChange = onListeningChange || (() => {});
    this.onTranscript = onTranscript || (() => {});

    this.ws = null;
    this.audioContext = null;
    this.micStream = null;
    this.processorNode = null;
    this.sourceNode = null;

    // Playback queue — audio chunks arrive faster than they play, so they
    // queue up and play back-to-back instead of overlapping/glitching.
    this.playbackContext = null;
    this.playbackQueueTime = 0;
    this.isPlaying = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          const setupMessage = {
            setup: {
              model: MODEL,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } } },
                thinkingConfig: { thinkingLevel: 'minimal' }, // fastest response generation — trades off deeper reasoning for speed
              },
              systemInstruction: { parts: [{ text: this.systemInstruction }] },
              outputAudioTranscription: {},
              inputAudioTranscription: {},
            },
          };
          this.ws.send(JSON.stringify(setupMessage));
        };

        this.ws.onmessage = async (event) => {
          const text = typeof event.data === 'string' ? event.data : await event.data.text();
          let msg;
          try {
            msg = JSON.parse(text);
          } catch (e) {
            return;
          }

          if (msg.setupComplete) {
            this.onOpen();
            resolve();
            return;
          }

          if (msg.serverContent) {
            const sc = msg.serverContent;

            if (sc.interrupted) {
              this._stopPlayback();
              this.onSpeakingChange(false);
            }

            if (sc.modelTurn?.parts) {
              for (const part of sc.modelTurn.parts) {
                if (part.inlineData?.data) {
                  this._enqueueAudio(part.inlineData.data);
                }
              }
            }

            if (sc.outputTranscription?.text) {
              this.onTranscript('assistant', sc.outputTranscription.text);
            }
            if (sc.inputTranscription?.text) {
              this.onTranscript('user', sc.inputTranscription.text);
            }

            if (sc.turnComplete) {
              // playback continues from the queue; speaking state clears once it drains
            }
          }
        };

        this.ws.onerror = (err) => {
          this.onError(err);
          reject(err);
        };

        this.ws.onclose = () => {
          this.onClose();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  async startMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const nativeRate = this.audioContext.sampleRate;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);
    // ScriptProcessorNode is deprecated but has the widest, most reliable
    // browser support for this kind of raw-sample access without needing a
    // separate AudioWorklet file — the simpler, safer choice here.
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const pcm16 = floatTo16kPCM(input, nativeRate, INPUT_SAMPLE_RATE);
      const base64 = arrayBufferToBase64(pcm16.buffer);
      this.ws.send(JSON.stringify({
        realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` } },
      }));
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
    this.onListeningChange(true);
  }

  stopMic() {
    if (this.processorNode) { this.processorNode.disconnect(); this.processorNode = null; }
    if (this.sourceNode) { this.sourceNode.disconnect(); this.sourceNode = null; }
    if (this.micStream) { this.micStream.getTracks().forEach((t) => t.stop()); this.micStream = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.onListeningChange(false);
  }

  sendText(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
    }));
  }

  _enqueueAudio(base64Data) {
    if (!this.playbackContext) {
      this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      this.playbackQueueTime = this.playbackContext.currentTime;
    }
    const pcmBuffer = base64ToArrayBuffer(base64Data);
    const pcm16 = new Int16Array(pcmBuffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x8000;

    const audioBuffer = this.playbackContext.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.playbackContext.destination);

    const startAt = Math.max(this.playbackQueueTime, this.playbackContext.currentTime);
    source.start(startAt);
    this.playbackQueueTime = startAt + audioBuffer.duration;

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onSpeakingChange(true);
    }
    source.onended = () => {
      if (this.playbackContext && this.playbackContext.currentTime >= this.playbackQueueTime - 0.05) {
        this.isPlaying = false;
        this.onSpeakingChange(false);
      }
    };
  }

  _stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }
    this.playbackQueueTime = 0;
    this.isPlaying = false;
  }

  disconnect() {
    this.stopMic();
    this._stopPlayback();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
