import React, { useState, useRef, useEffect } from 'react';
import { storage } from './storage';
import {
  Users, User, Activity, Send, Loader2, CheckCircle2, Circle,
  Sparkles, Calendar, ArrowRight, ArrowLeft, ClipboardList, MessageSquare,
  Building2, Sun, Moon, Volume2, Search, Mic, Key
} from 'lucide-react';

const MODEL = 'claude-sonnet-4-6';

async function callClaude(messages, system) {
  try {
    // GitHub Pages only serves static files — there's no server to hold an
    // API key. So instead, this reads a key the user pasted in themselves
    // (stored in their own browser via localStorage) and calls Anthropic
    // directly. The `anthropic-dangerous-direct-browser-access` header is
    // Anthropic's official opt-in for exactly this use case. See README.md.
    const apiKey = localStorage.getItem('leeann:anthropicApiKey');
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
  return (
    <style>{`
      * { box-sizing: border-box; }
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
      .lea-root { font-family: 'Inter', sans-serif; }
      .lea-display { font-family: 'Fraunces', serif; }
      .lea-signature { font-family: 'Space Grotesk', sans-serif; font-style: normal; }
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
      .lea-flow-dot { position: absolute; top: 50%; transform: translateY(-50%); width: 6px; height: 6px; border-radius: 50%; animation: lea-flow 2.4s linear infinite; }
      @keyframes lea-twinkle { 0%,100% { opacity: var(--min-op, 0.15); transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.2); } }
      .lea-star { animation: lea-twinkle ease-in-out infinite; }
      .lea-toggle-btn { transition: background 0.15s ease, color 0.15s ease; }
      @keyframes lea-glow {
        0%,100% { box-shadow: 0 0 0 0 var(--wine-dim), 0 0 24px 4px var(--wine-dim); }
        50% { box-shadow: 0 0 0 8px var(--wine-dim), 0 0 38px 10px var(--wine-dim); }
      }
      .lea-speaking { animation: lea-glow 1.1s ease-in-out infinite; }
      @keyframes lea-idle {
        0%,100% { box-shadow: 0 0 0 0 var(--wine-dim), 0 0 24px 4px var(--wine-dim), 0 0 40px 10px var(--gold-dim); }
        50% { box-shadow: 0 0 0 10px var(--wine-dim), 0 0 46px 14px var(--wine-dim), 0 0 70px 22px var(--gold-dim); }
      }
      .lea-idle-glow { animation: lea-idle 2.4s ease-in-out infinite; }
      .lea-type-search { transition: opacity 0.3s ease, transform 0.32s cubic-bezier(.4,0,.2,1); }
      .lea-orb-interactive { position: relative; cursor: pointer; transition: transform 0.35s ease, box-shadow 0.35s ease; }
      .lea-orb-interactive:hover { transform: scale(1.14); animation-duration: 1s; }
      .lea-orb-interactive:hover .lea-orb-a { animation-duration: 1.1s; }
      .lea-orb-interactive:hover .lea-orb-b { animation-duration: 1.3s; }
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
      @keyframes lea-orb-a { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(16px,10px) scale(1.15); } 66% { transform: translate(-6px,14px) scale(0.92); } }
      @keyframes lea-orb-b { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-14px,-16px) scale(1.18); } 66% { transform: translate(10px,-6px) scale(0.9); } }
      .lea-orb-a { animation: lea-orb-a 3.6s ease-in-out infinite; }
      .lea-orb-b { animation: lea-orb-b 4.4s ease-in-out infinite; }
      .lea-play-btn { transition: transform 0.12s ease, background 0.12s ease; }
      .lea-play-btn:hover { transform: scale(1.06); }
    `}</style>
  );
}

function Eyebrow({ children, color }) {
  return (
    <div className="lea-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color, marginBottom: 6, textTransform: 'uppercase' }}>
      {children}
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
          title="Hear Leeann say this"
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

function FlowLine({ color }) {
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 50, height: 2, background: 'repeating-linear-gradient(to right, var(--line) 0 6px, transparent 6px 12px)' }}>
      <span className="lea-flow-dot" style={{ left: 0, background: color, animationDelay: '0s' }} />
      <span className="lea-flow-dot" style={{ left: 0, background: color, animationDelay: '1.2s' }} />
      <span className="lea-flow-dot" style={{ left: 0, background: color, animationDelay: '0.6s', animationDirection: 'reverse' }} />
    </div>
  );
}

