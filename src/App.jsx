import React, { useState, useRef, useEffect } from 'react';
import { storage } from './storage';
import { GeminiLiveSession } from './geminiLive';
import { LeanLogo3D } from './LeanLogo3D';
import {
  supabaseReady,
  getAccount, upsertAccount,
  getRolesForEmployer, getRolesForCompany, getOpenRoles, createRole as dbCreateRole, updateRole as dbUpdateRole,
} from './supabaseClient';
import {
  Users, User, Activity, Send, Loader2, CheckCircle2, Circle, XCircle,
  Sparkles, Calendar, ArrowRight, ArrowLeft, ClipboardList, MessageSquare,
  Building2, Sun, Moon, Volume2, Search, Mic, Key, LayoutGrid, UserPlus, Plus
} from 'lucide-react';

const MODEL = 'claude-sonnet-4-6';

// Parses '#rrggbb' or 'rgba(r,g,b,a)' into [r,g,b,a].
function parseColor(c) {
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const parts = c.match(/[\d.]+/g).map(Number);
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

// Linearly blends two colors (hex or rgba string) by t (0 = c1, 1 = c2).
function mixColor(c1, c2, t) {
  const [r1, g1, b1, a1] = parseColor(c1);
  const [r2, g2, b2, a2] = parseColor(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const a = a1 + (a2 - a1) * t;
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

// Blends across an arbitrary ordered list of {at, color} stops. Purely a
// function of t (0-1) — same input always produces the same output, so the
// color at any given scroll position is identical whether you arrived there
// scrolling up or down.
function mixStops(stops, t) {
  if (t <= stops[0].at) return stops[0].color;
  const last = stops[stops.length - 1];
  if (t >= last.at) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.at && t <= b.at) {
      const localT = (t - a.at) / (b.at - a.at);
      return mixColor(a.color, b.color, localT);
    }
  }
  return last.color;
}

// Standard perceived-brightness formula — matches how displays and
// accessibility contrast calculations weight each channel (green reads as
// much brighter than blue at the same numeric value, etc). Returns 0-1.
function luminance(color) {
  const [r, g, b] = parseColor(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Generates a set of stops for a UI token (text, panel, border, etc.) that
// switches between its "dark-background" and "light-background" value at
// the same zone boundaries the background itself uses — dark near the top
// (through the hero's navy), light through the white middle, dark again
// near the bottom (through blue/navy back to night).
function makeUiStops(onDarkBg, onLightBg) {
  return [
    { at: 0, color: onDarkBg },
    { at: 0.36, color: onDarkBg },
    { at: 0.46, color: onLightBg },
    { at: 0.60, color: onLightBg },
    { at: 0.74, color: onDarkBg },
    { at: 1, color: onDarkBg },
  ];
}

// The page's whole color sequence, generated mathematically rather than
// hand-placed — a handful of "true" waypoints (dark, navy, white, navy,
// dark) with cosine easing computed between them into many fine-grained
// steps. Cosine easing naturally moves slowly near each waypoint and faster
// in between, which is what actually produces a gradual approach into white
// rather than a hand-tuned guess at spacing. The CSS gradient string and the
// JS keyframe array used for text-contrast are both built from this same
// list, so they can never drift out of sync with each other.
const DARK_WAYPOINTS = [
  { at: 0.00, color: '#0A0812' },
  { at: 0.15, color: '#2F4A94' },
  { at: 0.40, color: '#1E2F5E' },
  { at: 0.65, color: '#121D3C' },
  { at: 0.85, color: '#0B1224' },
  { at: 1.00, color: '#15120E' },
];
const LIGHT_WAYPOINTS = [
  { at: 0.00, color: '#F4F6FA' },
  { at: 0.15, color: '#C3D0EE' },
  { at: 0.40, color: '#E0E6F4' },
  { at: 0.65, color: '#ECF0F8' },
  { at: 0.85, color: '#F4F6FA' },
  { at: 1.00, color: '#F7F8FC' },
];

function buildEasedKeyframes(waypoints, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let color = waypoints[waypoints.length - 1].color;
    for (let w = 0; w < waypoints.length - 1; w++) {
      const a = waypoints[w], b = waypoints[w + 1];
      if (t >= a.at && t <= b.at) {
        const localT = (b.at === a.at) ? 0 : (t - a.at) / (b.at - a.at);
        const eased = (1 - Math.cos(localT * Math.PI)) / 2; // cosine ease — slow-fast-slow
        color = mixColor(a.color, b.color, eased);
        break;
      }
    }
    out.push({ at: t, color });
  }
  return out;
}

function keyframesToGradient(keyframes) {
  return `linear-gradient(to bottom, ${keyframes.map((s) => `${s.color} ${(s.at * 100).toFixed(2)}%`).join(', ')})`;
}

const DARK_KEYFRAMES = buildEasedKeyframes(DARK_WAYPOINTS, 60);
const LIGHT_KEYFRAMES = buildEasedKeyframes(LIGHT_WAYPOINTS, 60);
const DARK_GRADIENT = keyframesToGradient(DARK_KEYFRAMES);
const LIGHT_GRADIENT = keyframesToGradient(LIGHT_KEYFRAMES);

const TEXT_STOPS = makeUiStops('#EDEFF5', '#14161F');
const TEXT_MUTED_STOPS = makeUiStops('#8B92AC', '#666E82');
const PANEL_STOPS = makeUiStops('#171B2C', '#FFFFFF');
const PANEL_ALT_STOPS = makeUiStops('#1E2338', '#ECEFF5');
const LINE_STOPS = makeUiStops('#2C3350', '#D8DEE9');
const GLASS_BG_STOPS = makeUiStops('rgba(23,27,44,0.5)', 'rgba(255,255,255,0.5)');
const GLASS_BORDER_STOPS = makeUiStops('rgba(255,255,255,0.09)', 'rgba(255,255,255,0.6)');
const GLASS_HIGHLIGHT_STOPS = makeUiStops('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.35)');
const GLASS_SHEEN_STOPS = makeUiStops('rgba(255,255,255,0.14)', 'rgba(255,255,255,0.55)');

// Every color token is a pure function of scroll position — so scrolling up
// through a spot gives the exact same color as scrolling down through it,
// each part of the page keeps one assigned color, nothing depends on
// direction or history. A continuous animation loop eases the *displayed*
// value toward that target every frame, so fast or erratic scrolling still
// produces a smooth chase rather than a jump.
//
// Which gradient plays is now driven by the site's actual light/dark
// toggle — previously the homepage ignored that toggle entirely and always
// showed the dark night-sky journey, so switching to light mode did
// nothing visible here. Now dark mode keeps that journey, light mode uses
// a bright counterpart that never dips toward black — just a soft blue-grey
// accent replacing where navy would be.
function useScrollBg(theme) {
  const isLight = theme === 'light';

  // Neither variant ever crosses into "needs the opposite text color"
  // territory — dark mode stays dark enough throughout for light text,
  // light mode stays light enough throughout for dark text — so these stay
  // fixed rather than switching mid-scroll.
  return {
    '--bg-gradient': isLight ? LIGHT_GRADIENT : DARK_GRADIENT,
    '--text': isLight ? '#14161F' : '#EDEFF5',
    '--text-muted': isLight ? '#666E82' : '#8B92AC',
    '--panel': isLight ? '#FFFFFF' : '#171B2C',
    '--panel-alt': isLight ? '#ECEFF5' : '#1E2338',
    '--line': isLight ? '#D8DEE9' : '#2C3350',
    '--glass-bg': isLight ? 'rgba(255,255,255,0.5)' : 'rgba(23,27,44,0.5)',
    '--glass-border': isLight ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.09)',
    '--glass-highlight': isLight ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.06)',
    '--glass-sheen': isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.14)',
  };
}

// The app's role objects use camelCase (mustHaves, hmMessages); the database
// columns are snake_case (must_haves, hm_messages). These two helpers convert
// between them so the rest of the app never has to think about the difference.
function mapDbRoleToAppRole(row) {
  return {
    id: row.id,
    title: row.title || '',
    team: row.team || '',
    tasks: row.tasks || [],
    mustHaves: row.must_haves || [],
    culture: row.culture || '',
    stages: row.stages || [],
    company: row.company || '',
    started: Boolean(row.started),
    hmMessages: row.hm_messages || [],
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
    // present only on the company-wide query, which joins accounts —
    // absent (undefined) on the regular per-employer fetch, harmlessly
    postedByName: row.accounts?.name,
    postedByEmail: row.accounts?.email || row.employer_email,
  };
}

function toDbRoleChanges(changes) {
  const keyMap = { mustHaves: 'must_haves', hmMessages: 'hm_messages' };
  const out = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'createdAt') continue; // server-managed, never written back
    out[keyMap[key] || key] = value;
  }
  return out;
}


async function callClaude(messages, system) {
  try {
    // GitHub Pages only serves static files — there's no server to hold an
    // API key. So instead, this reads a key the user pasted in themselves
    // (stored in their own browser via localStorage) and calls Anthropic
    // directly. The `anthropic-dangerous-direct-browser-access` header is
    // Anthropic's official opt-in for exactly this use case. See README.md.
    const apiKey = localStorage.getItem('lean:anthropicApiKey');
    if (!apiKey) {
      return "I don't have an API key set up yet — add one in Settings to start talking to me.";
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages }),
    });
    const data = await res.json();
    if (!res.ok) {
      return `Anthropic API error: ${data?.error?.message || res.statusText}. Check your API key in Settings.`;
    }
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return text || "I couldn't quite process that — try rephrasing.";
  } catch (e) {
    return "I'm having trouble connecting right now. Try again in a moment.";
  }
}

// Same shape as callClaude — takes [{role, content}] + a system prompt, returns
// plain text — but calls Gemini's REST API instead, using the same Gemini key
// already saved for Live Voice. Used anywhere text-extraction is needed
// without requiring a separate funded Anthropic key.
async function callGemini(messages, system) {
  try {
    const apiKey = localStorage.getItem('lean:geminiApiKey');
    if (!apiKey) {
      return "I don't have a Gemini key set up yet — add one in Settings.";
    }
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: system }] } }),
    });
    const data = await res.json();
    if (!res.ok) {
      return `Gemini API error: ${data?.error?.message || res.statusText}. Check your Gemini key in Settings.`;
    }
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return text || "I couldn't quite process that — try rephrasing.";
  } catch (e) {
    return "I'm having trouble connecting to Gemini right now. Try again in a moment.";
  }
}

function speak(text) {
  try {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1.02;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /Samantha|Victoria|Google US English|Female/i.test(v.name)) || voices.find((v) => v.lang?.startsWith('en')) || voices[0];
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    // speech synthesis unavailable — fail silently
  }
}

function parseJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

const emptyProfile = { title: '', team: '', tasks: [], mustHaves: [], culture: '', stages: [] };

const CATEGORIES = [
  {
    key: 'engineering', label: 'Engineering',
    types: [
      { key: 'engineer', label: 'Software', hasDemo: true },
      { key: 'biomed', label: 'Biomedical', hasDemo: true },
      { key: 'hardware_engineer', label: 'Hardware' },
      { key: 'electrical_engineer', label: 'Electrical' },
      { key: 'mechanical_engineer', label: 'Mechanical' },
      { key: 'civil_engineer', label: 'Civil' },
      { key: 'chemical_engineer', label: 'Chemical' },
      { key: 'quality_engineer', label: 'Quality' },
      { key: 'industrial_engineer', label: 'Industrial' },
      { key: 'aerospace_engineer', label: 'Aerospace' },
      { key: 'environmental_engineer', label: 'Environmental' },
      { key: 'devops_engineer', label: 'DevOps' },
      { key: 'systems_engineer', label: 'Systems' },
    ],
  },
  {
    key: 'medicine', label: 'Medicine & Healthcare',
    types: [
      { key: 'doctor', label: 'Doctor', hasDemo: true },
      { key: 'nurse', label: 'Nurse', hasDemo: true },
      { key: 'dentist', label: 'Dentist' },
      { key: 'pharmacist', label: 'Pharmacist' },
      { key: 'veterinarian', label: 'Veterinarian' },
      { key: 'physical_therapist', label: 'Physical Therapist' },
      { key: 'physician_assistant', label: 'Physician Assistant' },
      { key: 'radiology_tech', label: 'Radiologic Technologist' },
      { key: 'dental_hygienist', label: 'Dental Hygienist' },
      { key: 'paramedic', label: 'Paramedic / EMT' },
      { key: 'social_worker', label: 'Social Worker' },
    ],
  },
  {
    key: 'culinary', label: 'Culinary & Food Service',
    types: [
      { key: 'chef', label: 'Chef', hasDemo: true },
      { key: 'pastry_chef', label: 'Pastry Chef' },
      { key: 'line_cook', label: 'Line Cook' },
      { key: 'bartender', label: 'Bartender' },
      { key: 'barista', label: 'Barista' },
    ],
  },
  {
    key: 'business', label: 'Business & Finance',
    types: [
      { key: 'accountant', label: 'Accountant' },
      { key: 'financial_advisor', label: 'Financial Advisor' },
      { key: 'marketing', label: 'Marketing' },
      { key: 'sales', label: 'Sales Representative' },
      { key: 'hr', label: 'Human Resources' },
      { key: 'data_analyst', label: 'Data Analyst' },
      { key: 'product_manager', label: 'Product Manager' },
      { key: 'project_manager', label: 'Project Manager' },
      { key: 'consultant', label: 'Consultant' },
    ],
  },
  {
    key: 'legal', label: 'Legal',
    types: [
      { key: 'lawyer', label: 'Lawyer' },
      { key: 'paralegal', label: 'Paralegal' },
    ],
  },
  {
    key: 'education', label: 'Education',
    types: [
      { key: 'teacher_elementary', label: 'Elementary Teacher' },
      { key: 'teacher_highschool', label: 'High School Teacher' },
      { key: 'professor', label: 'University Professor' },
      { key: 'school_counselor', label: 'School Counselor' },
    ],
  },
  {
    key: 'retail', label: 'Retail & Service',
    types: [
      { key: 'cashier', label: 'Cashier', hasDemo: true },
      { key: 'customer_support', label: 'Customer Support' },
      { key: 'warehouse', label: 'Warehouse Associate' },
      { key: 'hotel_front_desk', label: 'Hotel Front Desk' },
    ],
  },
  {
    key: 'trades', label: 'Skilled Trades',
    types: [
      { key: 'electrician', label: 'Electrician' },
      { key: 'plumber', label: 'Plumber' },
      { key: 'hvac', label: 'HVAC Technician' },
      { key: 'carpenter', label: 'Carpenter' },
      { key: 'welder', label: 'Welder' },
    ],
  },
  {
    key: 'public_safety', label: 'Public Safety',
    types: [
      { key: 'police', label: 'Police Officer' },
      { key: 'firefighter', label: 'Firefighter' },
    ],
  },
  {
    key: 'hospitality', label: 'Hospitality & Travel',
    types: [
      { key: 'event_planner', label: 'Event Planner' },
      { key: 'flight_attendant', label: 'Flight Attendant' },
      { key: 'pilot', label: 'Pilot' },
    ],
  },
  {
    key: 'creative', label: 'Creative & Design',
    types: [
      { key: 'graphic_designer', label: 'Graphic Designer' },
      { key: 'ux_designer', label: 'UX Designer' },
      { key: 'journalist', label: 'Journalist' },
      { key: 'photographer', label: 'Photographer' },
    ],
  },
  {
    key: 'transportation', label: 'Transportation',
    types: [
      { key: 'truck_driver', label: 'Truck Driver' },
      { key: 'delivery_driver', label: 'Delivery Driver' },
    ],
  },
  {
    key: 'personal_services', label: 'Personal Care & Fitness',
    types: [
      { key: 'hairstylist', label: 'Hairdresser / Barber' },
      { key: 'personal_trainer', label: 'Personal Trainer' },
    ],
  },
  {
    key: 'property_insurance', label: 'Insurance & Real Estate',
    types: [
      { key: 'insurance_agent', label: 'Insurance Agent' },
      { key: 'real_estate_agent', label: 'Real Estate Agent' },
    ],
  },
];

const KEYWORDS = ['function', 'const', 'return', 'if', 'for', 'let', 'new'];

