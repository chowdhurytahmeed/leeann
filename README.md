# Leeann

A standalone version of the Leeann app, set up to deploy for free on **GitHub
Pages** — no Vercel, no billing, no credit card.

## What changed from the Claude artifact version

1. **Storage**: the artifact-only `window.storage` API was replaced with
   `src/storage.js`, a small shim backed by real browser `localStorage`.
2. **AI calls**: GitHub Pages only serves static files — it can't run a
   backend to hide an API key. So instead, **you paste your own Anthropic
   API key into the app itself** (there's a key icon in the top-right nav).
   It's saved only in your browser's local storage and sent straight to
   Anthropic — never to any server of ours, because there isn't one.

This is a real, officially-supported pattern (Anthropic's API has a header,
`anthropic-dangerous-direct-browser-access`, specifically for browser apps
that call it directly with a user-supplied key) — but it means **every
visitor needs their own key**. Great for you demoing this yourself. Not yet
right for a public product with real end users — that still needs a real
backend holding one shared key, which is a good next step once you're past
pitching.

## Before you deploy, you'll need:

1. **A GitHub account** (free).
2. **An Anthropic API key** — from console.anthropic.com, under API Keys.
   Different from your claude.ai login. Using it costs a small amount per
   request (Anthropic's standard API pricing) — separate from any Claude.ai
   subscription.

## Steps to go live

### 1. Create a new GitHub repo
Go to github.com/new, name it (e.g. `leeann-app`), keep it public, don't
initialize with a README (this folder already has one).

### 2. Push this folder to it
```
cd leeann-app
git init
git add .
git commit -m "Leeann"
git branch -M main
git remote add origin https://github.com/<your-username>/leeann-app.git
git push -u origin main
```

### 3. Turn on GitHub Pages
- In your new repo on GitHub: Settings -> Pages
- Under "Build and deployment", set Source to "GitHub Actions"
- That's it — the workflow in `.github/workflows/deploy.yml` runs
  automatically. Check the Actions tab to watch it build.

### 4. Find your live URL
Once the Actions workflow finishes (a green checkmark, usually under a
minute), go back to Settings -> Pages — your live URL will be shown at
the top, something like:

```
https://<your-username>.github.io/leeann-app/
```

### 5. Add your API key
Open the live site, click the key icon in the top-right corner, paste in
your Anthropic API key, save. Now every screen that talks to Leeann works
— including the microphone, since this is a real deployed site, not a
sandboxed preview.

## Every future update

Just push to main again:
```
git add .
git commit -m "update"
git push
```
The GitHub Action redeploys automatically — no extra steps.

## Known limitations (worth knowing before a pitch)

- Everyone needs their own API key. If you send this link to someone else,
  they'll hit the same "add a key" prompt. Fine for you demoing it on your
  own devices; not yet a real multi-user product.
- Storage is per-browser. "Signing up" saves your account and history in
  that specific browser's local storage. A different browser or device
  starts fresh — same limitation the Claude artifact version had, just
  now on a real domain instead of a preview.
- Voice quality depends on the browser's built-in text-to-speech and
  speech-recognition — best in Chrome/Edge/Safari, not supported in
  Firefox (falls back to typing automatically).
- This repo is public by default on GitHub Pages' free tier — anyone with
  the URL can open it (though they'd still need their own API key to
  actually talk to Leeann). Fully private GitHub Pages requires a paid
  GitHub plan; otherwise treat the URL as semi-public, like a demo link.