function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ transform: 'rotate(-3deg)', flexShrink: 0 }}>
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
        <div className="lea-signature" style={{ fontSize: size, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Leeann</div>
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

export default function LeeannApp() {
  const [theme, setTheme] = useState('light');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [screen, setScreen] = useState('home'); // home | practice | signupType | authForm | employerHome | candidateHome
  const [homeSide, setHomeSide] = useState('employer');
  const [heroMouse, setHeroMouse] = useState({ x: 0, y: 0 });

  const [tab, setTab] = useState('hm');
  const [dashboardView, setDashboardView] = useState('list'); // 'list' | 'compare'

  const [roles, setRoles] = useState([]); // every open role this employer is hiring for
  const [activeRoleId, setActiveRoleId] = useState(null); // which role is currently open in Calibrate/Dashboard
  const [hmInput, setHmInput] = useState('');
  const [hmLoading, setHmLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const hmScrollRef = useRef(null);

  const [candInput, setCandInput] = useState('');
  const [candidates, setCandidates] = useState([]); // the pipeline: every candidate who has talked to Leeann for this role
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
  const [leeannSpeaking, setLeeannSpeaking] = useState(false);
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
  const [signupType, setSignupType] = useState(null); // 'employer' | 'candidate' — chosen before the auth form
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authCompany, setAuthCompany] = useState('');
  const [authResume, setAuthResume] = useState('');

  const [micError, setMicError] = useState(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);
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
    (async () => {
      const result = await storage.get('anthropicApiKey');
      setApiKeySet(Boolean(result?.value));
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

  useEffect(() => {
    (async () => {
      try {
        const result = await storage.get('leeann-account');
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
  const openRoles = roles.filter((r) => r.title && r.team); // roles Leeann has enough to represent to candidates
  const activeCandidate = candidates.find((c) => c.id === activeCandidateId) || null;
  const candidateRole = roles.find((r) => r.id === activeCandidate?.roleId) || null;
  const roleCandidates = candidates.filter((c) => c.roleId === activeRoleId);
  const pipelineCandidate = candidates.find((c) => c.id === selectedPipelineId) || null;
  const vars = theme === 'dark' ? {
    '--bg': '#0E1220', '--panel': '#171B2C', '--panel-alt': '#1E2338', '--line': '#2C3350',
    '--text': '#EDEFF5', '--text-muted': '#8B92AC',
    '--wine': '#FF5F6D', '--wine-dim': 'rgba(255,95,109,0.18)',
    '--gold': '#6FA0FF', '--gold-dim': 'rgba(111,160,255,0.18)',
    '--danger': '#FF9152', '--on-accent': '#10131F',
  } : {
    '--bg': '#F4F6FA', '--panel': '#FFFFFF', '--panel-alt': '#ECEFF5', '--line': '#D8DEE9',
    '--text': '#14161F', '--text-muted': '#666E82',
    '--wine': '#D6293B', '--wine-dim': 'rgba(214,41,59,0.10)',
    '--gold': '#2A5CD6', '--gold-dim': 'rgba(42,92,214,0.10)',
    '--danger': '#E0632E', '--on-accent': '#FFFFFF',
  };

  function updateRole(id, changes) {
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...(typeof changes === 'function' ? changes(r) : changes) } : r)));
  }

  function createRole() {
    const id = `${Date.now()}`;
    const newRole = {
      id, title: '', team: '', tasks: [], mustHaves: [], culture: '', stages: [],
      company: account?.company || '',
      started: false,
      hmMessages: [{ role: 'assistant', text: "Hi — I'm Leeann. Tell me about the role you're hiring for. Start wherever's easiest: the job title, the team, or what the person would actually be doing day to day." }],
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
    const system = `You are Leeann, an AI hiring liaison helping ${account?.name || 'a hiring manager'} at ${account?.company || 'their company'} describe an open role in their own words, conversationally — like a recruiter on a real intake call, not a form. Ask one focused follow-up question at a time until you understand: job title, what the team does, day-to-day tasks/responsibilities, must-have skills, team culture/vibe, and interview stages. Keep replies short (2-4 sentences), warm, and human — never robotic. Once you have a reasonably full picture, mention they can hit 'Sync Profile' whenever they're ready.`;
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

  async function syncProfile() {
    if (syncing || !activeRole || activeRole.hmMessages.length < 2) return;
    const id = activeRole.id;
    setSyncing(true);
    const transcript = activeRole.hmMessages.map((m) => `${m.role === 'user' ? 'Hiring Manager' : 'Leeann'}: ${m.text}`).join('\n');
    const system = "Extract a structured role profile from this hiring-manager conversation. Return ONLY valid JSON, no other text, in exactly this shape: {\"title\": string, \"team\": string, \"tasks\": string[], \"mustHaves\": string[], \"culture\": string, \"stages\": string[]}. Leave fields as empty string or empty array if not yet discussed. Infer reasonable interview stages if none were stated explicitly but a title/team is clear.";
    const result = await callClaude([{ role: 'user', content: transcript }], system);
    const parsed = parseJSON(result);
    if (parsed) updateRole(id, parsed);
    setSyncing(false);
  }

  function updateCandidate(id, changes) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...(typeof changes === 'function' ? changes(c) : changes) } : c)));
  }

  function buildCandidateSystem(candidate) {
    const role = roles.find((r) => r.id === candidate?.roleId);
    return `You are Leeann, an AI hiring liaison representing this open role at ${role?.company || 'the company'} to a candidate on behalf of the hiring team. Role profile: ${JSON.stringify(role || {})}. Candidate name: ${candidate?.name || 'the candidate'}. Candidate background: ${candidate?.resume || 'not provided'}. Answer questions about the role honestly and specifically using only the role profile — never invent details that aren't in it, and say so if something wasn't specified. Be warm, direct, concise (3-5 sentences max), and personable — you're a helpful person, not a script. You can also ask the candidate light screening questions conversationally, one at a time.`;
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
    const transcript = target.messages.map((m) => `${m.role === 'user' ? target.name || 'Candidate' : 'Leeann'}: ${m.text}`).join('\n');
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
    const transcript = target.messages.map((m) => `${m.role === 'user' ? target.name || 'Candidate' : 'Leeann'}: ${m.text}`).join('\n');
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

  async function submitAuth() {
    if (!authName.trim() || !authEmail.trim() || !signupType) return;
    const newAccount = {
      type: signupType,
      name: authName.trim(),
      email: authEmail.trim().toLowerCase(),
      company: signupType === 'employer' ? authCompany.trim() : undefined,
      resume: signupType === 'candidate' ? authResume.trim() : undefined,
    };
    setAccount(newAccount);
    try {
      await storage.set('leeann-account', JSON.stringify(newAccount));
    } catch (e) {
      // best-effort — the session still works for this visit even if saving fails
    }
    setAuthName('');
    setAuthEmail('');
    setAuthCompany('');
    setAuthResume('');
    setScreen(newAccount.type === 'employer' ? 'employerHome' : 'candidateHome');
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

  function isPersonalEmailDomain(email) {
    const personalDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'protonmail.com', 'live.com'];
    const domain = email.split('@')[1]?.toLowerCase().trim();
    return Boolean(domain) && personalDomains.includes(domain);
  }

  function fillDemoEmployer() {
    setAuthName('Jordan Lee');
    setAuthEmail('jordan@acmecorp.io');
    setAuthCompany('Acme Corp');
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
    setLeeannSpeaking(false);
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
    return `You are Leeann, running a realistic mock interview to help a candidate practice for a ${practiceCurrentType?.label} role in ${practiceCurrentCategory?.label}, at a ${practiceDifficulty} level. ${difficultyGuidance[practiceDifficulty] || ''} Ask one interview question at a time, in the authentic style of a real interview for this kind of role (e.g. live coding and algorithmic reasoning for technical roles, clinical or ethical scenarios for medical roles, Socratic case analysis for legal roles, situational and behavioral questions for service/retail/hospitality roles). Acknowledge their answer briefly, then ask a natural follow-up or move to the next question — don't lecture. Keep it realistic and appropriately challenging for that level. ${isTechnical ? 'The candidate has a code editor alongside this chat — you can ask them to write or reason through code, and reference what they write.' : ''} After 4-5 solid exchanges, let them know they can wrap up whenever they're ready by ending the session.`;
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
      utter.onstart = () => setLeeannSpeaking(true);
      utter.onend = () => {
        setLeeannSpeaking(false);
        if (onAnswer && micSupported) setTimeout(() => startListening(onAnswer), 350);
      };
      utter.onerror = () => setLeeannSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch (e) {
      setLeeannSpeaking(false);
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
    setLeeannSpeaking(false);
    setPracticeFeedbackLoading(true);
    const transcript = practiceMessages.map((m) => `${m.role === 'user' ? 'Candidate' : 'Leeann'}: ${m.text}`).join('\n');
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
          <button onClick={() => setScreen(account.type === 'employer' ? 'employerHome' : 'candidateHome')} style={{ background: 'var(--wine)', border: 'none', borderRadius: 7, color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '9px 16px' }}>
            {account.type === 'employer' ? 'Dashboard' : 'My Applications'}
          </button>
        </>
      ) : (
        <>
          <button onClick={goSignupType} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '8px 10px' }}>
            Log in
          </button>
          <button onClick={goSignupType} style={{ background: 'var(--wine)', border: 'none', borderRadius: 7, color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '9px 16px' }}>
            Sign up
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="lea-root" style={{ ...vars, background: 'var(--bg)', minHeight: 640, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', position: 'relative' }}>
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
              Since this site is hosted on GitHub Pages (no backend server), Leeann talks to Anthropic
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
          </div>
        </div>
      )}

      {/* MARKETING HOME */}
      {screen === 'home' && (
        <div className="lea-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--line)' }}>
            <Wordmark />
            <TopRightAuth />
          </div>

          <div
            onMouseMove={handleHeroMove}
            onMouseLeave={() => setHeroMouse({ x: 0, y: 0 })}
            style={{ position: 'relative', padding: '56px 40px 48px', textAlign: 'center', overflow: 'hidden' }}
          >
            <div
              className="lea-blob"
              style={{
                position: 'absolute', top: -60, left: '18%', width: 220, height: 220, borderRadius: '50%',
                background: 'var(--wine-dim)', filter: 'blur(50px)', pointerEvents: 'none',
                transform: `translate(${heroMouse.x * 14}px, ${heroMouse.y * 10}px)`,
              }}
            />
            <div
              className="lea-blob"
              style={{
                position: 'absolute', bottom: -70, right: '16%', width: 260, height: 260, borderRadius: '50%',
                background: 'var(--gold-dim)', filter: 'blur(60px)', pointerEvents: 'none',
                transform: `translate(${heroMouse.x * -12}px, ${heroMouse.y * -8}px)`,
              }}
            />
            <div style={{ position: 'relative' }}>
              <div className="lea-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--wine)', marginBottom: 16, textTransform: 'uppercase' }}>
                Your hiring liaison
              </div>
              <div className="lea-display" style={{ fontSize: 40, fontWeight: 600, color: 'var(--text)', maxWidth: 620, margin: '0 auto 14px', lineHeight: 1.15 }}>
                Where hiring becomes a conversation.
              </div>
              <div style={{ fontSize: 14.5, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 30px', lineHeight: 1.65 }}>
                Leeann sits between hiring teams and candidates — understanding what a role really needs, answering candidates honestly, and turning every conversation into a clear, comparable readout.
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 44 }}>
                <button onClick={goSignupType} style={{ background: 'var(--wine)', border: 'none', borderRadius: 8, padding: '12px 26px', fontSize: 13.5, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer' }}>
                  Get started
                </button>
              </div>

              {/* both sides, talking to Leeann at once */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: 560, margin: '0 auto' }}>
                <div className="lea-bob">
                  <CandidateGlyph />
                </div>
                <FlowLine color="var(--wine)" />
                <div
                  className="lea-idle-glow lea-orb-interactive"
                  onClick={() => speak("Hi, I'm Leeann.")}
                  title="Say hi"
                  style={{
                    width: 88, height: 88, borderRadius: '50%', background: 'var(--panel-alt)',
                    border: '2px solid var(--wine)', overflow: 'hidden', flexShrink: 0, position: 'relative',
                  }}
                >
                  <div className="lea-orb-a" style={{ position: 'absolute', width: 68, height: 68, top: -8, left: -8, borderRadius: '50%', background: 'var(--wine)', filter: 'blur(16px)', opacity: 0.85 }} />
                  <div className="lea-orb-b" style={{ position: 'absolute', width: 68, height: 68, bottom: -8, right: -8, borderRadius: '50%', background: 'var(--gold)', filter: 'blur(16px)', opacity: 0.85 }} />
                </div>
                <FlowLine color="var(--gold)" />
                <div className="lea-bob" style={{ animationDelay: '0.6s' }}>
                  <EmployerGlyph />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, maxWidth: 560, margin: '10px auto 0', fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ flex: 1, textAlign: 'left', paddingLeft: 4 }}>Candidate</span>
                <span style={{ flex: 1, textAlign: 'right', paddingRight: 4 }}>Employer</span>
              </div>
            </div>
          </div>

          {/* WHY LEEANN — benefit-forward, stats as light support */}
          <div style={{ padding: '8px 40px 44px' }}>
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <Eyebrow color="var(--text-muted)">Why Leeann</Eyebrow>
              <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>Built to close the gaps that cost companies the most</div>
            </div>

            <div style={{ display: 'flex', gap: 16, maxWidth: 900, margin: '0 auto', flexWrap: 'wrap' }}>
              {[
                {
                  icon: Sparkles,
                  title: 'Fills roles in about a week',
                  body: 'Leeann runs role calibration and candidate conversations in real time, so a strong match can go from first conversation to decision fast — before they\u2019re gone.',
                  context: 'Industry average sits near 42 days (SHRM, 2025)',
                  color: 'var(--wine)',
                },
                {
                  icon: MessageSquare,
                  title: 'Never goes silent',
                  body: 'Every candidate gets real, honest answers and status updates from Leeann throughout the process — no black hole, no wondering.',
                  context: 'Most candidates say silence is what drives them away (iHire, 2025)',
                  color: 'var(--gold)',
                },
                {
                  icon: CheckCircle2,
                  title: 'Prepares candidates, not just screens them',
                  body: 'Leeann gets candidates genuinely ready for the specific role and team — so the people who make it through are set up to succeed, not just impressive on paper.',
                  context: 'Most new-hire failures come down to fit, not skill',
                  color: 'var(--wine)',
                },
              ].map((c, i) => (
                <div key={i} style={{ flex: 1, minWidth: 250, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 22 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${c.color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <c.icon size={16} color={c.color} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>{c.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{c.body}</div>
                  <div className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.75 }}>{c.context}</div>
                </div>
              ))}
            </div>
          </div>

          {/* STATS / PROOF BAND */}
          <div style={{ padding: '0 40px 40px' }}>
            <div style={{
              maxWidth: 780, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 0,
              border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)',
            }}>
              {[
                { n: '13', label: 'Fields mapped' },
                { n: '70+', label: 'Specializations covered' },
                { n: '24/7', label: 'Always available to candidates' },
                { n: '1', label: 'Conversation, both sides' },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, minWidth: 140, padding: '20px 16px', textAlign: 'center', borderRight: i < 3 ? '1px solid var(--line)' : 'none' }}>
                  <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--wine)' }}>{s.n}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button onClick={goSignupType} style={{ background: 'transparent', border: '1px solid var(--wine)', color: 'var(--wine)', borderRadius: 8, padding: '11px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Sign up to try it →
              </button>
            </div>
          </div>

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
                {(homeSide === 'employer'
                  ? [
                      { role: 'user', text: 'We need a backend engineer for our payments team.' },
                      { role: 'assistant', text: "Got it. What would this person actually own day to day — new payment flows, or reliability of what's already live?" },
                    ]
                  : [
                      { role: 'user', text: "What's the team actually like to work with?" },
                      { role: 'assistant', text: 'Small, senior team of 5 — high ownership, low process. On-call is shared, about once every 6 weeks.' },
                    ]
                ).map((m, i) => (
                  <ChatBubble key={i} role={m.role} text={m.text} accent={homeSide === 'employer' ? 'var(--wine)' : 'var(--gold)'} />
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '0 40px 56px', borderTop: '1px solid var(--line)', paddingTop: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <Eyebrow color="var(--text-muted)">How it works</Eyebrow>
            </div>
            <div style={{ display: 'flex', gap: 20, maxWidth: 820, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { n: '01', title: 'Calibrate', text: 'A hiring manager describes the role in conversation. Leeann structures it into a shared profile.', c: 'var(--wine)' },
                { n: '02', title: 'Converse', text: 'Candidates ask Leeann anything about the role and get grounded, honest answers — plus tailored prep.', c: 'var(--gold)' },
                { n: '03', title: 'Readout', text: 'Every conversation becomes a clear, comparable summary the hiring team can act on.', c: 'var(--text)' },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, minWidth: 200, maxWidth: 240 }}>
                  <div className="lea-mono" style={{ fontSize: 11, color: s.c, marginBottom: 8 }}>{s.n}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.text}</div>
                </div>
              ))}
            </div>
          </div>
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
                <Eyebrow color="var(--wine)">Practice with Leeann</Eyebrow>
                <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>Rehearse the real thing, not a generic quiz</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, maxWidth: 460, margin: '8px auto 0' }}>
                  Pick any role — Leeann runs a live, realistic interview for it and gives you honest feedback afterward. No employer, no application, just practice.
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
                        <strong>Before you start:</strong> your microphone will stay on for the whole session. Leeann listens continuously and takes notes on what you say to build your feedback report afterward.
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
                  className={leeannSpeaking ? 'lea-speaking' : 'lea-idle-glow'}
                  onClick={() => { const m = [...practiceMessages].reverse().find((x) => x.role === 'assistant'); if (m) speak(m.text); }}
                  title="Hear that again"
                  style={{
                    width: leeannSpeaking ? 168 : 140, height: leeannSpeaking ? 168 : 140, borderRadius: '50%',
                    background: 'var(--panel-alt)', border: '2px solid var(--wine)', overflow: 'hidden', position: 'relative',
                    margin: '28px 0 22px', cursor: 'pointer', transition: 'width 0.35s ease, height 0.35s ease',
                  }}
                >
                  <div className="lea-orb-a" style={{ position: 'absolute', width: '86%', height: '86%', top: '-7%', left: '-7%', borderRadius: '50%', background: 'var(--wine)', filter: 'blur(22px)', opacity: 0.85 }} />
                  <div className="lea-orb-b" style={{ position: 'absolute', width: '86%', height: '86%', bottom: '-7%', right: '-7%', borderRadius: '50%', background: 'var(--gold)', filter: 'blur(22px)', opacity: 0.85 }} />
                </div>

                <div className="lea-mono" style={{ fontSize: 10, color: leeannSpeaking ? 'var(--wine)' : isListening ? 'var(--gold)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 16, minHeight: 14 }}>
                  {practiceLoading ? 'Leeann is thinking…' : leeannSpeaking ? 'Leeann is speaking…' : isListening ? "Listening — go ahead…" : 'Tap the circle to hear that again'}
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
                        opacity: leeannSpeaking || practiceLoading ? 0.4 : 1,
                        transition: 'all 0.2s ease',
                      }}
                      className={isListening ? 'lea-speaking' : ''}
                    >
                      <Mic size={18} color={isListening ? 'var(--gold)' : 'var(--text-muted)'} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, minHeight: 18, textAlign: 'center' }}>
                      {interimTranscript || (isListening ? 'listening…' : leeannSpeaking ? '' : practiceLoading ? '' : 'the mic reopens automatically after Leeann speaks')}
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
                  <button onClick={() => sendPracticeMessage()} disabled={practiceLoading} style={{ background: 'var(--wine)', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
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
                    placeholder="// write or sketch your solution here — Leeann can see it when you respond"
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
                <button onClick={resetPractice} style={{ background: 'var(--wine)', border: 'none', borderRadius: 8, padding: '11px 22px', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer' }}>
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
        <div className="lea-fade" style={{ minHeight: 640, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative' }}>
          <button onClick={goHome} style={{ position: 'absolute', top: 24, left: 24, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ position: 'absolute', top: 24, right: 24 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <div style={{ marginBottom: 36 }}><Wordmark size={20} animated /></div>
          <div className="lea-display" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', textAlign: 'center', maxWidth: 480, marginBottom: 10 }}>
            How are you using Leeann?
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400, marginBottom: 36 }}>
            Your account is one or the other — this is where you'll land every time you sign in.
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640 }}>
            <button onClick={() => chooseSignupType('employer')} className="lea-card" style={{ width: 260, textAlign: 'left', padding: 22, borderRadius: 12, cursor: 'pointer', background: 'var(--panel)', border: '1px solid var(--line)' }}>
              <Users size={20} color="var(--wine)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>I'm hiring</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Describe roles in your own words. Leeann structures them, screens candidates, and hands you a clear readout.</div>
            </button>

            <button onClick={() => chooseSignupType('candidate')} className="lea-card" style={{ width: 260, textAlign: 'left', padding: 22, borderRadius: 12, cursor: 'pointer', background: 'var(--panel)', border: '1px solid var(--line)' }}>
              <User size={20} color="var(--gold)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>I'm looking for a job</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Find roles, talk to Leeann, prep and practice, and track every application in one place.</div>
            </button>
          </div>
        </div>
      )}

      {/* AUTH FORM */}
      {screen === 'authForm' && (
        <div className="lea-fade" style={{ minHeight: 640, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative' }}>
          <button onClick={goSignupType} style={{ position: 'absolute', top: 24, left: 24, display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ position: 'absolute', top: 24, right: 24 }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}><Wordmark /></div>
            <Eyebrow color={signupType === 'employer' ? 'var(--wine)' : 'var(--gold)'}>{signupType === 'employer' ? 'Hiring' : 'Candidate'} · Sign in or create an account</Eyebrow>
            <div className="lea-display" style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 18 }}>Tell Leeann about you</div>
            <input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name"
              style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: 10, outline: 'none' }} />
            <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder={signupType === 'employer' ? 'Work email — you@yourcompany.com' : 'Email'} type="email"
              style={{ width: '100%', background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 12px', color: 'var(--text)', fontSize: 13, marginBottom: signupType === 'employer' && isPersonalEmailDomain(authEmail) ? 6 : 10, outline: 'none' }} />
            {signupType === 'employer' && isPersonalEmailDomain(authEmail) && (
              <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 10, lineHeight: 1.4 }}>
                That looks like a personal email — Leeann works best tied to your company domain, so teammates can find the same roles. Fine for a demo, though.
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
                Use demo account for a pitch
              </button>
            )}
            <button
              onClick={submitAuth}
              disabled={!authName.trim() || !authEmail.trim()}
              style={{
                width: '100%', background: authName.trim() && authEmail.trim() ? (signupType === 'employer' ? 'var(--wine)' : 'var(--gold)') : 'var(--line)', border: 'none', borderRadius: 8, padding: '11px 0',
                fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: authName.trim() && authEmail.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Continue
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
              Demo mode — entering any name and email signs you in. Returning with the same email restores your account.
            </div>
          </div>
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

          <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
            <TabButton active={tab === 'hm'} onClick={() => setTab('hm')} icon={Users} label="Calibrate Role" num="01" color="var(--wine)" />
            <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={Activity} label="Dashboard" num="02" color="var(--text)" />
          </div>

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
                  <button onClick={createRole} style={{ background: 'var(--wine)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: 'pointer' }}>
                    Describe your first role
                  </button>
                </div>
              ) : (
              <div style={{ display: 'flex', minHeight: 520 }}>
                <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, borderRight: '1px solid var(--line)' }}>
                  <Eyebrow color="var(--wine)">Describe the role, like you're briefing a recruiter</Eyebrow>

                  {!activeRole.started ? (
                    <div style={{ marginTop: 24, maxWidth: 380, textAlign: 'center' }}>
                      {micSupported && (
                        <div style={{ textAlign: 'left', background: 'var(--wine-dim)', border: '1px solid var(--wine)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                          <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55, marginBottom: 10 }}>
                            <strong>Before you start:</strong> your microphone will stay on for this conversation. Leeann listens continuously and takes notes to build the role profile.
                          </div>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={micConsent} onChange={(e) => setMicConsent(e.target.checked)} style={{ marginTop: 2 }} />
                            I understand and consent to my microphone being used.
                          </label>
                        </div>
                      )}
                      <button
                        onClick={startCalibration}
                        disabled={micSupported && !micConsent}
                        style={{
                          background: micSupported && !micConsent ? 'var(--line)' : 'var(--wine)', border: 'none', borderRadius: 8, padding: '11px 24px',
                          fontSize: 13, fontWeight: 600, color: 'var(--on-accent)', cursor: micSupported && !micConsent ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Start talking with Leeann
                      </button>
                      {!micSupported && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Voice isn't supported in this browser — you'll type instead.</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div
                        className={leeannSpeaking ? 'lea-speaking' : 'lea-idle-glow'}
                        onClick={() => { const m = [...activeRole.hmMessages].reverse().find((x) => x.role === 'assistant'); if (m) speak(m.text); }}
                        title="Hear that again"
                        style={{
                          width: leeannSpeaking ? 150 : 126, height: leeannSpeaking ? 150 : 126, borderRadius: '50%',
                          background: 'var(--panel-alt)', border: '2px solid var(--wine)', overflow: 'hidden', position: 'relative',
                          margin: '20px 0 16px', cursor: 'pointer', transition: 'width 0.35s ease, height 0.35s ease',
                        }}
                      >
                        <div className="lea-orb-a" style={{ position: 'absolute', width: '86%', height: '86%', top: '-7%', left: '-7%', borderRadius: '50%', background: 'var(--wine)', filter: 'blur(20px)', opacity: 0.85 }} />
                        <div className="lea-orb-b" style={{ position: 'absolute', width: '86%', height: '86%', bottom: '-7%', right: '-7%', borderRadius: '50%', background: 'var(--gold)', filter: 'blur(20px)', opacity: 0.85 }} />
                      </div>

                      <div className="lea-mono" style={{ fontSize: 10, color: leeannSpeaking ? 'var(--wine)' : isListening ? 'var(--gold)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14, minHeight: 14 }}>
                        {hmLoading ? 'Leeann is thinking…' : leeannSpeaking ? 'Leeann is speaking…' : isListening ? 'Listening — go ahead…' : 'Tap the circle to hear that again'}
                      </div>

                      {showCaptions && (
                        <div style={{ width: '100%', maxWidth: 400, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                          {[...activeRole.hmMessages].reverse().find((m) => m.role === 'assistant')?.text || '…'}
                        </div>
                      )}

                      {micSupported && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', border: `2px solid ${isListening ? 'var(--gold)' : 'var(--line)'}`,
                            background: isListening ? 'var(--gold-dim)' : 'var(--panel-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: leeannSpeaking || hmLoading ? 0.4 : 1, transition: 'all 0.2s ease',
                          }} className={isListening ? 'lea-speaking' : ''}>
                            <Mic size={15} color={isListening ? 'var(--gold)' : 'var(--text-muted)'} />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, minHeight: 16 }}>{interimTranscript}</div>
                          {micError && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, maxWidth: 360, textAlign: 'center' }}>{micError}</div>}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 400, marginTop: 4 }}>
                        <input value={hmInput} onChange={(e) => setHmInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendHm()}
                          placeholder={micSupported ? 'Or type instead…' : 'e.g. We need a backend engineer for our payments team…'}
                          style={{ flex: 1, background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                        <button onClick={() => sendHm()} disabled={hmLoading} style={{ background: 'var(--wine)', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          {hmLoading ? <Loader2 size={16} className="lea-live-dot" color="var(--on-accent)" /> : <Send size={16} color="var(--on-accent)" />}
                        </button>
                      </div>
                      <button onClick={() => setShowCaptions((v) => !v)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', marginTop: 12 }}>
                        {showCaptions ? 'Hide captions' : 'Show captions (accessibility)'}
                      </button>
                    </>
                  )}
                </div>

                <div style={{ flex: 1, padding: 20, background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Eyebrow color="var(--text-muted)">Role Profile</Eyebrow>
                    <button onClick={syncProfile} disabled={syncing || activeRole.hmMessages.length < 2}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '6px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--wine)', color: 'var(--wine)', cursor: 'pointer' }}>
                      {syncing ? <Loader2 size={12} className="lea-live-dot" /> : <ArrowRight size={12} />}
                      {syncing ? 'Getting up to speed…' : 'Sync Profile'}
                    </button>
                  </div>
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
                      No candidates yet for this role — once someone talks to Leeann about it, they'll show up here.
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
                      Select a candidate from the list to see their conversation, Leeann's recommendation, and record a decision.
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
                          <span className="lea-mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Leeann's recommendation</span>
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
                            This is Leeann's read, not a decision — nothing is sent to the candidate until you confirm below.
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
                              Leeann suggests: {pipelineCandidate.dashSummary.nextStep}
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
                                <button onClick={() => recordDecision(pipelineCandidate.id, 'advance')} style={{ fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 7, border: 'none', background: 'var(--wine)', color: 'var(--on-accent)', cursor: 'pointer' }}>
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
                              Whatever you decide, Leeann automatically prepares the candidate's feedback — every candidate hears what they did well and what to work on, not just the ones who move forward.
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
              <button onClick={goPractice} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--wine)', border: 'none', borderRadius: 6, padding: '7px 12px', color: 'var(--on-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
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
                      <Eyebrow color="var(--gold)">Talking with Leeann about {candidateRole?.title}</Eyebrow>
                      <div ref={candScrollRef} className="lea-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 4px', minHeight: 340 }}>
                        {activeCandidate.messages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} accent="var(--gold)" />)}
                        {activeCandidate.loading && <div className="lea-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Leeann is typing…</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <input value={candInput} onChange={(e) => setCandInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendCand()}
                          placeholder="Ask about the role, team, or expectations…"
                          style={{ flex: 1, background: 'var(--panel-alt)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                        <button onClick={sendCand} disabled={activeCandidate.loading} style={{ background: 'var(--gold)', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
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
                          {activeCandidate.hmDecision === 'advance' && <>The hiring team wants to move forward — Leeann will help set up your next step.</>}
                          {activeCandidate.hmDecision === 'more' && <>The hiring team would like to continue the conversation — Leeann may follow up with more questions.</>}
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
                              <button onClick={() => startApplication(r.id)} style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 7, border: 'none', background: 'var(--gold)', color: 'var(--on-accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Talk to Leeann
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
                      You haven't talked to Leeann about a role yet — find one under "Find Roles."
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