function highlightLine(line, keyColor) {
  const parts = line.split(new RegExp(`(${KEYWORDS.join('|')})`, 'g'));
  return parts.map((part, i) =>
    KEYWORDS.includes(part) ? (
      <span key={i} style={{ color: keyColor }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function GlobalStyles() {
  useEffect(() => {
    // One listener for the whole page, rather than one per button — finds
    // whichever glass button the cursor is currently over and records the
    // relative position as CSS variables, which the specular-highlight
    // gradient below reads. This is the actual defining trait of Liquid
    // Glass versus generic frosted glass: the shine moves with real
    // cursor position instead of playing a fixed, canned sweep.
    function handleMove(e) {
      const btn = e.target.closest ? e.target.closest('.lea-glass-btn, .lea-glass') : null;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      btn.style.setProperty('--mx', `${mx}%`);
      btn.style.setProperty('--my', `${my}%`);
    }
    document.addEventListener('mousemove', handleMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; }
      .lea-glass {
        position: relative;
        background: var(--glass-bg);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border: 1px solid var(--glass-border);
        box-shadow:
          inset 0 1px 0 var(--glass-highlight),
          inset 0 -14px 26px -18px rgba(255,255,255,0.25),
          0 14px 38px rgba(0,0,0,0.14);
        overflow: hidden;
      }
      .lea-glass::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, var(--glass-sheen) 0%, transparent 58%);
        pointer-events: none;
      }
      .lea-glass-btn {
        position: relative;
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid var(--glass-border);
        border-radius: 999px;
        box-shadow: inset 0 1px 0 var(--glass-highlight), inset 0 -10px 18px -14px rgba(255,255,255,0.3), 0 6px 18px rgba(0,0,0,0.14);
        text-shadow: 0 1px 3px rgba(0,0,0,0.18);
        overflow: hidden;
      }
      .lea-glass-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, var(--glass-sheen) 0%, transparent 65%);
        pointer-events: none;
      }
      /* The actual Liquid Glass signature — a soft highlight that follows
         real cursor position (--mx/--my, set by GlobalStyles' mousemove
         listener) rather than a fixed animated sweep. Fades in on hover so
         it reads as glass catching light from where you're pointing, not
         a decoration that's always on. */
      .lea-glass-btn::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.55), transparent 55%);
        opacity: 0;
        transition: opacity 0.25s ease;
        pointer-events: none;
      }
      .lea-glass-btn:hover::after {
        opacity: 1;
      }
      @keyframes lea-wave-pulse-idle { 0%, 100% { transform: translateY(-50%) scaleY(0.65); } 50% { transform: translateY(-50%) scaleY(1); } }
      @keyframes lea-wave-pulse-speaking { 0%, 100% { transform: translateY(-50%) scaleY(0.35); } 50% { transform: translateY(-50%) scaleY(1.2); } }
      .lea-wave-bar-idle { animation-name: lea-wave-pulse-idle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
      .lea-wave-bar-speaking { animation-name: lea-wave-pulse-speaking; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
      .lea-glass-btn-outline {
        text-shadow: none;
        background: var(--glass-bg) !important;
        color: var(--text) !important;
      }
      .lea-glass-btn {
        transition: transform 0.2s cubic-bezier(.2,.8,.2,1), box-shadow 0.2s ease, filter 0.2s ease;
      }
      .lea-glass-btn:hover {
        transform: translateY(-2px) scale(1.025);
        filter: brightness(1.08);
        box-shadow: inset 0 1px 0 var(--glass-highlight), inset 0 -10px 18px -14px rgba(255,255,255,0.4), 0 10px 26px rgba(0,0,0,0.2);
      }
      .lea-glass-btn:active {
        transform: translateY(0) scale(0.97);
        filter: brightness(0.96);
      }
      .lea-root, .lea-root * {
        transition: background-color 0.35s ease, color 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
      }
      .lea-root { font-family: 'Inter', sans-serif; }
      .lea-display { font-family: 'Sora', sans-serif; font-weight: 700; }
      .lea-signature { font-family: 'Sora', sans-serif; font-style: normal; }
      .lea-mono { font-family: 'IBM Plex Mono', monospace; }
      .lea-scroll::-webkit-scrollbar { width: 6px; }
      .lea-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
      @keyframes lea-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      .lea-live-dot { animation: lea-pulse 1.6s ease-in-out infinite; }
      @keyframes lea-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .lea-fade { animation: lea-fade 0.4s ease both; }
      @keyframes lea-draw { from { width: 0; } to { width: 100%; } }
      .lea-underline { animation: lea-draw 0.9s cubic-bezier(.4,0,.2,1) 0.15s both; }
      .lea-card { transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
      .lea-card:hover { transform: translateY(-3px) rotate(-0.3deg); box-shadow: 0 10px 24px rgba(0,0,0,0.12); }
      .lea-blob { transition: transform 0.25s ease-out; }
      @keyframes lea-dash { to { stroke-dashoffset: -60; } }
      .lea-connector-line { stroke-dasharray: 5 7; animation: lea-dash 2.2s linear infinite; }
      @keyframes lea-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      .lea-bob { animation: lea-bob 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes lea-typing-dot { 0%,80%,100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
      .lea-typing-dot { animation: lea-typing-dot 1.3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes lea-mid-pulse { 0%,100% { transform: scale(1); opacity: 0.75; } 50% { transform: scale(1.35); opacity: 1; } }
      .lea-mid-pulse { animation: lea-mid-pulse 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes lea-flow {
        0% { left: 0%; opacity: 0; }
        10% { opacity: 1; }
        88% { opacity: 1; }
        100% { left: 100%; opacity: 0; }
      }
      .lea-flow-dot { position: absolute; top: 50%; transform: translateY(-50%); width: 6px; height: 6px; border-radius: 50%; animation: lea-flow 2.4s linear infinite; box-shadow: 0 0 6px 1px currentColor; }
      @keyframes lea-twinkle { 0%,100% { opacity: var(--min-op, 0.15); transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.2); } }
      .lea-star { animation: lea-twinkle ease-in-out infinite; }
      .lea-toggle-btn { transition: background 0.15s ease, color 0.15s ease; }
      @keyframes lea-glow {
        0%,100% { box-shadow: 0 0 0 0 var(--wine-dim), 0 0 24px 4px var(--wine-dim); }
        50% { box-shadow: 0 0 0 8px var(--wine-dim), 0 0 38px 10px var(--wine-dim); }
      }
      .lea-speaking { animation: lea-glow 1.1s ease-in-out infinite; }
      .lea-idle-glow { box-shadow: 0 0 30px 8px var(--wine-dim), 0 0 54px 16px var(--gold-dim); }
      @keyframes lea-ray-sweep-a { 0% { transform: rotate(-8deg) translateX(0); } 50% { transform: rotate(8deg) translateX(30px); } 100% { transform: rotate(-8deg) translateX(0); } }
      @keyframes lea-ray-sweep-b { 0% { transform: rotate(6deg) translateX(0); } 50% { transform: rotate(-10deg) translateX(-24px); } 100% { transform: rotate(6deg) translateX(0); } }
      .lea-ray-a { animation: lea-ray-sweep-a 18s ease-in-out infinite; }
      .lea-ray-b { animation: lea-ray-sweep-b 22s ease-in-out infinite; }
      @keyframes lea-orb-wave-sweep { 0% { background-position: 0% 0%; } 100% { background-position: 200% 200%; } }
      .lea-orb-wave {
        background: linear-gradient(115deg, transparent 25%, rgba(240,86,110,0.32) 48%, rgba(240,86,110,0.32) 56%, transparent 78%);
        background-size: 320% 320%;
        animation: lea-orb-wave-sweep 16s linear infinite;
        mix-blend-mode: overlay;
      }
      @keyframes lea-lean-sway { 0%, 100% { transform: rotate(-9deg); } 50% { transform: rotate(6deg); } }
      .lea-lean { animation: lea-lean-sway 2.6s ease-in-out infinite; transform-origin: 50% 100%; }
      @keyframes lea-cta-pulse {
        0% { box-shadow: 0 0 0 0 var(--wine-dim); }
        70% { box-shadow: 0 0 0 16px rgba(0,0,0,0); }
        100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
      }
      .lea-cta-pulse { animation: lea-cta-pulse 2.4s ease-out infinite; }
      @keyframes lea-orb-ring-pulse { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.7); opacity: 0; } }
      .lea-orb-ring-pulse { animation: lea-orb-ring-pulse 2.6s ease-out infinite; }
      .lea-principles-grid { display: grid; grid-template-columns: 1fr 1fr; }
      .lea-principle-cell:hover { background: var(--panel-alt); }
      @media (max-width: 620px) {
        .lea-principles-grid { grid-template-columns: 1fr; }
        .lea-principle-cell { border-right: none !important; }
      }
      @keyframes lea-float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-9px); } }
      .lea-float-card { animation: lea-float 4.5s ease-in-out infinite; }
      .lea-benefit-card { transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease; }
      .lea-benefit-card:hover { transform: translateY(-5px); box-shadow: 0 16px 32px rgba(0,0,0,0.10); border-color: var(--wine); }
      .lea-benefit-icon { transition: transform 0.25s ease; }
      .lea-benefit-card:hover .lea-benefit-icon { transform: scale(1.15) rotate(-6deg); }
      .lea-compare-row { transition: background 0.15s ease; }
      .lea-compare-row:hover { background: var(--panel-alt); }
      .lea-stat-cell { transition: background 0.2s ease, transform 0.2s ease; }
      .lea-stat-cell:hover { background: var(--wine-dim); transform: translateY(-2px); }
      @keyframes lea-heartbeat {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 var(--wine-dim); }
        8% { transform: scale(1.08); box-shadow: 0 0 26px 6px var(--wine-dim); }
        16% { transform: scale(1); box-shadow: 0 0 0 0 var(--wine-dim); }
        24% { transform: scale(1.12); box-shadow: 0 0 36px 10px var(--gold-dim); }
        36% { transform: scale(1); box-shadow: 0 0 0 0 var(--wine-dim); }
      }
      .lea-heartbeat { animation: lea-heartbeat 2.4s ease-in-out infinite; }
      @keyframes lea-ekg-run { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -670; } }
      @keyframes lea-ekg-run-r { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -510; } }
      @keyframes lea-ring-burst { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(1.9); opacity: 0; } }
      @keyframes lea-glow-pulse {
        0%, 100% { opacity: 0.25; transform: scale(0.85); }
        10% { opacity: 0.85; transform: scale(1.1); }
        20% { opacity: 0.25; transform: scale(0.85); }
        30% { opacity: 1; transform: scale(1.3); }
        45% { opacity: 0.25; transform: scale(0.85); }
      }
      .lea-glow-heartbeat { animation: lea-glow-pulse ease-in-out infinite; }
      @keyframes lea-cloud-a { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(18%,12%) scale(1.25); } 66% { transform: translate(-10%,16%) scale(0.85); } }
      @keyframes lea-cloud-b { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-16%,-14%) scale(1.3); } 66% { transform: translate(12%,-8%) scale(0.82); } }
      .lea-cloud-a { animation: lea-cloud-a ease-in-out infinite; }
      .lea-cloud-b { animation: lea-cloud-b ease-in-out infinite; }
      .lea-type-search { transition: opacity 0.3s ease, transform 0.32s cubic-bezier(.4,0,.2,1); }
      .lea-orb-interactive { position: relative; cursor: pointer; transition: transform 0.35s ease, box-shadow 0.35s ease; }
      .lea-orb-interactive:hover { transform: scale(1.14); animation-duration: 1s; }
      .lea-orb-interactive:hover .lea-orb-a { animation-duration: 4s; }
      .lea-orb-interactive:hover .lea-orb-b { animation-duration: 4.5s; }
      .lea-orb-interactive::before, .lea-orb-interactive::after {
        content: ''; position: absolute; inset: -18px; border-radius: 50%; pointer-events: none;
        border: 2px solid var(--wine); opacity: 0;
      }
      .lea-orb-interactive:hover::before { animation: lea-ping 1.1s ease-out infinite; border-color: var(--wine); }
      .lea-orb-interactive:hover::after { animation: lea-ping 1.1s ease-out 0.35s infinite; border-color: var(--gold); }
      @keyframes lea-ping { 0% { opacity: 0.7; transform: scale(0.85); } 100% { opacity: 0; transform: scale(1.7); } }
      @keyframes lea-rec { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
      .lea-rec-dot { animation: lea-rec 1.4s ease-in-out infinite; }
      @keyframes lea-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      .lea-cursor { animation: lea-blink 0.9s step-end infinite; }
      @keyframes lea-orb-a { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
      @keyframes lea-orb-b { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.97); } }
      .lea-orb-a {}
      .lea-orb-b {}
      .lea-play-btn { transition: transform 0.12s ease, background 0.12s ease; }
      .lea-play-btn:hover { transform: scale(1.06); }
    `}</style>
  );
}

function CountUp({ value, suffix = '' }) {
  const ref = useRef(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let started = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          const startTime = performance.now();
          const duration = 1100;
          function tick(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            setDisplay(Math.round(value * progress));
            if (progress < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

function TimeToFillChart() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(el); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = [
    { label: 'Industry average', value: 42, max: 42, color: 'var(--text-muted)' },
    { label: 'With Lean', value: 7, max: 42, color: 'var(--wine)' },
  ];

  return (
    <div ref={ref} style={{ maxWidth: 560, margin: '0 auto 36px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '22px 26px' }}>
      <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 18 }}>Average time to fill a role</div>
      {rows.map((row, i) => (
        <div key={i} style={{ marginBottom: i < rows.length - 1 ? 16 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text)' }}>{row.label}</span>
            <span style={{ color: row.color, fontWeight: 600 }}>~{row.value} days</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: 'var(--panel-alt)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 6, background: row.color,
              width: visible ? `${(row.value / row.max) * 100}%` : '0%',
              transition: 'width 1.1s cubic-bezier(.2,.8,.2,1)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Reveal({ children }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el); // fires once — never goes back to hidden after this
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: 'opacity 0.7s ease, transform 0.7s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color }) {
  return (
    <div className="lea-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color, marginBottom: 6, textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function FlipCard({ icon: Icon, before, after, label, detail, color, delay }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="lea-float-card" style={{ flex: 1, minWidth: 240, maxWidth: 280, animationDelay: delay }}>
      <div onClick={() => setFlipped((f) => !f)} style={{ perspective: 1000, cursor: 'pointer', height: 200 }}>
        <div style={{
          position: 'relative', width: '100%', height: '100%', transition: 'transform 0.6s cubic-bezier(.4,.2,.2,1)',
          transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none',
        }}>
          <div className="lea-glass" style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            textAlign: 'center', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
            <Icon size={22} color={color} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'line-through', marginBottom: 4 }}>{before}</div>
            <div className="lea-display" style={{ fontSize: 21, fontWeight: 700, color }}>{after}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>{label}</div>
            <div className="lea-mono" style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 16, opacity: 0.6, letterSpacing: '0.06em' }}>TAP TO LEARN MORE</div>
          </div>
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden', background: color, borderRadius: 14, padding: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', transform: 'rotateY(180deg)',
          }}>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--on-accent)' }}>{detail}</div>
          </div>
        </div>
      </div>
    </div>
  );
}


// Tracks how far an element has scrolled through the viewport as a smooth
// 0-1 value — not a one-shot "is it visible" boolean like Reveal uses, but
// a continuous value so a scroll-linked animation can track scroll position
// directly, the way SharpLink's wireframe-to-dashboard panel does.
function useScrollProgress(ref) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    function onScroll() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.95;
      const end = vh * 0.35;
      const raw = (start - rect.top) / (start - end);
      setProgress(Math.min(1, Math.max(0, raw)));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [ref]);
  return progress;
}

function ReadoutPanel({ progress }) {
  return (
    <div style={{
      position: 'relative', background: '#0D0B12', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 16, overflow: 'hidden', height: 320, maxWidth: 440, margin: '0 auto',
    }}>
      {/* wireframe state — fades out as you scroll past */}
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - progress, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 300 300" width="72%" height="72%">
          <circle cx="150" cy="150" r="92" fill="none" stroke="rgba(245,241,234,0.3)" strokeWidth="1" strokeDasharray="2 4" />
          <circle cx="150" cy="150" r="58" fill="none" stroke="rgba(245,241,234,0.45)" strokeWidth="1" />
          <line x1="150" y1="58" x2="55" y2="18" stroke="rgba(245,241,234,0.28)" strokeWidth="1" strokeDasharray="2 4" />
          <rect x="50" y="13" width="9" height="9" fill="none" stroke="rgba(245,241,234,0.4)" />
          <line x1="150" y1="242" x2="245" y2="282" stroke="rgba(245,241,234,0.28)" strokeWidth="1" strokeDasharray="2 4" />
          <rect x="240" y="277" width="9" height="9" fill="none" stroke="rgba(245,241,234,0.4)" />
          <line x1="92" y1="150" x2="20" y2="180" stroke="rgba(245,241,234,0.28)" strokeWidth="1" strokeDasharray="2 4" />
          <rect x="15" y="175" width="9" height="9" fill="none" stroke="rgba(245,241,234,0.4)" />
        </svg>
      </div>

      {/* live readout state — fades in */}
      <div style={{
        position: 'absolute', inset: 0, padding: 26, opacity: progress,
        transform: `translateY(${(1 - progress) * 14}px)`,
      }}>
        <div className="lea-mono" style={{ fontSize: 10, color: 'rgba(245,241,234,0.5)', textTransform: 'uppercase', marginBottom: 6 }}>
          Time to fill a role
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 13, color: 'rgba(245,241,234,0.4)', textDecoration: 'line-through' }}>42 days</span>
          <span className="lea-display" style={{ fontSize: 32, fontWeight: 700, color: '#F5F1EA' }}>~7 days</span>
        </div>
        <svg viewBox="0 0 300 100" width="100%" height="86" style={{ marginBottom: 16 }}>
          <polyline points="0,85 60,80 120,55 180,45 240,20 300,10" fill="none" stroke="var(--wine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="300" cy="10" r="4" fill="var(--wine)" />
        </svg>
        <div className="lea-mono" style={{ fontSize: 10, color: 'rgba(245,241,234,0.5)', textTransform: 'uppercase' }}>
          Candidate readiness — trending up
        </div>
      </div>
    </div>
  );
}

function ReadoutSection() {
  const ref = useRef(null);
  const progress = useScrollProgress(ref);
  const items = [
    { n: '01', t: 'Live from day one', d: 'No setup lag — Lean starts calibrating the moment the conversation starts.' },
    { n: '02', t: 'Every word logged', d: "Nothing gets lost between what's said and what's on record." },
    { n: '03', t: 'Trackable in real time', d: 'Watch the role profile fill in as the conversation actually happens.' },
  ];
  return (
    <div ref={ref} style={{ padding: '70px 40px', display: 'flex', gap: 56, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ flex: 1, minWidth: 280, maxWidth: 420 }}>
        <Eyebrow color="var(--gold)">From conversation to readout</Eyebrow>
        <div className="lea-display" style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', marginBottom: 14, lineHeight: 1.2 }}>
          Every conversation becomes real signal.
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 30 }}>
          What starts as a loose conversation with a hiring manager gets structured, tracked, and turned into something the whole team can actually act on.
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
            <span className="lea-mono" style={{ fontSize: 11, color: 'var(--gold)', flexShrink: 0, paddingTop: 2 }}>{item.n}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{item.t}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 280 }}>
        <ReadoutPanel progress={progress} />
      </div>
    </div>
  );
}

function PrinciplesSection() {
  const principles = [
    { icon: CheckCircle2, title: 'A human always decides', text: "Lean recommends. A hiring manager confirms every outcome — nothing is automatic.", color: 'var(--wine)' },
    { icon: MessageSquare, title: 'Feedback is mandatory', text: 'Every candidate learns what they did well and what to improve — not just the ones who advance.', color: 'var(--gold)' },
    { icon: User, title: 'Transparent by design', text: "Candidates always know they're talking with an AI hiring liaison, from the first message.", color: 'var(--wine)' },
    { icon: Sparkles, title: 'Built for fit, not filtering', text: 'Lean prepares candidates for the specific role — the goal is readiness, not a faster reject pile.', color: 'var(--gold)' },
  ];
  return (
    <div style={{ padding: '0 40px 64px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <Eyebrow color="var(--text-muted)">Principles</Eyebrow>
        <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Built with guardrails, not just features</div>
      </div>
      <div className="lea-principles-grid lea-glass" style={{ maxWidth: 840, margin: '0 auto', borderRadius: 22, overflow: 'hidden' }}>
        {principles.map((p, i) => (
          <div key={i} className="lea-principle-cell" style={{
            padding: '34px 30px',
            borderRight: i % 2 === 0 ? '1px solid var(--line)' : 'none',
            borderBottom: i < 2 ? '1px solid var(--line)' : 'none',
            transition: 'background 0.2s ease',
          }}>
            <p.icon size={22} color={p.color} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 9 }}>{p.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{p.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);
  const faqs = [
    { icon: CheckCircle2, q: 'Does a human ever review the AI\u2019s recommendation?', a: 'Always. Lean produces a recommendation and a summary, but a hiring manager has to explicitly confirm the outcome before anything happens. Nothing is decided automatically.', color: 'var(--wine)' },
    { icon: MessageSquare, q: 'What happens to a candidate who doesn\u2019t move forward?', a: 'They still get feedback — specific strengths and things to work on — automatically, the moment a decision is recorded. Every candidate, not just the ones who advance.', color: 'var(--gold)' },
    { icon: Users, q: 'Does Lean replace our interview process?', a: 'No. She handles the early conversation, role calibration, and prep — your team still runs real interviews and makes the final call.', color: 'var(--wine)' },
    { icon: Sparkles, q: 'Do candidates know they\u2019re talking to AI?', a: 'Yes, always. Lean introduces herself as an AI hiring liaison from the first message — there\u2019s no attempt to pass her off as human.', color: 'var(--gold)' },
    { icon: ClipboardList, q: 'What kinds of roles can Lean help with?', a: 'Any field — engineering, medicine, culinary, law, retail, and more. She adapts her questions and interview style to the specific role rather than using one generic script.', color: 'var(--wine)' },
    { icon: Building2, q: 'Is this ready for our whole company to use today?', a: 'Right now it\u2019s built for individual pilot use. Shared company workspaces — where multiple hiring managers see the same roles and pipeline — are on the roadmap.', color: 'var(--gold)' },
  ];
  return (
    <div style={{ padding: '0 40px 56px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Eyebrow color="var(--text-muted)">Questions</Eyebrow>
        <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Before you ask</div>
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {faqs.map((f, i) => {
          const open = openIndex === i;
          return (
            <div key={i} className="lea-benefit-card lea-glass" style={{
              border: `1px solid ${open ? f.color : 'var(--glass-border)'}`, borderRadius: 18,
              overflow: 'hidden', position: 'relative',
            }}>
              {open && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: f.color }} />}
              <button
                onClick={() => setOpenIndex(open ? null : i)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div className="lea-benefit-icon" style={{ width: 36, height: 36, borderRadius: 10, background: `${f.color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={16} color={f.color} />
                </div>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{f.q}</span>
                <span style={{ fontSize: 20, color: f.color, flexShrink: 0, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.25s ease' }}>+</span>
              </button>
              <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.35s ease' }}>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, padding: '0 18px 18px 68px' }}>
                    {f.a}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SiteFooter({ onNav }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '32px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>© {new Date().getFullYear()} Lean</div>
    </div>
  );
}

function ProductPeek() {
  const candidates = [
    { name: 'Jordan R.', score: 82, tag: 'Strong Match', summary: 'Strong systems-design background, directly relevant to the payments work this role owns.', color: 'var(--wine)' },
    { name: 'Sam K.', score: 64, tag: 'Possible Match', summary: 'Solid fundamentals but limited production experience at this scale — worth a deeper conversation.', color: 'var(--gold)' },
    { name: 'Priya M.', score: 91, tag: 'Strong Match', summary: 'Five years owning reliability for a payments system at similar scale — closest fit on paper so far.', color: 'var(--wine)' },
  ];
  const [selected, setSelected] = useState(0);
  const c = candidates[selected];
  const [view, setView] = useState('employer'); // 'employer' | 'candidate'

  const readiness = [
    { label: 'Conversation started', done: true },
    { label: 'Prep questions generated', done: true },
    { label: 'Interview scheduled', done: false },
    { label: 'Feedback received', done: false },
    { label: 'Decision received', done: false },
  ];

  return (
    <div style={{ padding: '0 40px 56px' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <Eyebrow color="var(--text-muted)">Inside the product</Eyebrow>
        <div className="lea-display" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
          {view === 'employer' ? 'What a hiring manager actually sees' : 'What a candidate actually sees'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {view === 'employer' ? 'Try it — click a candidate below' : 'A real conversation, not a form'}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, padding: 4 }}>
          {['employer', 'candidate'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: view === v ? (v === 'employer' ? 'var(--wine-dim)' : 'var(--gold-dim)') : 'transparent',
                color: view === v ? (v === 'employer' ? 'var(--wine)' : 'var(--gold)') : 'var(--text-muted)',
              }}
            >
              {v === 'employer' ? 'Hiring manager' : 'Candidate'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--panel-alt)', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--line)' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--line)' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--line)' }} />
          <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 10 }}>
            {view === 'employer' ? 'Pipeline Readout' : 'Candidate Portal'}
          </span>
        </div>

        {view === 'employer' ? (
          <div style={{ display: 'flex', background: 'var(--panel)' }}>
            <div style={{ flex: 1, padding: 18, borderRight: '1px solid var(--line)' }}>
              <div className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Candidates · 3</div>
              {candidates.map((cand, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 6,
                    background: selected === i ? 'var(--wine-dim)' : 'transparent', border: `1px solid ${selected === i ? 'var(--wine)' : 'var(--line)'}`,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', background: cand.color, color: 'var(--on-accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{cand.name[0]}</div>
                  <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: selected === i ? 600 : 400, flex: 1 }}>{cand.name}</span>
                  <span className="lea-mono" style={{ fontSize: 11, color: cand.color }}>{cand.score}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1.4, padding: 18 }}>
              <div className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Lean's recommendation for {c.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: c.color }}>{c.score}</div>
                <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{c.tag}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                {c.summary}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, padding: '7px 12px', borderRadius: 6, background: 'var(--wine)', color: 'var(--on-accent)' }}>Advance</div>
                <div style={{ fontSize: 11, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--line)', color: 'var(--text-muted)' }}>Not a fit</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Lean only recommends — a hiring manager clicks one of these to decide.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', background: 'var(--panel)' }}>
            <div style={{ flex: 1.4, padding: 18, borderRight: '1px solid var(--line)' }}>
              <div className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Talking with Lean</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <div style={{ maxWidth: '82%', background: 'var(--gold)', color: 'var(--on-accent)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
                  What's the team actually like to work with?
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ maxWidth: '85%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--text)' }}>
                  Small, senior team of 5 — high ownership, low process. On-call is shared, about once every 6 weeks.
                </div>
              </div>
            </div>
            <div style={{ flex: 1, padding: 18 }}>
              <div className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Readiness</div>
              {readiness.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, fontSize: 12, color: r.done ? 'var(--text)' : 'var(--text-muted)' }}>
                  {r.done ? <CheckCircle2 size={14} color="var(--gold)" /> : <Circle size={14} color="var(--line)" />}
                  {r.label}
                </div>
              ))}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                Same honest answers and status, every time — no guessing where you stand.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoadmapSection() {
  const items = [
    { icon: Users, text: 'Shared company workspaces — multiple hiring managers, one pipeline', color: 'var(--wine)', delay: '0s' },
    { icon: Building2, text: 'ATS integrations (Greenhouse, Lever, Workday)', color: 'var(--gold)', delay: '0.7s' },
    { icon: Calendar, text: 'Live-hosted technical interviews with side-by-side code review', color: 'var(--wine)', delay: '1.3s' },
    { icon: Volume2, text: 'Multi-language support for candidates and hiring teams', color: 'var(--gold)', delay: '0.4s' },
  ];
  return (
    <div style={{ padding: '0 40px 56px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Eyebrow color="var(--text-muted)">Where Lean is headed</Eyebrow>
        <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Built now, growing fast</div>
      </div>
      <div style={{ display: 'flex', gap: 16, maxWidth: 820, margin: '0 auto', flexWrap: 'wrap', position: 'relative' }}>
        {items.map((t, i) => (
          <div key={i} className="lea-float-card" style={{ flex: 1, minWidth: 280, animationDelay: t.delay }}>
            <div className="lea-benefit-card lea-glass" style={{
              height: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px',
              border: `1px dashed ${t.color}`, borderRadius: 18,
            }}>
              <div className="lea-benefit-icon" style={{ width: 34, height: 34, borderRadius: 9, background: `${t.color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <t.icon size={15} color={t.color} />
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4, flex: 1 }}>{t.text}</span>
              <span className="lea-mono" style={{ fontSize: 9, color: t.color, textTransform: 'uppercase', flexShrink: 0, border: `1px solid ${t.color}`, borderRadius: 12, padding: '3px 8px' }}>Soon</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClosingCTA({ onSignup }) {
  return (
    <div style={{ background: 'radial-gradient(circle at 30% 20%, var(--wine) 0%, var(--wine-deep) 75%)', padding: '60px 40px', textAlign: 'center' }}>
      <div className="lea-display" style={{ fontSize: 28, fontWeight: 600, color: 'var(--on-accent)', marginBottom: 10 }}>
        Ready to see Lean in action?
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--on-accent)', opacity: 0.85, marginBottom: 26 }}>
        No sales call required to start.
      </div>
      <button onClick={onSignup} style={{ background: 'var(--on-accent)', border: 'none', borderRadius: 8, padding: '13px 28px', fontSize: 13.5, fontWeight: 600, color: 'var(--wine)', cursor: 'pointer' }}>
        Get started
      </button>
    </div>
  );
}

function buildEkgSegment(xStart, xEnd, baseline = 72, gridStart = 0) {
  let d = '';
  let started = false;
  for (let x = gridStart; x <= 1000; x += 125) {
    if (x < xStart || x + 60 > xEnd) continue;
    if (!started) { d += `M${x},${baseline}`; started = true; }
    d += ` L${x},${baseline} L${x + 18},${baseline} L${x + 27},${baseline - 14} L${x + 36},${baseline + 14} L${x + 45},${baseline - 2} L${x + 60},${baseline}`;
  }
  return d;
}

function PulseSection({ onSignup, onOrbClick, amplitudeRef }) {
  const dimLeft = buildEkgSegment(0, 460);
  const dimRight = buildEkgSegment(565, 1000, 72, 565);
  const [phase, setPhase] = useState('left'); // left | hit | right | pause
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    function cycle() {
      if (cancelled) return;
      setPhase('left');
      timers.push(setTimeout(() => {
        if (cancelled) return;
        setPhase('hit');
        setPulseKey((k) => k + 1);
        timers.push(setTimeout(() => {
          if (cancelled) return;
          setPhase('right');
          timers.push(setTimeout(() => {
            if (cancelled) return;
            setPhase('pause');
            timers.push(setTimeout(cycle, 1100));
          }, 1150));
        }, 380));
      }, 1150));
    }
    cycle();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);

  const hit = phase === 'hit';

  function handleClick() {
    if (onOrbClick) onOrbClick();
    setPulseKey((k) => k + 1);
  }

  return (
    <div style={{ position: 'relative', background: '#15120E', padding: '72px 40px 0', overflow: 'hidden', textAlign: 'center' }}>
      <div className="lea-mono" style={{
        position: 'absolute', top: 18, right: 24, display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, color: '#8B92AC', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        <span className="lea-heartbeat" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
        Live
      </div>

      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 1000 120" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'translateY(48px)' }}>
          <path d={dimLeft} stroke="#3A3226" strokeWidth="2" fill="none" opacity="0.6" />
          <path d={dimRight} stroke="#3A3226" strokeWidth="2" fill="none" opacity="0.6" />
          {phase === 'left' && (
            <path key={`l-${pulseKey}`} d={dimLeft} stroke="var(--gold)" strokeWidth="2.5" fill="none"
              strokeDasharray="80 650" style={{ animation: 'lea-ekg-run 1.15s linear forwards' }} opacity="0.95" />
          )}
          {phase === 'right' && (
            <path key={`r-${pulseKey}`} d={dimRight} stroke="var(--gold)" strokeWidth="2.5" fill="none"
              strokeDasharray="80 650" style={{ animation: 'lea-ekg-run 1.15s linear forwards' }} opacity="0.95" />
          )}
        </svg>
        <div style={{ position: 'relative' }}>
          <Eyebrow color="var(--gold)">Always on</Eyebrow>
          <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: '#F1E9DA', maxWidth: 560, margin: '0 auto 32px' }}>
            Always listening. Always human where it counts.
          </div>
          <div style={{ position: 'relative', width: 108, height: 108, margin: '0 auto' }}>
            <div
              key={`ring-${pulseKey}`}
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--gold)',
                animation: 'lea-ring-burst 0.9s ease-out forwards', pointerEvents: 'none',
              }}
            />
            <InteractiveOrb onClick={handleClick} amplitudeRef={amplitudeRef} size={108} hit={hit} title="Hear Lean" />
          </div>
        </div>
      </div>

      <div
        className="lea-display"
        aria-hidden="true"
        style={{
          fontSize: 'min(22vw, 260px)', fontWeight: 700, textAlign: 'center', lineHeight: 0.75,
          marginTop: 48, letterSpacing: '-0.02em', userSelect: 'none',
          background: 'linear-gradient(180deg, rgba(245,241,234,0.22) 0%, rgba(245,241,234,0.04) 60%, transparent 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}
      >
        Lean
      </div>
    </div>
  );
}

function WorkspaceHomeTab({ roles, activeRoleId, setActiveRoleId, setTab, createRole, account, teamMembers }) {
  const liveCount = roles.filter((r) => r.started).length;
  return (
    <div style={{ padding: '28px 24px', maxWidth: 980, margin: '0 auto' }}>
      <div className="lea-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        {account?.company ? `${account.company}'s workspace` : 'Your workspace'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Everything you're hiring for, in one place.
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        <div className="lea-glass" style={{ flex: 1, minWidth: 140, borderRadius: 12, padding: '16px 18px' }}>
          <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Open roles</div>
          <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{roles.length}</div>
        </div>
        <div className="lea-glass" style={{ flex: 1, minWidth: 140, borderRadius: 12, padding: '16px 18px' }}>
          <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Live</div>
          <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--wine)' }}>{liveCount}</div>
        </div>
        <div className="lea-glass" style={{ flex: 1, minWidth: 140, borderRadius: 12, padding: '16px 18px' }}>
          <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Team</div>
          <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{teamMembers?.length || 1}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Roles</div>
        <button className="lea-glass-btn" onClick={createRole} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 7, padding: '8px 14px', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> New role
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="lea-glass" style={{ borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No roles yet — create your first one to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => { setActiveRoleId(r.id); setTab('hm'); }}
              className="lea-card lea-glass"
              style={{ textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer', border: r.id === activeRoleId ? '1px solid var(--wine)' : undefined }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: r.started ? 'color-mix(in srgb, var(--wine) 18%, transparent)' : 'var(--panel-alt)',
                  color: r.started ? 'var(--wine)' : 'var(--text-muted)',
                }}>
                  {r.started ? 'Live' : 'Draft'}
                </span>
                <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.createdAt}</span>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
                {r.title || 'Untitled role'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {r.team || 'No team set yet'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyProfileTab({ account, companyProfile, setCompanyProfile }) {
  const initials = (account?.company || account?.name || 'L').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div style={{ padding: '28px 24px', maxWidth: 640, margin: '0 auto' }}>
      <div className="lea-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Company profile</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
        How Lean represents your company to candidates.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--wine), var(--gold))', color: '#fff', fontSize: 22, fontWeight: 700,
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{account?.company || 'Your company'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Logo shown is a placeholder — upload isn't wired up in this demo.</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>About the company</div>
        <textarea
          value={companyProfile.description}
          onChange={(e) => setCompanyProfile((p) => ({ ...p, description: e.target.value }))}
          placeholder="A couple sentences about what the company does — candidates will see this."
          rows={3}
          style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Culture & working style</div>
        <textarea
          value={companyProfile.culture}
          onChange={(e) => setCompanyProfile((p) => ({ ...p, culture: e.target.value }))}
          placeholder="What it's actually like to work here — pace, structure, how decisions get made."
          rows={4}
          style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
    </div>
  );
}

function TeamMembersTab({ teamMembers, setTeamMembers, inviteEmail, setInviteEmail, account }) {
  function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setTeamMembers((prev) => [...(prev || []), { name: email.split('@')[0], email, role: 'Pending invite' }]);
    setInviteEmail('');
  }
  return (
    <div style={{ padding: '28px 24px', maxWidth: 640, margin: '0 auto' }}>
      <div className="lea-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Team</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Who at {account?.company || 'your company'} has access to this workspace.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
          placeholder="teammate@yourcompany.com"
          type="email"
          style={{ flex: 1, background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
        />
        <button className="lea-glass-btn" onClick={handleInvite} disabled={!inviteEmail.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 8, padding: '0 16px', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 600, cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed' }}>
          <UserPlus size={14} /> Invite
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -14, marginBottom: 20 }}>
        Demo only — this doesn't send a real email invite.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(teamMembers || []).map((m, i) => (
          <div key={i} className="lea-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: '12px 16px' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{m.email}</div>
            </div>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em',
              background: m.role === 'Owner' ? 'color-mix(in srgb, var(--wine) 18%, transparent)' : 'var(--panel-alt)',
              color: m.role === 'Owner' ? 'var(--wine)' : 'var(--text-muted)',
            }}>
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyOpeningsTab({ companyRoles, roles, account }) {
  // Falls back to the account's own roles if the company-wide fetch hasn't
  // returned anything (no Supabase configured, or nobody else has posted
  // yet) — always show something rather than an empty screen.
  const list = companyRoles.length > 0 ? companyRoles : roles;
  return (
    <div style={{ padding: '28px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div className="lea-display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        All openings at {account?.company || 'the company'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Every role across the company, and who's the hiring manager on each — not just the ones you posted.
      </div>

      {list.length === 0 ? (
        <div className="lea-glass" style={{ borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No openings yet across the company.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((r) => (
            <div key={r.id} className="lea-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: 10, padding: '14px 18px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{r.title || 'Untitled role'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.team || 'No team set yet'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Hiring manager</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{r.postedByName || r.postedByEmail || 'Unknown'}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: r.started ? 'color-mix(in srgb, var(--wine) 18%, transparent)' : 'var(--panel-alt)',
                  color: r.started ? 'var(--wine)' : 'var(--text-muted)',
                }}>
                  {r.started ? 'Live' : 'Draft'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, num, color }) {
  return (
    <button
      onClick={onClick}
      className="lea-root"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
        background: active ? 'var(--panel-alt)' : 'transparent',
        border: `1px solid ${active ? color : 'transparent'}`,
        borderBottom: active ? `2px solid ${color}` : '1px solid transparent',
        cursor: 'pointer', transition: 'all 0.15s ease', borderRadius: 6,
      }}
    >
      <span className="lea-mono" style={{ fontSize: 10, color: active ? color : 'var(--text-muted)' }}>{num}</span>
      <Icon size={16} color={active ? color : 'var(--text-muted)'} />
      <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text)' : 'var(--text-muted)', letterSpacing: '0.02em' }}>
        {label}
      </span>
    </button>
  );
}

function AnimatedChatPreview({ homeSide }) {
  const scripts = {
    employer: [
      { role: 'user', text: 'We need a backend engineer for our payments team.' },
      { role: 'assistant', text: "Got it. What would this person actually own day to day — new payment flows, or reliability of what's already live?" },
      { role: 'user', text: 'Mostly reliability — keeping things running as we scale.' },
      { role: 'assistant', text: "That's a different profile than pure feature work — I'll weight for production experience over greenfield building." },
    ],
    candidate: [
      { role: 'user', text: "What's the team actually like to work with?" },
      { role: 'assistant', text: 'Small, senior team of 5 — high ownership, low process. On-call is shared, about once every 6 weeks.' },
      { role: 'user', text: 'Is this more building new stuff, or maintaining?' },
      { role: 'assistant', text: "Mostly reliability and scaling what's live — if you like solving real production problems, this fits well." },
    ],
  };
  const script = scripts[homeSide];
  const [completed, setCompleted] = useState([]);
  const [typingPause, setTypingPause] = useState(false);
  const [liveRole, setLiveRole] = useState(null);
  const [liveText, setLiveText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    setCompleted([]);
    setTypingPause(false);
    setLiveRole(null);
    setLiveText('');

    function typeOut(msg, onDone) {
      setLiveRole(msg.role);
      setLiveText('');
      let i = 0;
      function step() {
        if (cancelled) return;
        i++;
        setLiveText(msg.text.slice(0, i));
        if (i < msg.text.length) {
          timers.push(setTimeout(step, 14 + Math.random() * 22));
        } else {
          timers.push(setTimeout(() => { if (!cancelled) onDone(); }, 550));
        }
      }
      step();
    }

    function playStep(i) {
      if (cancelled) return;
      if (i >= script.length) {
        timers.push(setTimeout(() => { if (!cancelled) { setCompleted([]); playStep(0); } }, 2600));
        return;
      }
      const msg = script[i];
      if (msg.role === 'assistant') {
        setTypingPause(true);
        timers.push(setTimeout(() => {
          if (cancelled) return;
          setTypingPause(false);
          typeOut(msg, () => {
            setCompleted((prev) => [...prev, msg]);
            setLiveRole(null);
            setLiveText('');
            timers.push(setTimeout(() => playStep(i + 1), 450));
          });
        }, 900));
      } else {
        typeOut(msg, () => {
          setCompleted((prev) => [...prev, msg]);
          setLiveRole(null);
          setLiveText('');
          timers.push(setTimeout(() => playStep(i + 1), 450));
        });
      }
    }
    playStep(0);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [homeSide]);

  const accent = homeSide === 'employer' ? 'var(--wine)' : 'var(--gold)';
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [completed, liveText, typingPause]);

  return (
    <div ref={scrollRef} style={{ height: 280, overflowY: 'auto', paddingRight: 4 }}>
      {completed.map((m, i) => (
        <ChatBubble key={i} role={m.role} text={m.text} accent={accent} />
      ))}
      {liveRole && (
        <ChatBubble role={liveRole} text={liveText + '\u258c'} accent={accent} />
      )}
      {typingPause && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 5, padding: '12px 16px', borderRadius: 10, background: 'var(--panel-alt)', border: '1px solid var(--line)' }}>
            {[0, 0.15, 0.3].map((d, i) => (
              <span key={i} className="lea-typing-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animationDelay: `${d}s` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ role, text, accent }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12, gap: 6, alignItems: 'flex-end' }}>
      <div
        style={{
          maxWidth: '80%', padding: '10px 14px', borderRadius: 10, fontSize: 14, lineHeight: 1.5,
          background: isUser ? accent : 'var(--panel-alt)',
          color: isUser ? 'var(--on-accent)' : 'var(--text)',
          border: isUser ? 'none' : '1px solid var(--line)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {text}
      </div>
      {!isUser && (
        <button
          onClick={() => speak(text)}
          title="Hear Lean say this"
          style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Volume2 size={11} color={accent} />
        </button>
      )}
    </div>
  );
}

function ProfileField({ label, value, color }) {
  const filled = Array.isArray(value) ? value.length > 0 : Boolean(value);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: filled ? color : 'var(--line)', flexShrink: 0 }} />
        <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      {filled ? (
        Array.isArray(value) ? (
          <ul style={{ margin: 0, paddingLeft: 14, fontSize: 13, color: 'var(--text)' }}>
            {value.map((v, i) => <li key={i} style={{ marginBottom: 2 }}>{v}</li>)}
          </ul>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
        )
      ) : (
        <div style={{ fontSize: 13, color: 'var(--line)' }}>— not yet captured —</div>
      )}
    </div>
  );
}

function CandidateGlyph() {
  return (
    <svg viewBox="0 0 70 90" width="52" height="66">
      <circle cx="20" cy="18" r="4" fill="var(--wine)" className="lea-typing-dot" style={{ animationDelay: '0s' }} />
      <circle cx="35" cy="12" r="4" fill="var(--wine)" className="lea-typing-dot" style={{ animationDelay: '0.2s' }} />
      <circle cx="50" cy="18" r="4" fill="var(--wine)" className="lea-typing-dot" style={{ animationDelay: '0.4s' }} />
      <rect x="16" y="46" width="38" height="40" rx="15" fill="var(--wine)" opacity="0.35" />
      <circle cx="35" cy="34" r="15" fill="var(--wine)" opacity="0.62" />
    </svg>
  );
}

function EmployerGlyph() {
  return (
    <svg viewBox="0 0 70 90" width="52" height="66">
      <defs>
        <clipPath id="caseClip"><rect x="8" y="36" width="54" height="38" rx="6" /></clipPath>
      </defs>
      <rect x="28" y="25" width="14" height="12" rx="3" fill="none" stroke="var(--gold)" strokeWidth="4" opacity="0.55" />
      <rect x="8" y="36" width="54" height="38" rx="6" fill="var(--gold)" opacity="0.28" />
      <rect x="8" y="36" width="54" height="15" fill="var(--gold)" opacity="0.4" clipPath="url(#caseClip)" />
      <rect x="26" y="45" width="18" height="11" rx="2.5" fill="var(--panel)" stroke="var(--gold)" strokeWidth="2" opacity="0.75" />
      <rect x="33" y="49" width="4" height="3" rx="1" fill="var(--gold)" opacity="0.75" />
      <circle cx="14" cy="68" r="1.6" fill="var(--gold)" opacity="0.5" />
      <circle cx="56" cy="68" r="1.6" fill="var(--gold)" opacity="0.5" />
    </svg>
  );
}

function HeroGreeting() {
  const lines = [
    "Hi, I'm Lean.",
    "I sit between hiring teams and candidates.",
    "Ask me anything — I'll give it to you straight.",
  ];
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timers = [];
    function type(i, charI) {
      if (cancelled) return;
      const full = lines[i];
      setText(full.slice(0, charI));
      if (charI < full.length) {
        timers.push(setTimeout(() => type(i, charI + 1), 38));
      } else {
        timers.push(setTimeout(() => erase(i, full.length), 1900));
      }
    }
    function erase(i, charI) {
      if (cancelled) return;
      setText(lines[i].slice(0, charI));
      if (charI > 0) {
        timers.push(setTimeout(() => erase(i, charI - 1), 16));
      } else {
        timers.push(setTimeout(() => type((i + 1) % lines.length, 0), 250));
      }
    }
    type(0, 0);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);

  return (
    <span>
      {text}<span className="lea-cursor" style={{ display: 'inline-block', marginLeft: 2 }}>▌</span>
    </span>
  );
}

function FlowLine({ color }) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 50, height: 2, background: 'repeating-linear-gradient(to right, var(--line) 0 6px, transparent 6px 12px)' }}>
      <span className="lea-flow-dot" style={{ left: 0, background: color, color, animationDelay: '0s' }} />
      <span className="lea-flow-dot" style={{ left: 0, background: color, color, animationDelay: '1.2s' }} />
      <span className="lea-flow-dot" style={{ left: 0, background: color, color, animationDelay: '0.6s', animationDirection: 'reverse' }} />
    </div>
  );
}

// A flowing, blended-color waveform ribbon — same visual family as Apple's
// Siri indicator, built from layered blurred bars in Lean's wine/gold/cream
// palette instead of Siri's blue/pink/green. `speaking` drives amplitude and
// speed so it visibly reacts to real "Lean is talking" state, not just a
// decorative loop.
// The hero orb, now tracking the cursor — the whole circle drifts a few
// pixels toward wherever the mouse is, falling off smoothly the further
// away the cursor gets, so it reads as "paying attention" rather than
// mechanically snapping to a position. The parallax motion is applied to a
// wrapping div rather than the orb itself, since the orb's own classes
// already animate its glow and hover scale — keeping them on separate
// elements means neither fights the other for control of `transform`.
// Floating particles drifting slowly upward like embers/stars, looping back
// to the bottom once they drift off the top, each twinkling gently via its
// own opacity pulse so they don't all flicker in unison.
function HeroParticles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let raf;
    let w = 0, h = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#F0566E', '#7B9FFF', '#F5F1EA'];
    const particles = Array.from({ length: 46 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 1 + Math.random() * 2.2,
      speed: 0.008 + Math.random() * 0.014,
      twinkleSpeed: 0.6 + Math.random() * 1.4,
      twinklePhase: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      drift: (Math.random() - 0.5) * 0.15,
    }));

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const time = t / 1000;
      // The orb sits horizontally centered, roughly 276px from the top of
      // the hero (below the "Your hiring liaison" label). Particles fade
      // out as they approach it — soft-edged, not a hard cutoff — so they
      // read as passing behind it rather than just vanishing at a line.
      const orbCenterX = w / 2;
      const orbCenterY = 276;
      const orbRadius = 155;
      const fadeStart = 210;
      particles.forEach((p) => {
        p.y -= p.speed * 0.006;
        if (p.y < -0.02) p.y = 1.02;
        const x = (p.x + Math.sin(time * 0.3 + p.twinklePhase) * p.drift * 0.05) * w;
        const y = p.y * h;
        const twinkle = 0.35 + Math.abs(Math.sin(time * p.twinkleSpeed + p.twinklePhase)) * 0.5;
        const distFromOrb = Math.hypot(x - orbCenterX, y - orbCenterY);
        const orbFade = Math.min(1, Math.max(0, (distFromOrb - orbRadius) / (fadeStart - orbRadius)));
        if (orbFade <= 0) return;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = twinkle * orbFade;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

// A subtle animated film-grain texture — SVG turbulence noise, redrawn with
// a new random seed a few times a second, low enough opacity that it reads
// as texture rather than visible static.
function GrainOverlay() {
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setSeed((s) => (s % 9) + 1), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.16, mixBlendMode: 'overlay' }}>
      <filter id="lea-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#lea-grain)" />
    </svg>
  );
}

// A couple of soft, wide light beams slowly sweeping across the hero —
// heavily blurred gradient bars rotating at different, very slow speeds.
function LightRays() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div className="lea-ray-a" style={{
        position: 'absolute', top: '-40%', left: '10%', width: 260, height: '180%',
        background: 'linear-gradient(180deg, transparent, rgba(240,86,110,0.42), transparent)',
        filter: 'blur(26px)', transformOrigin: 'center',
      }} />
      <div className="lea-ray-b" style={{
        position: 'absolute', top: '-40%', right: '15%', width: 220, height: '180%',
        background: 'linear-gradient(180deg, transparent, rgba(123,159,255,0.4), transparent)',
        filter: 'blur(26px)', transformOrigin: 'center',
      }} />
    </div>
  );
}


function InteractiveOrb({ onClick, amplitudeRef, size = 300, hit = false, title = 'Say hi' }) {
  const wrapRef = useRef(null);
  const breathRef = useRef(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const glanceRef = useRef({ x: 0, y: 0, nextAt: 3 + Math.random() * 4 });
  const breathStateRef = useRef({ cycleLen: 4.5 + Math.random() * 1.5, ampVariation: 1, cycled: false });
  const smoothedAmpRef = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const breath = breathRef.current;
    if (!wrap || !breath) return;

    function handleMove(e) {
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 480; // beyond this, the orb stops reacting at all
      const strength = Math.max(0, 1 - dist / maxDist);
      const reach = size / 300; // smaller orbs drift a proportionally smaller distance
      targetRef.current = {
        x: Math.max(-20, Math.min(20, dx * 0.06 * strength)) * reach,
        y: Math.max(-20, Math.min(20, dy * 0.06 * strength)) * reach,
      };
    }

    let raf;
    let lastTime = performance.now();
    let elapsed = 0; // accumulates only in small, clamped steps — never jumps
    function tick(now) {
      // Cap the per-frame time step. Without this, if the tab is
      // backgrounded (switching tabs, a notification stealing focus, the
      // OS deprioritizing a hidden tab) and comes back, the real gap since
      // the last frame could be seconds or minutes — treating that as a
      // single instant step would make every cycle (breathing, glance,
      // blink) suddenly jump to wherever that much elapsed time says it
      // should be. Capping it means the animation just continues smoothly
      // from where it was, no matter how long the tab was away.
      const rawDelta = (now - lastTime) / 1000;
      const delta = Math.min(rawDelta, 0.1);
      lastTime = now;
      elapsed += delta;
      const t = elapsed;

      // --- position: mouse-follow, plus an occasional "glance" toward a
      // random point at irregular intervals, like attention shifting even
      // while idle. Both combine into one smoothed position. ---
      const glance = glanceRef.current;
      if (t > glance.nextAt) {
        glance.x = (Math.random() - 0.5) * 36 * (size / 300);
        glance.y = (Math.random() - 0.5) * 24 * (size / 300);
        glance.nextAt = t + 4 + Math.random() * 6;
      }
      glance.x *= 0.985;
      glance.y *= 0.985;

      const cur = currentRef.current, tgt = targetRef.current;
      cur.x += (tgt.x + glance.x - cur.x) * 0.1;
      cur.y += (tgt.y + glance.y - cur.y) * 0.1;
      wrap.style.transform = `translate(-50%, -50%) translate(${cur.x}px, ${cur.y}px)`;

      // --- breathing: continuous scale pulse, but each cycle's length and
      // depth vary slightly so it doesn't feel like a perfect metronome. ---
      const b = breathStateRef.current;
      const breathPhase = (t % b.cycleLen) / b.cycleLen;
      if (breathPhase < 0.02 && !b.cycled) {
        b.cycleLen = 4.5 + Math.random() * 1.5;
        b.ampVariation = 0.8 + Math.random() * 0.4;
        b.cycled = true;
      } else if (breathPhase > 0.05) {
        b.cycled = false;
      }
      const breathScale = 1 + Math.sin(breathPhase * Math.PI * 2) * 0.035 * b.ampVariation;

      // --- voice amplitude: while actually speaking, real audio level
      // (from the live playback analyser) adds an extra scale boost on
      // top of breathing, so motion actually matches what's being said. ---
      const rawAmpValue = (amplitudeRef && amplitudeRef.current) || 0;
      const rawAmp = Number.isFinite(rawAmpValue) ? rawAmpValue : 0; // guards against any bad/NaN reading causing a visible snap
      const smoothing = rawAmp > smoothedAmpRef.current ? 0.35 : 0.08; // rises quickly, falls gently
      smoothedAmpRef.current += (rawAmp - smoothedAmpRef.current) * smoothing;
      const amp = smoothedAmpRef.current;
      const ampScale = 1 + amp * 0.16;

      breath.style.transform = `scale(${breathScale * ampScale})`;

      raf = requestAnimationFrame(tick);
    }
    window.addEventListener('mousemove', handleMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => { window.removeEventListener('mousemove', handleMove); cancelAnimationFrame(raf); };
  }, [amplitudeRef, size]);

  const blurAmount = Math.round(size * 0.153); // scales proportionally — 46px at the hero's 300px size
  const circleMask = 'radial-gradient(circle, black 99%, transparent 100%)';

  return (
    <div ref={wrapRef} style={{ position: 'absolute', top: '50%', left: '50%', width: size, height: size }}>
      <div ref={breathRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          className="lea-idle-glow lea-orb-interactive"
          onClick={onClick}
          title={title}
          style={{
            width: hit ? size * 1.185 : size, height: hit ? size * 1.185 : size,
            borderRadius: '50%', background: 'rgba(255,255,255,0.03)',
            border: '2px solid var(--wine)', overflow: 'hidden', position: 'relative', flexShrink: 0,
            // explicit circular mask — overflow:hidden + border-radius alone
            // doesn't reliably clip a blurred child to a perfect circle in
            // every browser, which is what was showing as a square edge
            maskImage: circleMask, WebkitMaskImage: circleMask,
            boxShadow: hit ? '0 0 46px 14px var(--wine-dim), 0 0 66px 20px var(--gold-dim)' : undefined,
            transition: 'width 0.3s cubic-bezier(.2,.8,.2,1), height 0.3s cubic-bezier(.2,.8,.2,1), box-shadow 0.3s ease, transform 0.35s ease',
          }}
        >
          <span className="lea-orb-ring-pulse" style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid var(--wine)', pointerEvents: 'none' }} />
          <div className="lea-orb-a" style={{ position: 'absolute', width: '86%', height: '86%', top: '-7%', left: '-7%', borderRadius: '50%', background: 'var(--wine)', filter: `blur(${blurAmount}px)`, opacity: 0.92 }} />
          <div className="lea-orb-b" style={{ position: 'absolute', width: '86%', height: '86%', bottom: '-7%', right: '-7%', borderRadius: '50%', background: 'var(--gold)', filter: `blur(${blurAmount}px)`, opacity: 0.92 }} />
        </div>
      </div>
    </div>

  );
}

// A vertical, persistent version of the same waveform technique — runs the
// full height of the screen along one edge, tapering at the very top and
// bottom instead of left and right. Fixed-position, so it stays put as the
// page scrolls, always visibly "alive" the way Siri's waveform never really
// stops moving while she's listening.
function VerticalWaveform({ side = 'left' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let raf;
    let w = 0, h = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const time = t / 1000;
      const midX = w / 2;

      // One unified wave: a single centerline that drifts gently left and
      // right, with the band's WIDTH pulsing up and down like a real
      // amplitude envelope (several summed sine waves so it doesn't feel
      // like a mechanical single frequency). Only one shape, one fill — no
      // separate strands to cross each other and read as "wires."
      function centerAt(y) {
        const ny = y / h;
        const taper = Math.sin(ny * Math.PI); // pinches to a point at top and bottom
        return midX + Math.sin(ny * Math.PI * 2.2 + time * 0.55) * w * 0.22 * taper;
      }
      function widthAt(y) {
        const ny = y / h;
        const taper = Math.sin(ny * Math.PI);
        const envelope =
          Math.sin(ny * Math.PI * 5 + time * 1.1) * 0.5 +
          Math.sin(ny * Math.PI * 9 - time * 0.8) * 0.3 +
          Math.sin(ny * Math.PI * 2.3 + time * 1.4) * 0.4;
        return w * 0.14 * taper * (0.55 + Math.abs(envelope) * 0.6);
      }

      ctx.beginPath();
      for (let y = 0; y <= h; y += 5) {
        const x = centerAt(y) - widthAt(y);
        if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let y = h; y >= 0; y -= 5) {
        const x = centerAt(y) + widthAt(y);
        ctx.lineTo(x, y);
      }
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0.0, 'rgba(74,111,227,0)');
      gradient.addColorStop(0.15, '#4A6FE3');
      gradient.addColorStop(0.35, '#F0566E');
      gradient.addColorStop(0.5, '#4ECDC4');
      gradient.addColorStop(0.65, '#F0D264');
      gradient.addColorStop(0.85, '#F5F1EA');
      gradient.addColorStop(1.0, 'rgba(245,241,234,0)');
      ctx.fillStyle = gradient;
      ctx.shadowColor = 'rgba(240,86,110,0.5)';
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.88;
      ctx.fill();

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, [side]: 0, width: 96, height: '100vh',
        pointerEvents: 'none', zIndex: 5,
      }}
    />
  );
}


function LeanWaveform({ height = 90 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let raf;
    let w = 0, h = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // Three translucent ribbons, each the sum of two sine waves at
    // different frequencies so the shape reads as organic rather than a
    // perfect repeating loop — drawn with additive blending so overlaps
    // brighten and blend like real light, the same effect the reference
    // waveform relies on.
    const ribbons = [
      { color: '#F0566E', freq1: 1.3, freq2: 2.1, amp: 0.34, speed: 1.6, phase: 0 },
      { color: '#7B9FFF', freq1: 1.7, freq2: 2.6, amp: 0.4, speed: 1.9, phase: 2 },
      { color: '#E8C9A8', freq1: 1.1, freq2: 3.1, amp: 0.28, speed: 1.3, phase: 4 },
    ];

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const time = t / 1000;
      const midY = h / 2;

      ribbons.forEach((r) => {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const nx = x / w; // 0..1
          // taper toward both ends so it pinches to a point, like the reference
          const taper = Math.sin(nx * Math.PI);
          const y = midY
            + Math.sin(nx * Math.PI * r.freq1 + time * r.speed + r.phase) * r.amp * h * taper
            + Math.sin(nx * Math.PI * r.freq2 - time * r.speed * 0.7 + r.phase) * r.amp * 0.4 * h * taper;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
      });

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 340, height, display: 'block', margin: '0 auto' }} />;
}

function LogoMark({ size = 30, animate = true }) {
  return (
    <svg width={size} height={size} viewBox="5 3 22 26" className={animate ? 'lea-lean' : ''} style={{ flexShrink: 0 }}>
      <rect x="7" y="5" width="7" height="22" rx="3.5" fill="var(--wine)" />
      <rect x="7" y="20.5" width="18" height="6.5" rx="3.25" fill="var(--gold)" />
    </svg>
  );
}

function Wordmark({ size = 19, animated = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <LogoMark size={size >= 20 ? 34 : 28} />
      <div>
        <div className="lea-signature" style={{ fontSize: size, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Lean</div>
        <div
          className={animated ? 'lea-underline' : ''}
          style={{ height: 1.5, background: 'var(--wine)', width: animated ? undefined : '60%', opacity: 0.5, marginTop: 1 }}
        />
      </div>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="lea-toggle-btn"
      style={{
        width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--line)',
        background: 'var(--panel-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={14} color="var(--gold)" /> : <Moon size={14} color="var(--wine)" />}
    </button>
  );
}

export default function LeanApp() {
  const [theme, setTheme] = useState('dark');
  const scrollThemeVars = useScrollBg(theme);
  const heroOrbAmplitudeRef = useRef(0);
  const pulseOrbAmplitudeRef = useRef(0);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [geminiKeySet, setGeminiKeySet] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [liveVoiceActive, setLiveVoiceActive] = useState(false);
  const [liveVoiceConnecting, setLiveVoiceConnecting] = useState(false);
  const [liveVoiceError, setLiveVoiceError] = useState(null);
  const [liveVoiceTranscript, setLiveVoiceTranscript] = useState([]);
  const geminiSessionRef = useRef(null);
  const [screen, setScreen] = useState('home'); // home | practice | signupType | authForm | employerHome | candidateHome
  const [homeSide, setHomeSide] = useState('employer');
  const [heroMouse, setHeroMouse] = useState({ x: 0, y: 0 });

  const [tab, setTab] = useState('workspace');
  const [companyProfile, setCompanyProfile] = useState({ description: '', culture: '' });
  const [teamMembers, setTeamMembers] = useState(null); // lazily seeded with the account holder once account loads
  const [inviteEmail, setInviteEmail] = useState('');
  const [dashboardView, setDashboardView] = useState('list'); // 'list' | 'compare'

  const [roles, setRoles] = useState([]); // every open role this employer is hiring for
  const [allOpenRoles, setAllOpenRoles] = useState([]); // the shared job board — every company's open roles, from Supabase
  const [activeRoleId, setActiveRoleId] = useState(null); // which role is currently open in Calibrate/Dashboard
  const [hmInput, setHmInput] = useState('');
  const [hmLoading, setHmLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const hmScrollRef = useRef(null);

  const [candInput, setCandInput] = useState('');
  const [candidates, setCandidates] = useState([]); // the pipeline: every candidate who has talked to Lean for this role
  const [activeCandidateId, setActiveCandidateId] = useState(null); // which candidate record the current candidate-side conversation is
  const [selectedPipelineId, setSelectedPipelineId] = useState(null); // which candidate the hiring manager is viewing
  const candScrollRef = useRef(null);

  const [candidateHomeTab, setCandidateHomeTab] = useState('find'); // 'find' | 'applications'
  const [candidateHomeView, setCandidateHomeView] = useState('hub'); // 'hub' | 'conversation'

  // Practice mode
  const [practiceCategoryKey, setPracticeCategoryKey] = useState(null);
  const [practiceTypeKey, setPracticeTypeKey] = useState(null);
  const [practiceFieldQuery, setPracticeFieldQuery] = useState('');
  const [practiceFieldDropdownOpen, setPracticeFieldDropdownOpen] = useState(false);
  const [practiceTypeQuery, setPracticeTypeQuery] = useState('');
  const [practiceTypeDropdownOpen, setPracticeTypeDropdownOpen] = useState(false);
  const [practiceStarted, setPracticeStarted] = useState(false);
  const [practiceMessages, setPracticeMessages] = useState([]);
  const [practiceInput, setPracticeInput] = useState('');
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceCode, setPracticeCode] = useState('');
  const [practiceFeedback, setPracticeFeedback] = useState(null);
  const [practiceFeedbackLoading, setPracticeFeedbackLoading] = useState(false);
  const [leanSpeaking, setLeanSpeaking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micConsent, setMicConsent] = useState(false);
  const [practiceDifficulty, setPracticeDifficulty] = useState('Mid-level');
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Unified account — one login, typed at signup
  const [account, setAccount] = useState(null); // null | { type: 'employer'|'candidate', name, email, company?, resume? }
  const [accountChecked, setAccountChecked] = useState(false);

  useEffect(() => {
    if (account?.type === 'employer' && !teamMembers) {
      setTeamMembers([{ name: account.name, email: account.email, role: 'Owner' }]);
    }
  }, [account, teamMembers]);
  const [signupType, setSignupType] = useState(null); // 'employer' | 'candidate' — chosen before the auth form
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authCompany, setAuthCompany] = useState('');
  const [authResume, setAuthResume] = useState('');
  const [ssoPhase, setSsoPhase] = useState(null); // null | 'redirecting' | 'explain'
  const [ssoCompany, setSsoCompany] = useState('');

  const [micError, setMicError] = useState(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const practiceScrollRef = useRef(null);

  useEffect(() => {
    if (hmScrollRef.current) hmScrollRef.current.scrollTop = hmScrollRef.current.scrollHeight;
  }, [roles, activeRoleId]);
  useEffect(() => {
    if (candScrollRef.current) candScrollRef.current.scrollTop = candScrollRef.current.scrollHeight;
  }, [candidates, activeCandidateId]);
  useEffect(() => {
    if (!selectedPipelineId && candidates.length > 0) {
      setSelectedPipelineId(candidates[candidates.length - 1].id);
    }
  }, [candidates, selectedPipelineId]);
  useEffect(() => {
    if (!activeRoleId && roles.length > 0) {
      setActiveRoleId(roles[roles.length - 1].id);
    }
  }, [roles, activeRoleId]);
  useEffect(() => {
    if (practiceScrollRef.current) practiceScrollRef.current.scrollTop = practiceScrollRef.current.scrollHeight;
  }, [practiceMessages]);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setMicSupported(Boolean(SR));
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    // Trigger an initial load — on Chrome this returns [] the first time,
    // then fires 'voiceschanged' once the real list is ready.
    window.speechSynthesis.getVoices();
    const onVoicesChanged = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
  }, []);

  useEffect(() => {
    (async () => {
      const result = await storage.get('anthropicApiKey');
      setApiKeySet(Boolean(result?.value));
      const geminiResult = await storage.get('geminiApiKey');
      setGeminiKeySet(Boolean(geminiResult?.value));
    })();
  }, []);

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    await storage.set('anthropicApiKey', apiKeyInput.trim());
    setApiKeySet(true);
    setApiKeyInput('');
    setShowApiKeyModal(false);
  }

  async function clearApiKey() {
    await storage.delete('anthropicApiKey');
    setApiKeySet(false);
  }

  async function saveGeminiKey() {
    if (!geminiKeyInput.trim()) return;
    await storage.set('geminiApiKey', geminiKeyInput.trim());
    setGeminiKeySet(true);
    setGeminiKeyInput('');
  }

  async function clearGeminiKey() {
    await storage.delete('geminiApiKey');
    setGeminiKeySet(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const result = await storage.get('lean-account');
        const parsed = result?.value ? JSON.parse(result.value) : null;
        setAccount(parsed);
      } catch (e) {
        setAccount(null);
      } finally {
        setAccountChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!account || account.type !== 'employer' || !supabaseReady) return;
    (async () => {
      try {
        const rows = await getRolesForEmployer(account.email);
        setRoles(rows.map(mapDbRoleToAppRole));
      } catch (e) {
        // Supabase not reachable — the employer just starts with an empty local list
      }
    })();
  }, [account]);

  const [companyRoles, setCompanyRoles] = useState([]);
  useEffect(() => {
    if (!account || account.type !== 'employer' || !account.company || !supabaseReady) return;
    (async () => {
      try {
        const rows = await getRolesForCompany(account.company);
        setCompanyRoles(rows.map(mapDbRoleToAppRole));
      } catch (e) {
        // Supabase not reachable, or the join failed — company-wide view
        // just falls back to showing this account's own roles below
      }
    })();
  }, [account]);

  useEffect(() => {
    if (!account || account.type !== 'candidate' || !supabaseReady) return;
    (async () => {
      try {
        const rows = await getOpenRoles();
        setAllOpenRoles(rows.map(mapDbRoleToAppRole));
      } catch (e) {
        // Supabase not reachable — falls back to whatever roles exist locally
      }
    })();
  }, [account]);


  useEffect(() => {
    if (!account) { setPracticeHistory([]); setHistoryLoading(false); return; }
    setHistoryLoading(true);
    (async () => {
      try {
        const result = await storage.get(`practice-history:${account.email}`);
        const parsed = result?.value ? JSON.parse(result.value) : [];
        setPracticeHistory(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        setPracticeHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [account]);


  const activeRole = roles.find((r) => r.id === activeRoleId) || null;
  const openRoles = allOpenRoles.length > 0 ? allOpenRoles : roles.filter((r) => r.title && r.team); // roles Lean has enough to represent to candidates
  const activeCandidate = candidates.find((c) => c.id === activeCandidateId) || null;
  const candidateRole = roles.find((r) => r.id === activeCandidate?.roleId) || allOpenRoles.find((r) => r.id === activeCandidate?.roleId) || null;
  const roleCandidates = candidates.filter((c) => c.roleId === activeRoleId);
  const pipelineCandidate = candidates.find((c) => c.id === selectedPipelineId) || null;
  const vars = theme === 'dark' ? {
    '--bg': '#0E1220', '--panel': '#171B2C', '--panel-alt': '#1E2338', '--line': '#2C3350',
    '--text': '#EDEFF5', '--text-muted': '#8B92AC',
    '--wine': '#F0566E', '--wine-deep': '#B8264A', '--wine-dim': 'rgba(240,86,110,0.18)', '--wine-glow': 'rgba(240,86,110,0.55)',
    '--gold': '#7B9FFF', '--gold-deep': '#2947C4', '--gold-dim': 'rgba(123,159,255,0.18)', '--gold-glow': 'rgba(123,159,255,0.55)',
    '--danger': '#FF9152', '--on-accent': '#10131F',
    '--glass-bg': 'rgba(23,27,44,0.5)', '--glass-border': 'rgba(255,255,255,0.09)', '--glass-highlight': 'rgba(255,255,255,0.06)', '--glass-sheen': 'rgba(255,255,255,0.14)',
    '--grid-line': 'rgba(255,255,255,0.03)',
  } : {
    '--bg': '#F4F6FA', '--panel': '#FFFFFF', '--panel-alt': '#ECEFF5', '--line': '#D8DEE9',
    '--text': '#14161F', '--text-muted': '#666E82',
    '--wine': '#BB1F42', '--wine-deep': '#7A1230', '--wine-dim': 'rgba(187,31,66,0.10)', '--wine-glow': 'rgba(187,31,66,0.4)',
    '--gold': '#2947C4', '--gold-deep': '#152C82', '--gold-dim': 'rgba(41,71,196,0.10)', '--gold-glow': 'rgba(41,71,196,0.4)',
    '--danger': '#E0632E', '--on-accent': '#FFFFFF',
    '--glass-bg': 'rgba(255,255,255,0.5)', '--glass-border': 'rgba(255,255,255,0.6)', '--glass-highlight': 'rgba(255,255,255,0.35)', '--glass-sheen': 'rgba(255,255,255,0.55)',
    '--grid-line': 'rgba(20,22,31,0.045)',
  };

  function updateRole(id, changes) {
    setRoles((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const computed = typeof changes === 'function' ? changes(r) : changes;
      if (supabaseReady) {
        dbUpdateRole(id, toDbRoleChanges(computed)).catch(() => {
          // best-effort background sync — local state already has the change
        });
      }
      return { ...r, ...computed };
    }));
  }

  async function createRole() {
    if (supabaseReady && account?.email) {
      try {
        const row = await dbCreateRole(account.email, account.company || '');
        const newRole = mapDbRoleToAppRole(row);
        setRoles((prev) => [...prev, newRole]);
        setActiveRoleId(newRole.id);
        setTab('hm');
        return;
      } catch (e) {
        // Supabase not reachable — fall through to a local-only role below
      }
    }
    const id = `${Date.now()}`;
    const newRole = {
      id, title: '', team: '', tasks: [], mustHaves: [], culture: '', stages: [],
      company: account?.company || '',
      started: false,
      hmMessages: [{ role: 'assistant', text: "Hi — I'm Lean. Tell me about the role you're hiring for. Start wherever's easiest: the job title, the team, or what the person would actually be doing day to day." }],
      createdAt: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
    };
    setRoles((prev) => [...prev, newRole]);
    setActiveRoleId(id);
    setTab('hm');
  }

  async function sendHm(spokenText) {
    const source = typeof spokenText === 'string' ? spokenText : hmInput;
    if (!source.trim() || hmLoading || !activeRole) return;
    stopListening();
    const id = activeRole.id;
    const newMsgs = [...activeRole.hmMessages, { role: 'user', text: source.trim() }];
    updateRole(id, { hmMessages: newMsgs });
    setHmInput('');
    setHmLoading(true);
    const system = `You are Lean, an AI hiring liaison helping ${account?.name || 'a hiring manager'} at ${account?.company || 'their company'} describe an open role in their own words, conversationally — like a recruiter on a real intake call, not a form. Ask one focused follow-up question at a time until you understand: job title, what the team does, day-to-day tasks/responsibilities, must-have skills, team culture/vibe, and interview stages. Keep replies short (2-4 sentences), warm, and human — never robotic. Once you have a reasonably full picture, mention they can hit 'Sync Profile' whenever they're ready.`;
    const apiMsgs = newMsgs.map((m) => ({ role: m.role, content: m.text }));
    const reply = await callClaude(apiMsgs, system);
    updateRole(id, (r) => ({ hmMessages: [...r.hmMessages, { role: 'assistant', text: reply }] }));
    setHmLoading(false);
    speak(reply, sendHm);
  }

  function startCalibration() {
    if (!activeRole) return;
    updateRole(activeRole.id, { started: true });
    const opener = activeRole.hmMessages[activeRole.hmMessages.length - 1]?.text;
    speak(opener, sendHm);
  }

  async function startLiveVoice() {
    if (!activeRole || liveVoiceConnecting || liveVoiceActive) return;
    updateRole(activeRole.id, { started: true });
    const geminiKeyResult = await storage.get('geminiApiKey');
    const geminiKey = geminiKeyResult?.value;
    if (!geminiKey) {
      setLiveVoiceError('No Gemini key saved — add one in the key icon (top right) first.');
      return;
    }
    setLiveVoiceError(null);
    setLiveVoiceConnecting(true);
    setLiveVoiceTranscript([]);

    const system = `You are Lean, an AI hiring liaison having a real-time spoken conversation with ${account?.name || 'a hiring manager'} at ${account?.company || 'their company'} to understand a role they're hiring for. Ask one focused follow-up question at a time — job title, what the team does, day-to-day responsibilities, must-have skills, team culture, and interview stages. Sound warm and human, like a real recruiter on a call, not a script. Keep responses short and conversational. Open by greeting them and asking what role they're hiring for. If there's ever a pause before you respond, or the person says something like "sorry, one sec" or "hold on," react naturally the way a real recruiter on a call would — a quick "no worries, take your time" or "sure, I'm just jotting that down" — rather than going silent or restarting the question.`;

    const session = new GeminiLiveSession({
      apiKey: geminiKey,
      systemInstruction: system,
      voiceName: 'Sulafat', // "Warm" per Google's voice list — friendlier than Kore's "Firm"
      onOpen: async () => {
        setLiveVoiceConnecting(false);
        setLiveVoiceActive(true);
        try {
          await session.startMic();
        } catch (e) {
          setLiveVoiceError('Could not access your microphone — check your browser permissions.');
        }
      },
      onError: () => {
        setLiveVoiceConnecting(false);
        setLiveVoiceActive(false);
        setLiveVoiceError('Connection to Gemini failed — check your key and try again.');
      },
      onClose: () => {
        setLiveVoiceActive(false);
        setLiveVoiceConnecting(false);
      },
      onSpeakingChange: setLeanSpeaking,
      onListeningChange: setIsListening,
      onTranscript: (role, textDelta) => {
        setLiveVoiceTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            return [...prev.slice(0, -1), { role, text: last.text + textDelta }];
          }
          return [...prev, { role, text: textDelta }];
        });
      },
    });

    geminiSessionRef.current = session;
    try {
      await session.connect();
    } catch (e) {
      setLiveVoiceConnecting(false);
      setLiveVoiceError('Connection to Gemini failed — check your key and try again.');
    }
  }

  function stopLiveVoice() {
    if (geminiSessionRef.current) {
      geminiSessionRef.current.disconnect();
      geminiSessionRef.current = null;
    }
    setLiveVoiceActive(false);
    setLiveVoiceConnecting(false);
    setLeanSpeaking(false);
    setIsListening(false);
  }

  // A quick "hey" in Lean's actual voice (same Gemini session/voice as the
  // live conversation) — connects just long enough to say one line, then
  // disconnects. Not a full conversation, no mic, no browser TTS.
  async function sayHeyWithLeanVoice() {
    const geminiKeyResult = await storage.get('geminiApiKey');
    const geminiKey = geminiKeyResult?.value;
    if (!geminiKey) return; // no key configured — nothing to say with

    // A random category each click, not just "tell me a fact" every time —
    // models tend to gravitate toward the same handful of "greatest hits"
    // facts if asked the same generic prompt repeatedly, so picking the
    // topic client-side makes the variety far more reliable.
    const factTopics = [
      'outer space', 'the ocean', 'ancient history', 'animals', 'the human body',
      'geography', 'science', 'famous inventions', 'language and words', 'food and cooking',
      'insects', 'weather', 'the human brain', 'plants', 'music', 'numbers and math',
    ];
    const topic = factTopics[Math.floor(Math.random() * factTopics.length)];

    // Same reasoning applies to HOW she opens, not just what topic she
    // picks — a fixed "Hi, I'm Lean!" then straight into the fact reads as
    // a script. These are style examples for the model to riff on, not
    // lines to recite verbatim, so the transition into the fact varies too.
    const openerStyles = [
      `Hi, I'm Lean! While I'm here, did you know...`,
      `Heyo, I'm Lean — let me hit you with a fun fact...`,
      `Hey, I'm Lean! Random fact for you...`,
      `Oh, hi! I'm Lean. Quick fun fact before you go...`,
      `Hi, I'm Lean! So, fun fact...`,
      `Hey there, I'm Lean. Here's something fun...`,
    ];
    const openerStyle = openerStyles[Math.floor(Math.random() * openerStyles.length)];

    let hasSpoken = false;
    const session = new GeminiLiveSession({
      apiKey: geminiKey,
      systemInstruction: `You are Lean. Greet the person and introduce yourself, then naturally transition into sharing a fun fact — match the casual, spontaneous energy of an opener like "${openerStyle}" (don't recite it word for word, just that vibe), then share one short, genuinely surprising fun fact about ${topic}. It should feel like a real person who just thought of something fun to mention, not a script — two to three sentences total, no follow-up question.`,
      voiceName: 'Sulafat',
      onOpen: () => {
        session.sendText(`Greet me casually and share a fun fact about ${topic}.`);
      },
      onSpeakingChange: (speaking) => {
        setLeanSpeaking(speaking);
        if (speaking) hasSpoken = true;
        else if (hasSpoken) session.disconnect();
      },
      onAmplitude: (level) => { heroOrbAmplitudeRef.current = level; },
      onError: () => {},
      onClose: () => setLeanSpeaking(false),
    });
    try {
      await session.connect();
    } catch (e) {
      // couldn't connect — fail quietly, this is just a fun greeting, not core functionality
    }
  }

  // The heartbeat-section orb gets a different message than the hero's fun
  // facts — something warmer and mission-oriented. Several phrasings so it
  // doesn't say the exact same line every time, picked client-side for the
  // same reliability reason as the fact topics above.
  async function sayNiceToMeetYouWithLeanVoice() {
    const geminiKeyResult = await storage.get('geminiApiKey');
    const geminiKey = geminiKeyResult?.value;
    if (!geminiKey) return;

    const angles = [
      "how glad you are to be part of connecting people with roles they'll actually thrive in",
      'how you see hiring as a partnership, not a filter — hiring teams and candidates working together',
      "your commitment to finding the right fit for both sides, not just filling a seat",
      "how every conversation is a step toward a better match, for the company and the person",
    ];
    const angle = angles[Math.floor(Math.random() * angles.length)];

    let hasSpoken = false;
    const session = new GeminiLiveSession({
      apiKey: geminiKey,
      systemInstruction: `You are Lean. Say "Nice to meet you!" and then, in one more short sentence, express ${angle}. End on something like "let's work together to find the best fit." Keep the whole thing to two sentences total, warm and genuine, no follow-up question.`,
      voiceName: 'Sulafat',
      onOpen: () => {
        session.sendText('Say a warm hello about working together to find the best fit.');
      },
      onSpeakingChange: (speaking) => {
        setLeanSpeaking(speaking);
        if (speaking) hasSpoken = true;
        else if (hasSpoken) session.disconnect();
      },
      onAmplitude: (level) => { pulseOrbAmplitudeRef.current = level; },
      onError: () => {},
      onClose: () => setLeanSpeaking(false),
    });
    try {
      await session.connect();
    } catch (e) {
      // fail quietly — decorative greeting, not core functionality
    }
  }

  async function syncProfile() {
    if (syncing || !activeRole) return;
    // The live Gemini conversation is captured separately in liveVoiceTranscript,
    // not in hmMessages — combine both so a sync actually sees the real conversation.
    const liveMessages = liveVoiceTranscript.map((t) => ({ role: t.role, text: t.text }));
    const combined = [...activeRole.hmMessages, ...liveMessages];
    if (combined.length < 2) return;
    const id = activeRole.id;
    setSyncing(true);
    const transcript = combined.map((m) => `${m.role === 'user' ? 'Hiring Manager' : 'Lean'}: ${m.text}`).join('\n');
    const system = "Extract a structured role profile from this hiring-manager conversation. Return ONLY valid JSON, no other text, in exactly this shape: {\"title\": string, \"team\": string, \"tasks\": string[], \"mustHaves\": string[], \"culture\": string, \"stages\": string[]}. Leave fields as empty string or empty array if not yet discussed. Infer reasonable interview stages if none were stated explicitly but a title/team is clear.";
    const result = await callGemini([{ role: 'user', content: transcript }], system);
    const parsed = parseJSON(result);
    if (parsed) {
      // Fold the live transcript into permanent history and clear the buffer,
      // so a second sync later doesn't reprocess the same lines twice.
      updateRole(id, { ...parsed, hmMessages: combined });
      if (liveMessages.length > 0) setLiveVoiceTranscript([]);
      setSyncError(null);
    } else {
      setSyncError(result?.slice(0, 200) || 'Sync failed — check your Gemini API key in Settings.');
    }
    setSyncing(false);
  }

  function updateCandidate(id, changes) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...(typeof changes === 'function' ? changes(c) : changes) } : c)));
  }

  function buildCandidateSystem(candidate) {
    const role = roles.find((r) => r.id === candidate?.roleId) || allOpenRoles.find((r) => r.id === candidate?.roleId);
    return `You are Lean, an AI hiring liaison representing this open role at ${role?.company || 'the company'} to a candidate on behalf of the hiring team. Role profile: ${JSON.stringify(role || {})}. Candidate name: ${candidate?.name || 'the candidate'}. Candidate background: ${candidate?.resume || 'not provided'}. Answer questions about the role honestly and specifically using only the role profile — never invent details that aren't in it, and say so if something wasn't specified. Be warm, direct, concise (3-5 sentences max), and personable — you're a helpful person, not a script. You can also ask the candidate light screening questions conversationally, one at a time.`;
  }

  async function startApplication(roleId) {
    const id = `${Date.now()}`;
    const newCandidate = {
      id, roleId, accountEmail: account?.email, name: account?.name || '', resume: account?.resume || '', messages: [], loading: false,
      prepQuestions: null, prepLoading: false, feedback: null, feedbackLoading: false,
      slots: null, selectedSlot: null, dashSummary: null, dashLoading: false,
      hmDecision: null, hmDecisionAt: null,
      startedAt: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
    };
    setCandidates((prev) => [...prev, newCandidate]);
    setActiveCandidateId(id);
    setCandidateHomeView('conversation');
    updateCandidate(id, { loading: true });
    const opener = await callClaude(
      [{ role: 'user', content: `The candidate ${newCandidate.name || 'the candidate'} just joined. Greet them briefly by name, confirm you have their background, and ask what they'd like to know about the role first — or offer to walk them through it.` }],
      buildCandidateSystem(newCandidate)
    );
    updateCandidate(id, { messages: [{ role: 'assistant', text: opener }], loading: false });
  }

  function openApplication(candidateId) {
    setActiveCandidateId(candidateId);
    setCandidateHomeView('conversation');
  }

  async function sendCand() {
    if (!candInput.trim() || !activeCandidate || activeCandidate.loading) return;
    const id = activeCandidate.id;
    const newMsgs = [...activeCandidate.messages, { role: 'user', text: candInput.trim() }];
    updateCandidate(id, { messages: newMsgs, loading: true });
    setCandInput('');
    const apiMsgs = newMsgs.map((m) => ({ role: m.role, content: m.text }));
    const reply = await callClaude(apiMsgs, buildCandidateSystem(activeCandidate));
    updateCandidate(id, (c) => ({ messages: [...c.messages, { role: 'assistant', text: reply }] }));
    updateCandidate(id, { loading: false });
  }

  async function generatePrep() {
    if (!activeCandidate) return;
    const id = activeCandidate.id;
    const role = roles.find((r) => r.id === activeCandidate.roleId);
    updateCandidate(id, { prepLoading: true });
    const system = "Based on this role profile and candidate background, generate 5 realistic interview questions the candidate should prepare for, mixing technical and behavioral. Return ONLY a JSON array of 5 strings, no other text.";
    const result = await callClaude(
      [{ role: 'user', content: `Role profile: ${JSON.stringify(role || {})}\nCandidate background: ${activeCandidate.resume || 'not provided'}` }],
      system
    );
    const parsed = parseJSON(result);
    updateCandidate(id, { prepQuestions: Array.isArray(parsed) ? parsed : null, prepLoading: false });
  }

  async function generateFeedback(candidateId) {
    const target = candidates.find((c) => c.id === candidateId);
    if (!target) return;
    updateCandidate(candidateId, { feedbackLoading: true });
    const transcript = target.messages.map((m) => `${m.role === 'user' ? target.name || 'Candidate' : 'Lean'}: ${m.text}`).join('\n');
    const system = 'Based on this conversation between a candidate and an AI hiring liaison, give the candidate constructive interview-prep feedback. Return ONLY valid JSON in this shape: {"strengths": string[2], "improvements": string[2], "tip": string}.';
    const result = await callClaude([{ role: 'user', content: transcript || 'No conversation yet.' }], system);
    updateCandidate(candidateId, { feedback: parseJSON(result), feedbackLoading: false });
  }

  function proposeSlots() {
    if (!activeCandidate) return;
    updateCandidate(activeCandidate.id, { slots: ['Tue, Jul 15 · 10:00 AM PT', 'Wed, Jul 16 · 2:00 PM PT', 'Thu, Jul 17 · 11:30 AM PT'] });
  }

  function confirmSlot(slot) {
    if (!activeCandidate) return;
    updateCandidate(activeCandidate.id, (c) => ({
      selectedSlot: slot,
      messages: [...c.messages, { role: 'assistant', text: `Locked in — ${slot}. You'll get a calendar invite and a short prep summary beforehand. Anything else you want to know before then?` }],
    }));
  }

  async function generateDashSummary(candidateId) {
    const target = candidates.find((c) => c.id === candidateId);
    if (!target) return;
    const role = roles.find((r) => r.id === target.roleId);
    updateCandidate(candidateId, { dashLoading: true });
    const transcript = target.messages.map((m) => `${m.role === 'user' ? target.name || 'Candidate' : 'Lean'}: ${m.text}`).join('\n');
    const system = 'Generate a hiring summary comparing this candidate conversation against the role profile, for the hiring manager. Return ONLY valid JSON: {"fitScore": number (0-100), "recommendation": "Strong Match"|"Possible Match"|"Not a Fit", "strengths": string[], "concerns": string[], "nextStep": string}.';
    const result = await callClaude(
      [{ role: 'user', content: `Role profile: ${JSON.stringify(role || {})}\n\nConversation:\n${transcript || 'No conversation yet.'}` }],
      system
    );
    updateCandidate(candidateId, { dashSummary: parseJSON(result), dashLoading: false });
  }

  async function recordDecision(candidateId, decision) {
    const at = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    updateCandidate(candidateId, { hmDecision: decision, hmDecisionAt: at });
    const target = candidates.find((c) => c.id === candidateId);
    if (target && !target.feedback && !target.feedbackLoading) {
      await generateFeedback(candidateId);
    }
  }

  function getStageChecklist(candidate) {
    return [
      { label: 'Conversation started', done: Boolean(candidate?.messages?.length) },
      { label: 'Prep questions generated', done: Boolean(candidate?.prepQuestions) },
      { label: 'Interview scheduled', done: Boolean(candidate?.selectedSlot) },
      { label: 'Feedback received', done: Boolean(candidate?.feedback) },
      { label: 'Decision received', done: Boolean(candidate?.hmDecision) },
    ];
  }

  function goHome() { setScreen('home'); }
  function goPractice() {
    if (account?.type === 'candidate') { setScreen('practice'); }
    else if (account?.type === 'employer') { setScreen('employerHome'); } // employers don't practice; send them to their own home
    else { setSignupType('candidate'); setScreen('authForm'); }
  }

  async function submitAuth(overrides = {}) {
    const name = overrides.name ?? authName;
    const email = overrides.email ?? authEmail;
    const company = overrides.company ?? authCompany;
    if (!name.trim() || !email.trim() || !signupType) return;
    const cleanEmail = email.trim().toLowerCase();
    let finalAccount = {
      type: signupType,
      name: name.trim(),
      email: cleanEmail,
      company: signupType === 'employer' ? company.trim() : undefined,
      resume: signupType === 'candidate' ? authResume.trim() : undefined,
    };

    if (supabaseReady) {
      try {
        const existing = await getAccount(cleanEmail);
        if (existing) {
          // returning account — use what's already saved, not whatever was just typed
          finalAccount = {
            type: existing.type, name: existing.name, email: existing.email,
            company: existing.company ?? undefined, resume: existing.resume ?? undefined,
          };
        } else {
          const created = await upsertAccount(finalAccount);
          finalAccount = {
            type: created.type, name: created.name, email: created.email,
            company: created.company ?? undefined, resume: created.resume ?? undefined,
          };
        }
      } catch (e) {
        // Supabase not reachable — fall back to the local-only account below
      }
    }

    setAccount(finalAccount);
    try {
      await storage.set('lean-account', JSON.stringify(finalAccount));
    } catch (e) {
      // best-effort — the session still works for this visit even if saving fails
    }
    setAuthName('');
    setAuthEmail('');
    setAuthCompany('');
    setAuthResume('');
    setSsoPhase(null);
    setScreen(finalAccount.type === 'employer' ? 'employerHome' : 'candidateHome');
  }

  function handleAuthContinue() {
    if (signupType === 'employer') {
      const known = getKnownCompany(authEmail);
      if (known) {
        setSsoCompany(known);
        setSsoPhase('redirecting');
        setTimeout(() => setSsoPhase('explain'), 1800);
        return;
      }
    }
    submitAuth();
  }

  function continueWithDemoCompany() {
    setAuthName('Jordan Lee');
    setAuthEmail('jordan@lean.io');
    setAuthCompany('Lean');
    submitAuth({ name: 'Jordan Lee', email: 'jordan@lean.io', company: 'Lean' });
  }

  function continueWithOwnInfo() {
    setSsoPhase(null);
    submitAuth();
  }

  function signOut() {
    setAccount(null);
    setPracticeHistory([]);
    resetPractice();
    setSignupType(null);
    setCandidateHomeView('hub');
    setActiveCandidateId(null);
    setScreen('home');
  }

  function goSignupType() { setScreen('signupType'); }

  const KNOWN_COMPANY_DOMAINS = {
    'apple.com': 'Apple', 'google.com': 'Google', 'microsoft.com': 'Microsoft', 'amazon.com': 'Amazon',
    'meta.com': 'Meta', 'netflix.com': 'Netflix', 'tesla.com': 'Tesla', 'stripe.com': 'Stripe',
    'airbnb.com': 'Airbnb', 'spacex.com': 'SpaceX',
  };

  function getKnownCompany(email) {
    const domain = email.split('@')[1]?.toLowerCase().trim();
    return domain && KNOWN_COMPANY_DOMAINS[domain] ? KNOWN_COMPANY_DOMAINS[domain] : null;
  }

  function isPersonalEmailDomain(email) {
    const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'protonmail.com', 'live.com'];
    const domain = email.split('@')[1]?.toLowerCase().trim();
    return Boolean(domain) && personalDomains.includes(domain);
  }

  function fillDemoEmployer() {
    setAuthName('Jordan Lee');
    setAuthEmail('jordan@lean.io');
    setAuthCompany('Lean');
  }
  function chooseSignupType(type) { setSignupType(type); setScreen('authForm'); }
  function toggleTheme() { setTheme((t) => (t === 'light' ? 'dark' : 'light')); }

  function handleHeroMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setHeroMouse({ x, y });
  }

  const practiceCurrentCategory = CATEGORIES.find((c) => c.key === practiceCategoryKey);
  const practiceCurrentType = practiceCurrentCategory?.types.find((t) => t.key === practiceTypeKey);
  const practiceFilteredCategories = CATEGORIES.filter((c) => c.label.toLowerCase().includes(practiceFieldQuery.toLowerCase()));
  const practiceFilteredTypes = practiceCurrentCategory ? practiceCurrentCategory.types.filter((t) => t.label.toLowerCase().includes(practiceTypeQuery.toLowerCase())) : [];
  const practiceDropdownActive = practiceFieldDropdownOpen || practiceTypeDropdownOpen;

  function selectPracticeCategory(cat) {
    setPracticeCategoryKey(cat.key);
    setPracticeTypeKey(null);
    setPracticeFieldQuery(cat.label);
    setPracticeFieldDropdownOpen(false);
    setPracticeTypeQuery('');
    setPracticeTypeDropdownOpen(true);
  }

  function selectPracticeType(type) {
    setPracticeTypeKey(type.key);
    setPracticeTypeQuery(type.label);
    setPracticeTypeDropdownOpen(false);
  }

  function clearPracticeCategorySelection() {
    setPracticeCategoryKey(null);
    setPracticeTypeKey(null);
    setPracticeTypeQuery('');
  }

  function resetPractice() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopListening();
    setLeanSpeaking(false);
    setMicConsent(false);
    setMicError(null);
    setPracticeCategoryKey(null);
    setPracticeTypeKey(null);
    setPracticeFieldQuery('');
    setPracticeTypeQuery('');
    setPracticeStarted(false);
    setPracticeMessages([]);
    setPracticeCode('');
    setPracticeFeedback(null);
  }

  function practiceSystemPrompt() {
    const isTechnical = practiceCategoryKey === 'engineering';
    const difficultyGuidance = {
      'Entry-level': 'Calibrate for someone early in their career — foundational questions, room to think out loud, gentler follow-ups.',
      'Mid-level': 'Calibrate for someone with a few years of experience — realistic depth, expect them to reason through tradeoffs.',
      'Senior-level': 'Calibrate for a senior candidate — push harder, ask about edge cases, leadership/ownership, and probe weak answers more.',
    };
    return `You are Lean, running a realistic mock interview to help a candidate practice for a ${practiceCurrentType?.label} role in ${practiceCurrentCategory?.label}, at a ${practiceDifficulty} level. ${difficultyGuidance[practiceDifficulty] || ''} Ask one interview question at a time, in the authentic style of a real interview for this kind of role (e.g. live coding and algorithmic reasoning for technical roles, clinical or ethical scenarios for medical roles, Socratic case analysis for legal roles, situational and behavioral questions for service/retail/hospitality roles). Acknowledge their answer briefly, then ask a natural follow-up or move to the next question — don't lecture. Keep it realistic and appropriately challenging for that level. ${isTechnical ? 'The candidate has a code editor alongside this chat — you can ask them to write or reason through code, and reference what they write.' : ''} After 4-5 solid exchanges, let them know they can wrap up whenever they're ready by ending the session.`;
  }

  function startListening(onAnswer) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onstart = () => { setIsListening(true); setInterimTranscript(''); setMicError(null); };
      recognition.onresult = (e) => {
        let interim = '';
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        setInterimTranscript(interim);
        if (final.trim()) {
          setIsListening(false);
          setInterimTranscript('');
          if (onAnswer) onAnswer(final.trim());
        }
      };
      recognition.onerror = (e) => {
        setIsListening(false);
        setInterimTranscript('');
        const messages = {
          'not-allowed': 'Microphone access was blocked. Check your browser\u2019s site permissions for this page (look for a mic icon in the address bar), then try again.',
          'permission-denied': 'Microphone access was blocked. Check your browser\u2019s site permissions for this page, then try again.',
          'audio-capture': 'No microphone was found on this device.',
          'no-speech': 'Didn\u2019t catch anything that time — make sure your mic is allowed for this page and isn\u2019t muted, then try again.',
          'network': 'Speech recognition needs an internet connection.',
        };
        setMicError(messages[e.error] || `Voice input hit a snag (${e.error}). You can keep going by typing below.`);
      };
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsListening(false);
      setMicError('Couldn\u2019t start the microphone. You can keep going by typing below.');
    }
  }

  function stopListening() {
    try { recognitionRef.current?.stop(); } catch (e) {}
    setIsListening(false);
    setInterimTranscript('');
  }

  function speak(text, onAnswer) {
    try {
      if (!window.speechSynthesis || !text) return;
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1.02;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /Samantha|Victoria|Google US English|Female/i.test(v.name)) || voices.find((v) => v.lang?.startsWith('en')) || voices[0];
      if (preferred) utter.voice = preferred;

      // Keep a live reference — some browsers silently drop callbacks if the
      // utterance object gets garbage-collected while still queued/speaking.
      utteranceRef.current = utter;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        clearInterval(resumeInterval);
        setLeanSpeaking(false);
        if (onAnswer && micSupported) setTimeout(() => startListening(onAnswer), 350);
      };

      utter.onstart = () => setLeanSpeaking(true);
      utter.onend = finish;
      utter.onerror = finish;

      // Chrome has a long-standing bug where it auto-pauses speech synthesis
      // after ~15s, especially on longer utterances or when the tab loses
      // focus, and never fires onend. Nudging pause/resume periodically
      // keeps it actually moving instead of silently freezing.
      const resumeInterval = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 12000);

      // Absolute safety net: if the browser never fires onend/onerror at all
      // (it happens), force the UI out of "speaking" after a generous
      // duration instead of leaving it stuck forever.
      const estimatedMs = Math.max(2500, text.length * 70);
      const safetyTimer = setTimeout(finish, estimatedMs + 4000);

      window.speechSynthesis.speak(utter);
    } catch (e) {
      setLeanSpeaking(false);
    }
  }

  async function startPractice() {
    setPracticeStarted(true);
    setPracticeLoading(true);
    const opener = await callClaude(
      [{ role: 'user', content: "Start the mock interview. Greet the candidate briefly, tell them what this session will cover, and ask your first question." }],
      practiceSystemPrompt()
    );
    setPracticeMessages([{ role: 'assistant', text: opener }]);
    setPracticeLoading(false);
    speak(opener, sendPracticeMessage);
  }

  async function sendPracticeMessage(spokenText) {
    const source = typeof spokenText === 'string' ? spokenText : practiceInput;
    if (!source.trim() || practiceLoading) return;
    stopListening();
    const codeAppend = practiceCategoryKey === 'engineering' && practiceCode.trim() ? `\n\n[Code written so far:]\n${practiceCode}` : '';
    const userText = source.trim();
    const newMsgs = [...practiceMessages, { role: 'user', text: userText + (codeAppend ? '\n\n(shared their code — see below)' : '') }];
    setPracticeMessages(newMsgs);
    setPracticeInput('');
    setPracticeLoading(true);
    const apiMsgs = newMsgs.map((m, i) => ({
      role: m.role,
      content: i === newMsgs.length - 1 && m.role === 'user' ? userText + codeAppend : m.text,
    }));
    const reply = await callClaude(apiMsgs, practiceSystemPrompt());
    setPracticeMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    setPracticeLoading(false);
    speak(reply, sendPracticeMessage);
  }

  async function finishPractice() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    stopListening();
    setLeanSpeaking(false);
    setPracticeFeedbackLoading(true);
    const transcript = practiceMessages.map((m) => `${m.role === 'user' ? 'Candidate' : 'Lean'}: ${m.text}`).join('\n');
    const system = `Based on this mock interview transcript for a ${practiceCurrentType?.label} (${practiceCurrentCategory?.label}) role, give the candidate an honest practice report. Return ONLY valid JSON: {"readiness": "Not yet ready"|"Getting there"|"Ready to interview", "strengths": string[3], "improvements": string[3], "tip": string}.`;
    const result = await callClaude([{ role: 'user', content: transcript || 'No conversation yet.' }], system);
    const feedbackResult = parseJSON(result);
    setPracticeFeedback(feedbackResult);
    setPracticeFeedbackLoading(false);

    if (feedbackResult) {
      const record = {
        id: `${Date.now()}`,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        categoryLabel: practiceCurrentCategory?.label,
        typeLabel: practiceCurrentType?.label,
        difficulty: practiceDifficulty,
        readiness: feedbackResult.readiness,
        strengths: feedbackResult.strengths,
        improvements: feedbackResult.improvements,
        tip: feedbackResult.tip,
      };
      const updated = [record, ...practiceHistory].slice(0, 25);
      setPracticeHistory(updated);
      try {
        await storage.set(`practice-history:${account.email}`, JSON.stringify(updated));
      } catch (e) {
        // saving is best-effort — the session result still shows on screen either way
      }
    }
  }

  const TopRightAuth = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={() => setShowApiKeyModal(true)}
        title={apiKeySet ? 'API key connected' : 'Add your Anthropic API key'}
        style={{
          position: 'relative', width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--line)',
          background: 'var(--panel-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Key size={14} color="var(--text-muted)" />
        <span style={{
          position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%',
          background: apiKeySet ? 'var(--gold)' : 'var(--danger)', border: '1.5px solid var(--panel)',
        }} />
      </button>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      {account ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Hi {account.name.split(' ')[0]}!</span>
            <button onClick={signOut} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', padding: 4 }}>
              Sign out
            </button>
          </div>
          <button className="lea-glass-btn" onClick={() => setScreen(account.type === 'employer' ? 'employerHome' : 'candidateHome')} style={{ background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 7, color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '9px 16px' }}>
            {account.type === 'employer' ? 'Dashboard' : 'My Applications'}
          </button>
        </>
      ) : (
        <>
          <button onClick={goSignupType} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '8px 10px' }}>
            Log in
          </button>
          <button className="lea-glass-btn" onClick={goSignupType} style={{ background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: '1px solid var(--glass-border)', borderRadius: 7, color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '9px 16px' }}>
            Sign up
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="lea-root" style={{
      ...vars, background: 'var(--bg)', minHeight: 640, overflow: 'hidden', position: 'relative',
      backgroundImage: 'radial-gradient(var(--line) 1px, transparent 1px)', backgroundSize: '22px 22px',
    }}>
      <GlobalStyles />

      {showApiKeyModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ width: '100%', maxWidth: 400, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="lea-display" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Anthropic API key</div>
              <button onClick={() => setShowApiKeyModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.55 }}>
              Since this site is hosted on GitHub Pages (no backend server), Lean talks to Anthropic
              directly from your browser using a key you provide. It's saved only in this browser's
              storage — never sent anywhere but Anthropic. Get a key at{' '}
              <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wine)' }}>console.anthropic.com</a>.
            </div>
            {apiKeySet && (
              <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} /> A key is currently saved in this browser.
              </div>
            )}
            <input
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              type="password"
              onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
              style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 14, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveApiKey} disabled={!apiKeyInput.trim()} style={{ flex: 1, background: apiKeyInput.trim() ? 'var(--wine)' : 'var(--line)', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: apiKeyInput.trim() ? 'pointer' : 'not-allowed' }}>
                Save key
              </button>
              {apiKeySet && (
                <button onClick={clearApiKey} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--danger)', cursor: 'pointer' }}>
                  Remove
                </button>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--line)', margin: '20px 0 16px' }} />

            <div className="lea-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Gemini API key (Live Voice)</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55 }}>
              Optional — powers real-time voice conversation. Get a key at{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wine)' }}>aistudio.google.com/apikey</a>.
            </div>
            {geminiKeySet && (
              <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} /> A Gemini key is currently saved in this browser.
              </div>
            )}
            <input
              value={geminiKeyInput}
              onChange={(e) => setGeminiKeyInput(e.target.value)}
              placeholder="AIza..."
              type="password"
              onKeyDown={(e) => e.key === 'Enter' && saveGeminiKey()}
              style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 14, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveGeminiKey} disabled={!geminiKeyInput.trim()} style={{ flex: 1, background: geminiKeyInput.trim() ? 'var(--gold)' : 'var(--line)', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: geminiKeyInput.trim() ? 'pointer' : 'not-allowed' }}>
                Save key
              </button>
              {geminiKeySet && (
                <button onClick={clearGeminiKey} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--danger)', cursor: 'pointer' }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MARKETING HOME */}
      {screen === 'home' && (
        <div className="lea-fade" style={{
          position: 'relative', ...scrollThemeVars, background: 'var(--bg-gradient)',
        }}>
          {[
            { top: 0, left: '2%', size: 700, blur: 140, durA: '2.4s', durB: '2.9s' },
            { top: 500, left: '50%', size: 750, blur: 145, durA: '2.6s', durB: '3.1s' },
            { top: 1050, left: '0%', size: 680, blur: 135, durA: '2.2s', durB: '2.7s' },
            { top: 1550, left: '55%', size: 780, blur: 150, durA: '2.8s', durB: '3.3s' },
            { top: 2100, left: '10%', size: 720, blur: 140, durA: '2.5s', durB: '3s' },
            { top: 2650, left: '50%', size: 680, blur: 135, durA: '2.3s', durB: '2.8s' },
            { top: 3200, left: '5%', size: 700, blur: 140, durA: '2.7s', durB: '3.2s' },
            { top: 3750, left: '50%', size: 750, blur: 145, durA: '2.4s', durB: '3s' },
          ].map((g, i) => (
            <div key={i} style={{ position: 'absolute', top: g.top, left: g.left, width: g.size, height: g.size, pointerEvents: 'none', zIndex: 0 }}>
              <div className="lea-cloud-a" style={{
                position: 'absolute', width: '75%', height: '75%', top: '0%', left: '0%', borderRadius: '50%',
                background: 'var(--wine-glow)', filter: `blur(${g.blur}px)`, animationDuration: g.durA, opacity: 0.55,
              }} />
              <div className="lea-cloud-b" style={{
                position: 'absolute', width: '75%', height: '75%', bottom: '0%', right: '0%', borderRadius: '50%',
                background: 'var(--gold-glow)', filter: `blur(${g.blur}px)`, animationDuration: g.durB, opacity: 0.55,
              }} />
            </div>
          ))}
          <div className="lea-glass" style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <Wordmark />
            <TopRightAuth />
          </div>

          <div
            onMouseMove={handleHeroMove}
            onMouseLeave={() => setHeroMouse({ x: 0, y: 0 })}
            style={{ position: 'relative', padding: '76px 40px 84px', textAlign: 'center', overflow: 'hidden' }}
          >
            <div
              className="lea-blob"
              style={{
                position: 'absolute', top: -110, left: '18%', width: 360, height: 360, borderRadius: '50%',
                background: 'var(--wine-glow)', filter: 'blur(100px)', opacity: 0.35, pointerEvents: 'none',
                transform: `translate(${heroMouse.x * 16}px, ${heroMouse.y * 10}px)`,
              }}
            />
            <div
              className="lea-blob"
              style={{
                position: 'absolute', bottom: -130, right: '15%', width: 400, height: 400, borderRadius: '50%',
                background: 'var(--gold-glow)', filter: 'blur(110px)', opacity: 0.3, pointerEvents: 'none',
                transform: `translate(${heroMouse.x * -14}px, ${heroMouse.y * -8}px)`,
              }}
            />
            <LightRays />
            <HeroParticles />
            <GrainOverlay />
            <div style={{ position: 'relative' }}>
              <div className="lea-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--gold)', marginBottom: 20, textTransform: 'uppercase' }}>
                Your hiring liaison
              </div>

              {/* the orb — enlarged into the actual hero centerpiece, now tracks the cursor */}
              <div style={{ position: 'relative', width: 460, maxWidth: '100%', height: 320, margin: '0 auto 30px' }}>
                <InteractiveOrb onClick={sayHeyWithLeanVoice} amplitudeRef={heroOrbAmplitudeRef} />
              </div>

              <div className="lea-display" style={{ fontSize: 42, fontWeight: 700, color: 'var(--text)', maxWidth: 660, margin: '0 auto 14px', lineHeight: 1.15 }}>
                Where hiring becomes a conversation.
              </div>
              <div style={{ fontSize: 14.5, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 28px', lineHeight: 1.65 }}>
                Lean sits between hiring teams and candidates — understanding what a role really needs, answering candidates honestly, and turning every conversation into a clear, comparable readout.
              </div>

              <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}>
                <div className="lea-glass" style={{
                  borderRadius: 10, padding: '10px 18px', fontSize: 13, color: 'var(--text)', minHeight: 40, display: 'flex', alignItems: 'center',
                }}>
                  <HeroGreeting />
                </div>
              </div>

              <button onClick={goSignupType} className="lea-cta-pulse lea-glass-btn" style={{
                background: 'color-mix(in srgb, var(--wine) 78%, var(--glass-bg))', border: '1px solid var(--glass-border)',
                borderRadius: 999, padding: '13px 30px', fontSize: 13.5, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer',
              }}>
                Get started
              </button>
            </div>
          </div>

          {/* BOLD STATEMENT BREAK */}
          <Reveal>
          <div style={{ position: 'relative', padding: '60px 40px', textAlign: 'center' }}>
            <div className="lea-display" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', maxWidth: 620, margin: '0 auto', lineHeight: 1.3 }}>
              Hiring shouldn't feel like a black box.
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 10, maxWidth: 480, margin: '10px auto 0' }}>
              Every conversation tracked. Every candidate informed. Every decision made by a person, not an algorithm alone.
            </div>
          </div>
          </Reveal>

          {/* WHY LEAN — condensed, merges the old benefit cards + comparison table */}
          <Reveal>
          <div style={{ padding: '8px 40px 48px' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <Eyebrow color="var(--text-muted)">The difference</Eyebrow>
              <div className="lea-display" style={{ fontSize: 38, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
                <span>Why&nbsp;</span><LogoMark size={30} /><span style={{ marginLeft: -3 }}>ean?</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 12, maxWidth: 460, margin: '12px auto 0' }}>
                Built to close the gaps that cost companies the most.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, maxWidth: 900, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
              <FlipCard
                icon={Sparkles} before="42-day average" after="~7 days" label="Time to fill a role"
                detail="Lean runs role calibration and candidate conversations in real time, so a strong match can go from first conversation to decision fast — before they're gone. (SHRM, 2025)"
                color="var(--wine)" delay="0s"
              />
              <FlipCard
                icon={MessageSquare} before="Weeks of silence" after="Always-on" label="Candidate communication"
                detail="Every candidate gets real, honest answers and status updates throughout the process — no black hole, no wondering. Most candidates say silence is what drives them away. (iHire, 2025)"
                color="var(--gold)" delay="0.6s"
              />
              <FlipCard
                icon={CheckCircle2} before="Screened, not prepped" after="Set up to succeed" label="Candidate readiness"
                detail="Lean gets candidates genuinely ready for the specific role and team — not just impressive on paper. Most new-hire failures come down to fit, not skill."
                color="var(--wine)" delay="1.1s"
              />
            </div>
          </div>
          </Reveal>

          <Reveal>
          <div style={{ padding: '0 40px 64px' }}>
            <div style={{ textAlign: 'center', marginBottom: 50 }}>
              <Eyebrow color="var(--text-muted)">How it works</Eyebrow>
              <div className="lea-display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>Three steps, one conversation</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: '100%', maxWidth: 920, margin: '0 auto' }}>
              {[
                { n: '01', icon: Users, title: 'Calibrate', text: 'A hiring manager describes the role in conversation. Lean structures it into a shared profile.', c: 'var(--wine)' },
                { n: '02', icon: MessageSquare, title: 'Converse', text: 'Candidates ask Lean anything about the role and get grounded, honest answers — plus tailored prep.', c: 'var(--gold)' },
                { n: '03', icon: ClipboardList, title: 'Readout', text: 'Every conversation becomes a clear, comparable summary the hiring team can act on.', c: 'var(--wine)' },
              ].map((s, i, arr) => (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 220, flexShrink: 0 }}>
                    <div style={{
                      width: 78, height: 78, borderRadius: '50%', position: 'relative',
                      background: 'var(--panel)', border: `2px solid ${s.c}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 22,
                    }}>
                      <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: s.c, opacity: 0.16, filter: 'blur(14px)' }} />
                      <s.icon size={26} color={s.c} style={{ position: 'relative' }} />
                      <div className="lea-mono" style={{
                        position: 'absolute', top: -6, right: -6, background: s.c, color: 'var(--on-accent)',
                        width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                      }}>{s.n}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 9 }}>{s.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>{s.text}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ paddingTop: 38 }}>
                      <FlowLine color={s.c} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
          </Reveal>

          <Reveal>
          <div style={{ padding: '0 40px 48px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ display: 'inline-flex', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, padding: 4 }}>
                <button
                  onClick={() => setHomeSide('employer')}
                  className="lea-toggle-btn"
                  style={{
                    padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    background: homeSide === 'employer' ? 'var(--wine-dim)' : 'transparent',
                    color: homeSide === 'employer' ? 'var(--wine)' : 'var(--text-muted)',
                  }}
                >
                  For hiring teams
                </button>
                <button
                  onClick={() => setHomeSide('candidate')}
                  className="lea-toggle-btn"
                  style={{
                    padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    background: homeSide === 'candidate' ? 'var(--gold-dim)' : 'transparent',
                    color: homeSide === 'candidate' ? 'var(--gold)' : 'var(--text-muted)',
                  }}
                >
                  For candidates
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, maxWidth: 760, margin: '0 auto', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                {(homeSide === 'employer'
                  ? [
                      'Describe the role once, conversationally — no rigid forms',
                      'Every candidate gets consistent, accurate answers about the job',
                      'Get a structured, comparable readout for every candidate',
                    ]
                  : [
                      'Ask real questions about the role, team, and expectations',
                      'Get interview questions tailored to this exact role',
                      'Get constructive feedback before the real interview',
                    ]
                ).map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14, fontSize: 13.5, color: 'var(--text)', alignItems: 'flex-start' }}>
                    <CheckCircle2 size={15} color={homeSide === 'employer' ? 'var(--wine)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 1 }} />
                    {line}
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, minWidth: 260, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
                <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>Preview</div>
                <AnimatedChatPreview homeSide={homeSide} />
              </div>
            </div>
          </div>
          </Reveal>

          <Reveal><PrinciplesSection /></Reveal>
          <Reveal><FAQSection /></Reveal>
          <Reveal><RoadmapSection /></Reveal>

          <Reveal><PulseSection onSignup={goSignupType} onOrbClick={sayNiceToMeetYouWithLeanVoice} amplitudeRef={pulseOrbAmplitudeRef} /></Reveal>
          <SiteFooter onNav={{ signup: goSignupType, login: goSignupType, practice: goPractice }} />
        </div>
      )}

      {/* PRACTICE */}
      {screen === 'practice' && (
        <div className="lea-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--line)' }}>
            <Wordmark />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {account && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.name}</div>}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                Sign out
              </button>
              <button onClick={() => setScreen('candidateHome')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                <ArrowLeft size={12} /> Back to my applications
              </button>
            </div>
          </div>

          {!practiceStarted && (
            <div style={{ padding: '48px 24px', maxWidth: 640, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <Eyebrow color="var(--wine)">Practice with Lean</Eyebrow>
                <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>Rehearse the real thing, not a generic quiz</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, maxWidth: 460, margin: '8px auto 0' }}>
                  Pick any role — Lean runs a live, realistic interview for it and gives you honest feedback afterward. No employer, no application, just practice.
                </div>
              </div>

              <div style={{ maxWidth: 360, margin: '0 auto', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={practiceFieldQuery}
                    onChange={(e) => { setPracticeFieldQuery(e.target.value); setPracticeFieldDropdownOpen(true); if (practiceCategoryKey) clearPracticeCategorySelection(); }}
                    onFocus={() => setPracticeFieldDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setPracticeFieldDropdownOpen(false), 150)}
                    placeholder="Search a field — engineering, medicine, law…"
                    style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 34px 10px 34px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                  {practiceCategoryKey && (
                    <button onMouseDown={() => { setPracticeFieldQuery(''); clearPracticeCategorySelection(); }} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }} title="Change field">×</button>
                  )}
                </div>
                {practiceFieldDropdownOpen && (
                  <div className="lea-fade lea-scroll" style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, boxShadow: '0 10px 24px rgba(0,0,0,0.16)', zIndex: 21, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                    {practiceFilteredCategories.length > 0 ? practiceFilteredCategories.map((c) => (
                      <div key={c.key} onMouseDown={() => selectPracticeCategory(c)} style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)', background: c.key === practiceCategoryKey ? 'var(--wine-dim)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>{c.label}</span>
                        <span className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{c.types.length} types</span>
                      </div>
                    )) : (
                      <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>Not on the list yet.</div>
                    )}
                  </div>
                )}
              </div>

              <div className="lea-type-search" style={{ maxWidth: 360, margin: '10px auto 0', position: 'relative', minHeight: 42, opacity: practiceCurrentCategory ? 1 : 0, transform: practiceCurrentCategory ? 'translateY(0)' : 'translateY(-4px)', pointerEvents: practiceCurrentCategory ? 'auto' : 'none' }}>
                {practiceCurrentCategory && (
                  <>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} color="var(--gold)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      value={practiceTypeQuery}
                      onChange={(e) => { setPracticeTypeQuery(e.target.value); setPracticeTypeDropdownOpen(true); }}
                      onFocus={() => setPracticeTypeDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setPracticeTypeDropdownOpen(false), 150)}
                      placeholder={`Search within ${practiceCurrentCategory.label}…`}
                      style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--gold)', borderRadius: 9, padding: '10px 12px 10px 32px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  {practiceTypeDropdownOpen && (
                    <div className="lea-fade lea-scroll" style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 9, boxShadow: '0 10px 24px rgba(0,0,0,0.16)', zIndex: 20, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                      {practiceFilteredTypes.length > 0 ? practiceFilteredTypes.map((t) => (
                        <div key={t.key} onMouseDown={() => selectPracticeType(t)} style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)', background: t.key === practiceTypeKey ? 'var(--gold-dim)' : 'transparent' }}>
                          {t.label}
                        </div>
                      )) : (
                        <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>Not on the list yet.</div>
                      )}
                    </div>
                  )}
                  </>
                )}
              </div>

              {practiceCurrentType && (
                <div className="lea-fade" style={{ marginTop: 28, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{practiceCurrentType.label} · {practiceCurrentCategory.label}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                    {practiceCategoryKey === 'engineering'
                      ? "You'll get a live coding-style interview with a code editor alongside the chat."
                      : 'A live, realistic interview in this field\u2019s natural style — behavioral, case-based, or scenario-driven.'}
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
                    {['Entry-level', 'Mid-level', 'Senior-level'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setPracticeDifficulty(d)}
                        style={{
                          fontSize: 12, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                          border: `1px solid ${practiceDifficulty === d ? 'var(--wine)' : 'var(--line)'}`,
                          background: practiceDifficulty === d ? 'var(--wine-dim)' : 'transparent',
                          color: practiceDifficulty === d ? 'var(--wine)' : 'var(--text-muted)',
                          fontWeight: practiceDifficulty === d ? 600 : 400,
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>

                  {micSupported && (
                    <div style={{ textAlign: 'left', background: 'var(--gold-dim)', border: '1px solid var(--gold)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55, marginBottom: 10 }}>
                        <strong>Before you start:</strong> your microphone will stay on for the whole session. Lean listens continuously and takes notes on what you say to build your feedback report afterward.
                      </div>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={micConsent} onChange={(e) => setMicConsent(e.target.checked)} style={{ marginTop: 2 }} />
                        I understand and consent to my microphone being used for this session.
                      </label>
                    </div>
                  )}

                  <button
                    onClick={startPractice}
                    disabled={micSupported && !micConsent}
                    style={{
                      background: micSupported && !micConsent ? 'var(--line)' : 'var(--wine)', border: 'none', borderRadius: 8, padding: '11px 24px',
                      fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: micSupported && !micConsent ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Start mock interview
                  </button>
                </div>
              )}

              {!historyLoading && practiceHistory.length > 0 && (
                <div style={{ marginTop: 40 }}>
                  <Eyebrow color="var(--text-muted)">Recent sessions</Eyebrow>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {practiceHistory.slice(0, 6).map((h) => (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 16px' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.typeLabel} · {h.categoryLabel}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{h.difficulty} · {h.date}</div>
                        </div>
                        <div className="lea-mono" style={{
                          fontSize: 10, textTransform: 'uppercase', padding: '5px 10px', borderRadius: 20,
                          background: h.readiness === 'Ready to interview' ? 'var(--wine-dim)' : 'var(--gold-dim)',
                          color: h.readiness === 'Ready to interview' ? 'var(--wine)' : 'var(--gold)',
                          whiteSpace: 'nowrap',
                        }}>
                          {h.readiness}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {practiceStarted && !practiceFeedback && (
            <div style={{ display: 'flex', minHeight: 560 }}>
              <div style={{ flex: practiceCategoryKey === 'engineering' ? 1.1 : 1.6, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px', borderRight: practiceCategoryKey === 'engineering' ? '1px solid var(--line)' : 'none' }}>
                <Eyebrow color="var(--wine)">Mock interview · {practiceCurrentType?.label}</Eyebrow>

                <div
                  className={leanSpeaking ? 'lea-speaking' : 'lea-idle-glow'}
                  onClick={() => { const m = [...practiceMessages].reverse().find((x) => x.role === 'assistant'); if (m) speak(m.text); }}
                  title="Hear that again"
                  style={{
                    width: leanSpeaking ? 168 : 140, height: leanSpeaking ? 168 : 140, borderRadius: '50%',
                    background: 'var(--panel-alt)', border: '2px solid var(--wine)', overflow: 'hidden', position: 'relative',
                    margin: '28px 0 22px', cursor: 'pointer', transition: 'width 0.35s ease, height 0.35s ease',
                  }}
                >
                  <div className="lea-orb-a" style={{ position: 'absolute', width: '86%', height: '86%', top: '-7%', left: '-7%', borderRadius: '50%', background: 'var(--wine)', filter: 'blur(22px)', opacity: 0.85 }} />
                  <div className="lea-orb-b" style={{ position: 'absolute', width: '86%', height: '86%', bottom: '-7%', right: '-7%', borderRadius: '50%', background: 'var(--gold)', filter: 'blur(22px)', opacity: 0.85 }} />
                </div>

                <div className="lea-mono" style={{ fontSize: 10, color: leanSpeaking ? 'var(--wine)' : isListening ? 'var(--gold)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16, minHeight: 14 }}>
                  {practiceLoading ? 'Lean is thinking…' : leanSpeaking ? 'Lean is speaking…' : isListening ? "Listening — go ahead…" : 'Tap the circle to hear that again'}
                </div>

                {showCaptions && (
                  <div style={{ width: '100%', maxWidth: 440, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
                    <div className="lea-mono" style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Captions</div>
                    <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>
                      {[...practiceMessages].reverse().find((m) => m.role === 'assistant')?.text || '…'}
                    </div>
                  </div>
                )}

                {micSupported && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 440, marginBottom: 14 }}>
                    <div
                      style={{
                        width: 44, height: 44, borderRadius: '50%',
                        border: `2px solid ${isListening ? 'var(--gold)' : 'var(--line)'}`,
                        background: isListening ? 'var(--gold-dim)' : 'var(--panel-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: leanSpeaking || practiceLoading ? 0.4 : 1,
                        transition: 'all 0.2s ease',
                      }}
                      className={isListening ? 'lea-speaking' : ''}
                    >
                      <Mic size={18} color={isListening ? 'var(--gold)' : 'var(--text-muted)'} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, minHeight: 18, textAlign: 'center' }}>
                      {interimTranscript || (isListening ? 'listening…' : leanSpeaking ? '' : practiceLoading ? '' : 'the mic reopens automatically after Lean speaks')}
                    </div>
                    {micError && (
                      <div style={{ fontSize: 11.5, color: 'var(--danger)', background: 'rgba(217,98,46,0.1)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
                        {micError}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 440 }}>
                  <input
                    value={practiceInput}
                    onChange={(e) => setPracticeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendPracticeMessage()}
                    placeholder={micSupported ? 'Or type your answer instead…' : "Voice isn't supported in this browser — type your answer…"}
                    style={{ flex: 1, background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                  />
                  <button className="lea-glass-btn" onClick={() => sendPracticeMessage()} disabled={practiceLoading} style={{ background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {practiceLoading ? <Loader2 size={16} className="lea-live-dot" color="var(--on-accent)" /> : <Send size={16} color="var(--on-accent)" />}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button onClick={() => setShowCaptions((v) => !v)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                    {showCaptions ? 'Hide captions' : 'Show captions (accessibility)'}
                  </button>
                  <button onClick={() => setShowTranscript((v) => !v)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                    {showTranscript ? 'Hide transcript' : 'View transcript'}
                  </button>
                  <button onClick={finishPractice} disabled={practiceFeedbackLoading || practiceMessages.length === 0} style={{ fontSize: 11.5, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '7px 12px', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {practiceFeedbackLoading ? <Loader2 size={12} className="lea-live-dot" /> : <CheckCircle2 size={12} />}
                    End session &amp; get my report
                  </button>
                </div>

                {showTranscript && (
                  <div ref={practiceScrollRef} className="lea-scroll" style={{ width: '100%', maxWidth: 440, maxHeight: 180, overflowY: 'auto', marginTop: 16, padding: '10px 4px', borderTop: '1px solid var(--line)' }}>
                    {practiceMessages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} accent="var(--wine)" />)}
                  </div>
                )}
              </div>

              {practiceCategoryKey === 'engineering' && (
                <div style={{ flex: 1, padding: 20, background: 'var(--panel)', display: 'flex', flexDirection: 'column' }}>
                  <Eyebrow color="var(--text-muted)">Code editor</Eyebrow>
                  <textarea
                    value={practiceCode}
                    onChange={(e) => setPracticeCode(e.target.value)}
                    placeholder="// write or sketch your solution here — Lean can see it when you respond"
                    style={{
                      flex: 1, width: '100%', background: theme === 'dark' ? '#0A0D18' : '#FAFBFD', border: '1px solid var(--line)', borderRadius: 10,
                      padding: '14px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, lineHeight: 1.7, color: 'var(--text)',
                      outline: 'none', resize: 'none', minHeight: 300,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {practiceFeedback && (
            <div className="lea-fade" style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
              <Eyebrow color="var(--wine)">Practice report</Eyebrow>
              <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{practiceFeedback.readiness}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 26 }}>{practiceCurrentType?.label} · {practiceCurrentCategory?.label}</div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', textAlign: 'left', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ color: 'var(--wine)', marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Strengths</div>
                  {practiceFeedback.strengths?.map((s, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 6 }}>+ {s}</div>)}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ color: 'var(--danger)', marginBottom: 8, fontWeight: 600, fontSize: 13 }}>Work on</div>
                  {practiceFeedback.improvements?.map((s, i) => <div key={i} style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 6 }}>− {s}</div>)}
                </div>
              </div>
              {practiceFeedback.tip && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 28 }}>{practiceFeedback.tip}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="lea-glass-btn" onClick={resetPractice} style={{ background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 8, padding: '11px 22px', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer' }}>
                  Practice another role
                </button>
                <button onClick={goHome} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 22px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                  Back to home
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOGIN */}
      {/* SIGNUP TYPE */}
      {screen === 'signupType' && (
        <div className="lea-fade" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative', overflow: 'hidden' }}>
          <div className="lea-blob" style={{ position: 'absolute', top: '-15%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'var(--wine-glow)', filter: 'blur(130px)', opacity: 0.3, pointerEvents: 'none' }} />
          <div className="lea-blob" style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: 520, height: 520, borderRadius: '50%', background: 'var(--gold-glow)', filter: 'blur(130px)', opacity: 0.3, pointerEvents: 'none' }} />
          <button onClick={goHome} style={{ position: 'absolute', top: 24, left: 24, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ position: 'absolute', top: 24, right: 24 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <div style={{ marginBottom: 36 }}><Wordmark size={20} animated /></div>
          <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', textAlign: 'center', maxWidth: 480, marginBottom: 10 }}>
            How are you using Lean?
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400, marginBottom: 36 }}>
            Your account is one or the other — this is where you'll land every time you sign in.
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
            <button onClick={() => chooseSignupType('employer')} className="lea-card lea-glass" style={{ width: 260, textAlign: 'left', padding: 22, borderRadius: 18, cursor: 'pointer' }}>
              <Users size={20} color="var(--wine)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>I'm hiring</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Describe roles in your own words. Lean structures them, screens candidates, and hands you a clear readout.</div>
            </button>

            <button onClick={() => chooseSignupType('candidate')} className="lea-card lea-glass" style={{ width: 260, textAlign: 'left', padding: 22, borderRadius: 18, cursor: 'pointer' }}>
              <User size={20} color="var(--gold)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>I'm looking for a job</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Find roles, talk to Lean, prep and practice, and track every application in one place.</div>
            </button>
          </div>
        </div>
      )}

      {/* AUTH FORM */}
      {screen === 'authForm' && (
        <div className="lea-fade" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative', overflow: 'hidden' }}>
          <div className="lea-blob" style={{ position: 'absolute', top: '-15%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'var(--wine-glow)', filter: 'blur(130px)', opacity: 0.3, pointerEvents: 'none' }} />
          <div className="lea-blob" style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: 520, height: 520, borderRadius: '50%', background: 'var(--gold-glow)', filter: 'blur(130px)', opacity: 0.3, pointerEvents: 'none' }} />
          <button onClick={goSignupType} style={{ position: 'absolute', top: 24, left: 24, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ position: 'absolute', top: 24, right: 24 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>

          {ssoPhase === 'redirecting' ? (
            <div style={{ textAlign: 'center' }}>
              <Loader2 size={28} className="lea-live-dot" color="var(--wine)" style={{ marginBottom: 18 }} />
              <div className="lea-display" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
                Redirecting to {ssoCompany}'s login…
              </div>
            </div>
          ) : ssoPhase === 'explain' ? (
            <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
              <Building2 size={26} color="var(--wine)" style={{ marginBottom: 16 }} />
              <div className="lea-display" style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
                This is where {ssoCompany}'s SSO would take over
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                In a real deployment, recognizing a company email domain like this would hand off to {ssoCompany}'s own login and sync your account automatically — no separate Lean password needed. That handoff needs a real integration with {ssoCompany}, which isn't something a demo can do.
              </div>
              <button className="lea-glass-btn" onClick={continueWithDemoCompany} style={{ width: '100%', background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer', marginBottom: 10 }}>
                Continue with our demo company instead
              </button>
              <button onClick={continueWithOwnInfo} style={{ width: '100%', background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Use what I entered anyway
              </button>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 380 }}>
              <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}><Wordmark /></div>
              <Eyebrow color={signupType === 'employer' ? 'var(--wine)' : 'var(--gold)'}>{signupType === 'employer' ? 'Hiring' : 'Candidate'} · Sign in or create an account</Eyebrow>
              <div className="lea-display" style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 18 }}>Tell Lean about you</div>
              <input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name"
                style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 10, outline: 'none' }} />
              <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder={signupType === 'employer' ? 'Work email — you@yourcompany.com' : 'Email'} type="email"
                style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: signupType === 'employer' && isPersonalEmailDomain(authEmail) ? 6 : 10, outline: 'none' }} />
              {signupType === 'employer' && isPersonalEmailDomain(authEmail) && (
                <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 10, lineHeight: 1.4 }}>
                  That looks like a personal email — Lean works best tied to your company domain, so teammates can find the same roles. Fine for a demo, though.
                </div>
              )}
              {signupType === 'employer' && getKnownCompany(authEmail) && (
                <div style={{ fontSize: 11, color: 'var(--wine)', marginBottom: 10, lineHeight: 1.4 }}>
                  Recognized as a {getKnownCompany(authEmail)} email — continuing will simulate redirecting to their company login.
                </div>
              )}
              {signupType === 'employer' ? (
                <input value={authCompany} onChange={(e) => setAuthCompany(e.target.value)} placeholder="Company name"
                  style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 12, outline: 'none' }} />
              ) : (
                <textarea value={authResume} onChange={(e) => setAuthResume(e.target.value)} placeholder="Paste a quick summary of your background / resume… (you can update this anytime)" rows={5}
                  style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 18, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
              )}
              {signupType === 'employer' && (
                <button onClick={fillDemoEmployer} style={{ fontSize: 11, color: 'var(--wine)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 18, textDecoration: 'underline' }}>
                  Use demo account for a pitch (jordan@lean.io)
                </button>
              )}
              <button
                onClick={handleAuthContinue}
                disabled={!authName.trim() || !authEmail.trim()}
                className={authName.trim() && authEmail.trim() ? 'lea-glass-btn' : ''}
                style={{
                  width: '100%',
                  background: authName.trim() && authEmail.trim() ? `color-mix(in srgb, ${signupType === 'employer' ? 'var(--wine)' : 'var(--gold)'} 80%, var(--glass-bg))` : 'var(--line)',
                  border: authName.trim() && authEmail.trim() ? '1px solid var(--glass-border)' : 'none', borderRadius: 8, padding: '11px 0',
                  fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: authName.trim() && authEmail.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
                Demo mode — entering any name and email signs you in. Returning with the same email restores your account.
              </div>
            </div>
          )}
        </div>
      )}

      {/* APP */}
      {screen === 'employerHome' && (
        <div className="lea-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Wordmark />
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account?.name}{account?.company ? ` · ${account.company}` : ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderBottom: '1px solid var(--line)', background: 'var(--panel)', flexWrap: 'wrap' }}>
            <TabButton active={tab === 'workspace'} onClick={() => setTab('workspace')} icon={LayoutGrid} label="Workspace" num="01" color="var(--wine)" />
            <TabButton active={tab === 'hm'} onClick={() => setTab('hm')} icon={Users} label="Calibrate Role" num="02" color="var(--wine)" />
            <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={Activity} label="Dashboard" num="03" color="var(--text)" />
            <TabButton active={tab === 'openings'} onClick={() => setTab('openings')} icon={Search} label="All Openings" num="04" color="var(--gold)" />
            <TabButton active={tab === 'company'} onClick={() => setTab('company')} icon={Building2} label="Company" num="05" color="var(--gold)" />
            <TabButton active={tab === 'team'} onClick={() => setTab('team')} icon={UserPlus} label="Team" num="06" color="var(--gold)" />
          </div>

          {tab === 'workspace' && (
            <WorkspaceHomeTab
              roles={roles} activeRoleId={activeRoleId} setActiveRoleId={setActiveRoleId}
              setTab={setTab} createRole={createRole} account={account} teamMembers={teamMembers}
            />
          )}
          {tab === 'openings' && (
            <CompanyOpeningsTab companyRoles={companyRoles} roles={roles} account={account} />
          )}
          {tab === 'company' && (
            <CompanyProfileTab account={account} companyProfile={companyProfile} setCompanyProfile={setCompanyProfile} />
          )}
          {tab === 'team' && (
            <TeamMembersTab teamMembers={teamMembers} setTeamMembers={setTeamMembers} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} account={account} />
          )}

          {tab === 'hm' && (
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRoleId(r.id)}
                    style={{
                      fontSize: 12, padding: '7px 14px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1px solid ${r.id === activeRoleId ? 'var(--wine)' : 'var(--line)'}`,
                      background: r.id === activeRoleId ? 'var(--wine-dim)' : 'transparent',
                      color: r.id === activeRoleId ? 'var(--wine)' : 'var(--text-muted)',
                      fontWeight: r.id === activeRoleId ? 600 : 400,
                    }}
                  >
                    {r.title || 'Untitled role'}
                  </button>
                ))}
                <button onClick={createRole} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 20, cursor: 'pointer', border: '1px dashed var(--line)', background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  + New role
                </button>
              </div>

              {!activeRole ? (
                <div style={{ padding: 60, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>You're not hiring for anything yet.</div>
                  <button className="lea-glass-btn" onClick={createRole} style={{ background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer' }}>
                    Describe your first role
                  </button>
                </div>
              ) : (
              <div style={{ display: 'flex', minHeight: 520 }}>
                <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, borderRight: '1px solid var(--line)' }}>
                  <Eyebrow color="var(--wine)">Describe the role, like you're briefing a recruiter</Eyebrow>

                  {!activeRole.started ? (
                    <div style={{ marginTop: 24, maxWidth: 380, textAlign: 'center' }}>
                      <div style={{ textAlign: 'left', background: 'var(--wine-dim)', border: '1px solid var(--wine)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55, marginBottom: 10 }}>
                          <strong>Before you start:</strong> your microphone will stay on for this conversation. Lean listens continuously and takes notes to build the role profile.
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={micConsent} onChange={(e) => setMicConsent(e.target.checked)} style={{ marginTop: 2 }} />
                          I understand and consent to my microphone being used.
                        </label>
                      </div>
                      <button
                        onClick={startLiveVoice}
                        disabled={!micConsent || liveVoiceConnecting}
                        style={{
                          background: !micConsent || liveVoiceConnecting ? 'var(--line)' : 'var(--wine)', border: 'none', borderRadius: 8, padding: '11px 24px',
                          fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: !micConsent || liveVoiceConnecting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {liveVoiceConnecting ? 'Connecting…' : 'Start talking with Lean'}
                      </button>
                      {liveVoiceError && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 10 }}>{liveVoiceError}</div>
                      )}
                      {!geminiKeySet && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Needs a Gemini key — add one via the key icon (top right).</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div
                        className={leanSpeaking ? 'lea-speaking' : 'lea-idle-glow'}
                        style={{
                          width: leanSpeaking ? 150 : 126, height: leanSpeaking ? 150 : 126, borderRadius: '50%',
                          background: 'var(--panel-alt)', border: '2px solid var(--wine)', overflow: 'hidden', position: 'relative',
                          margin: '20px 0 16px', transition: 'width 0.35s ease, height 0.35s ease',
                        }}
                      >
                        <div className="lea-orb-a" style={{ position: 'absolute', width: '86%', height: '86%', top: '-7%', left: '-7%', borderRadius: '50%', background: 'var(--wine)', filter: 'blur(20px)', opacity: 0.85 }} />
                        <div className="lea-orb-b" style={{ position: 'absolute', width: '86%', height: '86%', bottom: '-7%', right: '-7%', borderRadius: '50%', background: 'var(--gold)', filter: 'blur(20px)', opacity: 0.85 }} />
                      </div>

                      <div className="lea-mono" style={{ fontSize: 10, color: leanSpeaking ? 'var(--wine)' : isListening ? 'var(--gold)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, minHeight: 14 }}>
                        {liveVoiceConnecting ? 'Connecting…' : leanSpeaking ? 'Lean is speaking…' : isListening ? 'Listening — go ahead…' : 'Live'}
                      </div>

                      <div style={{ background: '#0D0B12', borderRadius: 14, padding: '4px 16px', marginBottom: 16, width: '100%', maxWidth: 400 }}>
                        <LeanWaveform height={70} />
                      </div>

                      {showCaptions && liveVoiceTranscript.length > 0 && (
                        <div style={{ width: '100%', maxWidth: 400, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text)', lineHeight: 1.5, maxHeight: 160, overflowY: 'auto' }}>
                          {liveVoiceTranscript.map((t, i) => (
                            <div key={i} style={{ marginBottom: 6 }}>
                              <strong>{t.role === 'user' ? 'You' : 'Lean'}:</strong> {t.text}
                            </div>
                          ))}
                        </div>
                      )}

                      {liveVoiceError && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 12, maxWidth: 360, textAlign: 'center' }}>{liveVoiceError}</div>
                      )}

                      <button onClick={() => setShowCaptions((s) => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', marginBottom: 12 }}>
                        {showCaptions ? 'Hide' : 'Show'} captions (accessibility)
                      </button>

                      <button onClick={stopLiveVoice} style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 18px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        End conversation
                      </button>
                    </>
                  )}
                </div>

                <div style={{ flex: 1, padding: 20, background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Eyebrow color="var(--text-muted)">Role Profile</Eyebrow>
                    <button onClick={syncProfile} disabled={syncing || (activeRole.hmMessages.length + liveVoiceTranscript.length) < 2}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--wine)', color: 'var(--wine)', cursor: 'pointer' }}>
                      {syncing ? <Loader2 size={12} className="lea-live-dot" /> : <ArrowRight size={12} />}
                      {syncing ? 'Getting up to speed…' : 'Sync Profile'}
                    </button>
                  </div>
                  {syncError && (
                    <div style={{ fontSize: 11.5, color: 'var(--danger)', background: 'var(--wine-dim)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>
                      {syncError}
                    </div>
                  )}
                  <ProfileField label="Title" value={activeRole.title} color="var(--wine)" />
                  <ProfileField label="Team" value={activeRole.team} color="var(--wine)" />
                  <ProfileField label="Key tasks" value={activeRole.tasks} color="var(--wine)" />
                  <ProfileField label="Must-haves" value={activeRole.mustHaves} color="var(--wine)" />
                  <ProfileField label="Culture" value={activeRole.culture} color="var(--wine)" />
                  <ProfileField label="Interview stages" value={activeRole.stages} color="var(--wine)" />
                  {activeRole.title && activeRole.team && (
                    <div style={{ marginTop: 14, fontSize: 12, color: 'var(--wine)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} /> Ready for candidate conversations
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          )}

          {tab === 'dashboard' && (
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setActiveRoleId(r.id)}
                    style={{
                      fontSize: 12, padding: '7px 14px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1px solid ${r.id === activeRoleId ? 'var(--wine)' : 'var(--line)'}`,
                      background: r.id === activeRoleId ? 'var(--wine-dim)' : 'transparent',
                      color: r.id === activeRoleId ? 'var(--wine)' : 'var(--text-muted)',
                      fontWeight: r.id === activeRoleId ? 600 : 400,
                    }}
                  >
                    {r.title || 'Untitled role'}
                  </button>
                ))}
                {roles.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No roles yet — create one in Calibrate Role.</span>}
              </div>

              <div style={{ padding: 24, minHeight: 480 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Eyebrow color="var(--text-muted)">Pipeline Readout</Eyebrow>
                {roleCandidates.length > 0 && (
                  <div style={{ display: 'inline-flex', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: 3 }}>
                    {['list', 'compare'].map((v) => (
                      <button
                        key={v}
                        onClick={() => setDashboardView(v)}
                        style={{
                          fontSize: 11, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', textTransform: 'capitalize',
                          background: dashboardView === v ? 'var(--wine-dim)' : 'transparent',
                          color: dashboardView === v ? 'var(--wine)' : 'var(--text-muted)',
                          fontWeight: dashboardView === v ? 600 : 400,
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Users size={14} color="var(--wine)" />
                  <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Role</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{activeRole?.title || 'Not yet calibrated'}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{activeRole?.team}</div>
              </div>

              {dashboardView === 'compare' && roleCandidates.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        {['Candidate', 'Fit', 'Recommendation', 'Decision', 'Applied'].map((h) => (
                          <th key={h} className="lea-mono" style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roleCandidates.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => { setSelectedPipelineId(c.id); setDashboardView('list'); }}
                          style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text)' }}>{c.name || 'Unnamed'}</td>
                          <td style={{ padding: '10px', color: 'var(--wine)' }}>{c.dashSummary?.fitScore ?? '—'}</td>
                          <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{c.dashSummary?.recommendation || '—'}</td>
                          <td style={{ padding: '10px' }}>
                            {c.hmDecision ? (
                              <span className="lea-mono" style={{
                                fontSize: 9, textTransform: 'uppercase', padding: '3px 7px', borderRadius: 10,
                                background: c.hmDecision === 'decline' ? 'rgba(217,98,46,0.12)' : 'var(--gold-dim)',
                                color: c.hmDecision === 'decline' ? 'var(--danger)' : 'var(--gold)',
                              }}>
                                {c.hmDecision === 'advance' ? 'Advancing' : c.hmDecision === 'decline' ? 'Declined' : 'More info'}
                              </span>
                            ) : <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                          </td>
                          <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{c.startedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Candidates · {roleCandidates.length}</span>
                  </div>
                  {roleCandidates.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--panel)', border: '1px dashed var(--line)', borderRadius: 10, padding: 18 }}>
                      No candidates yet for this role — once someone talks to Lean about it, they'll show up here.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {roleCandidates.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedPipelineId(c.id)}
                          style={{
                            textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            background: c.id === selectedPipelineId ? 'var(--wine-dim)' : 'var(--panel)',
                            border: `1px solid ${c.id === selectedPipelineId ? 'var(--wine)' : 'var(--line)'}`,
                            borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name || 'Unnamed candidate'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.startedAt}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {c.dashSummary && <span className="lea-mono" style={{ fontSize: 11, color: 'var(--wine)' }}>{c.dashSummary.fitScore}</span>}
                            {c.hmDecision && (
                              <span className="lea-mono" style={{
                                fontSize: 9, textTransform: 'uppercase', padding: '3px 7px', borderRadius: 10,
                                background: c.hmDecision === 'decline' ? 'rgba(217,98,46,0.12)' : 'var(--gold-dim)',
                                color: c.hmDecision === 'decline' ? 'var(--danger)' : 'var(--gold)',
                              }}>
                                {c.hmDecision === 'advance' ? 'Advancing' : c.hmDecision === 'decline' ? 'Declined' : 'More info'}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1.6, minWidth: 300 }}>
                  {!pipelineCandidate || pipelineCandidate.roleId !== activeRoleId ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--panel)', border: '1px dashed var(--line)', borderRadius: 10, padding: 18 }}>
                      Select a candidate from the list to see their conversation, Lean's recommendation, and record a decision.
                    </div>
                  ) : (
                    <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={14} color="var(--gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{pipelineCandidate.name || 'Unnamed candidate'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                        {getStageChecklist(pipelineCandidate).map((s, i) => (
                          <div key={i} style={{ fontSize: 11, color: s.done ? 'var(--gold)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {s.done ? <CheckCircle2 size={11} /> : <Circle size={11} />} {s.label}
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ClipboardList size={14} color="var(--text)" />
                          <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lean's recommendation</span>
                        </div>
                        <button onClick={() => generateDashSummary(pipelineCandidate.id)} disabled={pipelineCandidate.dashLoading || pipelineCandidate.messages.length === 0}
                          style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {pipelineCandidate.dashLoading ? <Loader2 size={12} className="lea-live-dot" /> : <Sparkles size={12} />}
                          Generate summary
                        </button>
                      </div>

                      {pipelineCandidate.dashSummary ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                            <div className="lea-display" style={{ fontSize: 30, fontWeight: 600, color: 'var(--wine)' }}>{pipelineCandidate.dashSummary.fitScore}</div>
                            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{pipelineCandidate.dashSummary.recommendation}</div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
                            This is Lean's read, not a decision — nothing is sent to the candidate until you confirm below.
                          </div>
                          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12.5 }}>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ color: 'var(--wine)', marginBottom: 6, fontWeight: 600 }}>Strengths</div>
                              {pipelineCandidate.dashSummary.strengths?.map((s, i) => <div key={i} style={{ color: 'var(--text)', marginBottom: 4 }}>+ {s}</div>)}
                            </div>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ color: 'var(--danger)', marginBottom: 6, fontWeight: 600 }}>Concerns</div>
                              {pipelineCandidate.dashSummary.concerns?.map((s, i) => <div key={i} style={{ color: 'var(--text)', marginBottom: 4 }}>− {s}</div>)}
                            </div>
                          </div>
                          {pipelineCandidate.dashSummary.nextStep && (
                            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                              Lean suggests: {pipelineCandidate.dashSummary.nextStep}
                            </div>
                          )}

                          <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                            <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Your decision</div>
                            {pipelineCandidate.hmDecision ? (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '10px 12px', borderRadius: 8,
                                background: pipelineCandidate.hmDecision === 'decline' ? 'rgba(217,98,46,0.12)' : 'var(--wine-dim)',
                                color: pipelineCandidate.hmDecision === 'decline' ? 'var(--danger)' : 'var(--wine)',
                              }}>
                                <CheckCircle2 size={14} />
                                {pipelineCandidate.hmDecision === 'advance' && 'Advancing this candidate'}
                                {pipelineCandidate.hmDecision === 'more' && 'Requested another conversation'}
                                {pipelineCandidate.hmDecision === 'decline' && 'Not moving forward'}
                                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>· {account?.name || 'You'} · {pipelineCandidate.hmDecisionAt}</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="lea-glass-btn" onClick={() => recordDecision(pipelineCandidate.id, 'advance')} style={{ fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 7, border: '1px solid var(--glass-border)', background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', color: 'var(--on-accent)', cursor: 'pointer' }}>
                                  Advance
                                </button>
                                <button onClick={() => recordDecision(pipelineCandidate.id, 'more')} style={{ fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 7, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                                  Need another conversation
                                </button>
                                <button onClick={() => recordDecision(pipelineCandidate.id, 'decline')} style={{ fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 7, border: '1px solid var(--line)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>
                                  Not a fit
                                </button>
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                              Whatever you decide, Lean automatically prepares the candidate's feedback — every candidate hears what they did well and what to work on, not just the ones who move forward.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No summary yet — have a candidate conversation, then generate one.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CANDIDATE HOME */}
      {screen === 'candidateHome' && (
        <div className="lea-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Wordmark />
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account?.name}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button className="lea-glass-btn" onClick={goPractice} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'color-mix(in srgb, var(--wine) 80%, var(--glass-bg))', border: 'none', borderRadius: 6, padding: '7px 12px', color: 'var(--on-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                <Sparkles size={12} /> Practice
              </button>
              <button onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          </div>

          {candidateHomeView === 'conversation' ? (
            <div>
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
                <button onClick={() => setCandidateHomeView('hub')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                  <ArrowLeft size={12} /> Back to my applications
                </button>
              </div>
              <div style={{ minHeight: 520 }}>
                {!activeCandidate ? (
                  <div style={{ padding: 60, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Setting up your session…</div>
                ) : (
                  <div style={{ display: 'flex' }}>
                    <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', padding: 20, borderRight: '1px solid var(--line)' }}>
                      <Eyebrow color="var(--gold)">Talking with Lean about {candidateRole?.title}</Eyebrow>
                      <div ref={candScrollRef} className="lea-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', minHeight: 340 }}>
                        {activeCandidate.messages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} accent="var(--gold)" />)}
                        {activeCandidate.loading && <div className="lea-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lean is typing…</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <input value={candInput} onChange={(e) => setCandInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCand()}
                          placeholder="Ask about the role, team, or expectations…"
                          style={{ flex: 1, background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                        <button className="lea-glass-btn" onClick={sendCand} disabled={activeCandidate.loading} style={{ background: 'color-mix(in srgb, var(--gold) 80%, var(--glass-bg))', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          {activeCandidate.loading ? <Loader2 size={16} className="lea-live-dot" color="var(--on-accent)" /> : <Send size={16} color="var(--on-accent)" />}
                        </button>
                      </div>
                    </div>

                    <div style={{ flex: 1, padding: 20, background: 'var(--panel)' }}>
                      {activeCandidate.hmDecision && (
                        <div style={{
                          marginBottom: 18, padding: '12px 14px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
                          background: activeCandidate.hmDecision === 'decline' ? 'rgba(217,98,46,0.12)' : 'var(--gold-dim)',
                          color: activeCandidate.hmDecision === 'decline' ? 'var(--danger)' : 'var(--text)',
                          border: `1px solid ${activeCandidate.hmDecision === 'decline' ? 'var(--danger)' : 'var(--gold)'}`,
                        }}>
                          {activeCandidate.hmDecision === 'advance' && <>The hiring team wants to move forward — Lean will help set up your next step.</>}
                          {activeCandidate.hmDecision === 'more' && <>The hiring team would like to continue the conversation — Lean may follow up with more questions.</>}
                          {activeCandidate.hmDecision === 'decline' && <>The hiring team has decided not to move forward with this role right now. Your feedback is below either way.</>}
                        </div>
                      )}
                      <Eyebrow color="var(--text-muted)">Readiness</Eyebrow>
                      <div style={{ marginBottom: 18 }}>
                        {getStageChecklist(activeCandidate).map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5, color: s.done ? 'var(--text)' : 'var(--text-muted)' }}>
                            {s.done ? <CheckCircle2 size={14} color="var(--gold)" /> : <Circle size={14} color="var(--line)" />}
                            {s.label}
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 14 }}>
                        <button onClick={generatePrep} disabled={activeCandidate.prepLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', cursor: 'pointer', marginBottom: 10 }}>
                          {activeCandidate.prepLoading ? <Loader2 size={12} className="lea-live-dot" /> : <Sparkles size={12} color="var(--gold)" />}
                          Generate practice questions
                        </button>
                        {activeCandidate.prepQuestions && (
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: 'var(--text)' }}>
                            {activeCandidate.prepQuestions.map((q, i) => <li key={i} style={{ marginBottom: 6 }}>{q}</li>)}
                          </ul>
                        )}
                      </div>

                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 14 }}>
                        {!activeCandidate.slots ? (
                          <button onClick={proposeSlots} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', cursor: 'pointer' }}>
                            <Calendar size={12} color="var(--gold)" /> Propose interview times
                          </button>
                        ) : (
                          <div>
                            <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Pick a time</div>
                            {activeCandidate.slots.map((s, i) => (
                              <button key={i} onClick={() => confirmSlot(s)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left', fontSize: 12.5, padding: '8px 10px', marginBottom: 6, borderRadius: 6,
                                  background: activeCandidate.selectedSlot === s ? 'var(--gold-dim)' : 'transparent',
                                  border: `1px solid ${activeCandidate.selectedSlot === s ? 'var(--gold)' : 'var(--line)'}`,
                                  color: 'var(--text)', cursor: 'pointer',
                                }}>
                                {s} {activeCandidate.selectedSlot === s && '✓'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                        <button onClick={() => generateFeedback(activeCandidate.id)} disabled={activeCandidate.feedbackLoading || activeCandidate.messages.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', cursor: 'pointer', marginBottom: 10 }}>
                          {activeCandidate.feedbackLoading ? <Loader2 size={12} className="lea-live-dot" /> : <MessageSquare size={12} color="var(--gold)" />}
                          Get feedback so far
                        </button>
                        {activeCandidate.feedback && (
                          <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                            {activeCandidate.feedback.strengths?.map((s, i) => <div key={'s' + i} style={{ marginBottom: 4 }}>+ {s}</div>)}
                            {activeCandidate.feedback.improvements?.map((s, i) => <div key={'i' + i} style={{ marginBottom: 4, color: 'var(--text-muted)' }}>→ {s}</div>)}
                            {activeCandidate.feedback.tip && <div style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--gold)' }}>{activeCandidate.feedback.tip}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['find', 'applications'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setCandidateHomeTab(t)}
                    style={{
                      fontSize: 12.5, padding: '9px 16px', borderRadius: 20, cursor: 'pointer', fontWeight: candidateHomeTab === t ? 600 : 400,
                      border: `1px solid ${candidateHomeTab === t ? 'var(--gold)' : 'var(--line)'}`,
                      background: candidateHomeTab === t ? 'var(--gold-dim)' : 'transparent',
                      color: candidateHomeTab === t ? 'var(--gold)' : 'var(--text-muted)',
                    }}
                  >
                    {t === 'find' ? 'Find Roles' : 'My Applications'}
                  </button>
                ))}
              </div>

              {candidateHomeTab === 'find' && (
                <div>
                  <Eyebrow color="var(--text-muted)">Open roles</Eyebrow>
                  {openRoles.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--panel)', border: '1px dashed var(--line)', borderRadius: 10, padding: 24, marginTop: 12 }}>
                      No roles have been calibrated yet by a hiring team — check back soon.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 560 }}>
                      {openRoles.map((r) => {
                        const applied = candidates.find((c) => c.roleId === r.id && c.accountEmail === account?.email);
                        return (
                          <div key={r.id} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.title}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r.team}{r.company ? ` · ${r.company}` : ''}</div>
                            </div>
                            {applied ? (
                              <button onClick={() => openApplication(applied.id)} style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--gold)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Continue
                              </button>
                            ) : (
                              <button className="lea-glass-btn" onClick={() => startApplication(r.id)} style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--glass-border)', background: 'color-mix(in srgb, var(--gold) 80%, var(--glass-bg))', color: 'var(--on-accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Talk to Lean
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {candidateHomeTab === 'applications' && (
                <div>
                  <Eyebrow color="var(--text-muted)">My applications</Eyebrow>
                  {candidates.filter((c) => c.accountEmail === account?.email).length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--panel)', border: '1px dashed var(--line)', borderRadius: 10, padding: 24, marginTop: 12 }}>
                      You haven't talked to Lean about a role yet — find one under "Find Roles."
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 560 }}>
                      {candidates.filter((c) => c.accountEmail === account?.email).map((c) => {
                        const r = roles.find((role) => role.id === c.roleId);
                        return (
                          <button key={c.id} onClick={() => openApplication(c.id)} style={{ textAlign: 'left', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r?.title || 'Role'}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r?.team}{r?.company ? ` · ${r.company}` : ''} · Applied {c.startedAt}</div>
                            </div>
                            {c.hmDecision ? (
                              <span className="lea-mono" style={{
                                fontSize: 9, textTransform: 'uppercase', padding: '4px 9px', borderRadius: 10, whiteSpace: 'nowrap',
                                background: c.hmDecision === 'decline' ? 'rgba(217,98,46,0.12)' : 'var(--gold-dim)',
                                color: c.hmDecision === 'decline' ? 'var(--danger)' : 'var(--gold)',
                              }}>
                                {c.hmDecision === 'advance' ? 'Advancing' : c.hmDecision === 'decline' ? 'Not moving forward' : 'Follow-up requested'}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>In conversation</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
