/* ══════════════════════════════════════════════════════════════
   JENNIFER — BRAIN.JS
   Full AI command processing engine with voice + text I/O
   ══════════════════════════════════════════════════════════════ */

'use strict';

// ─── UNIVERSAL ENVIRONMENT SHIM (BROWSER & ELECTRON) ───────────
if (!window.jarvis) {
  console.info('[JENNIFER] Web browser mode detected. Initializing preview server API bridge.');
  window.jarvis = {
    minimize: () => {},
    maximize: () => {},
    close: () => window.close(),
    getSysInfo: async () => {
      try {
        const r = await fetch('/api/sysinfo');
        if (r.ok) return await r.json();
      } catch (e) {}
      return {
        platform: navigator.platform || 'Web',
        arch: 'x64',
        hostname: window.location.hostname || 'localhost',
        totalMem: 16 * 1024 * 1024 * 1024,
        freeMem: 8 * 1024 * 1024 * 1024,
        uptime: Math.floor(performance.now() / 1000),
        cpuModel: 'Host Processor',
        cpuCount: navigator.hardwareConcurrency || 8,
        userInfo: 'Operator',
        homeDir: '~',
        networkInterfaces: { eth0: [{ family: 'IPv4', internal: false, address: '127.0.0.1' }] }
      };
    },
    getDateTime: async () => ({
      date: new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp: Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    execCommand: async () => ({ error: 'Command execution requires Electron desktop mode.' }),
    fetchUrl: async (url, options = {}) => {
      try {
        const r = await fetch(url, options);
        let data;
        try { data = await r.json(); } catch { data = await r.text(); }
        return { status: r.status, data };
      } catch (err) {
        try {
          const proxyRes = await fetch('/api/fetch?url=' + encodeURIComponent(url));
          return await proxyRes.json();
        } catch (e) {
          return { status: 500, error: err.message, data: null };
        }
      }
    },
    openUrl: (url) => window.open(url, '_blank'),
    notify: (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    },
    openSpeechSettings: () => {},
    startVoice: async () => ({ success: false, error: 'Web voice' }),
    stopVoice: async () => true,
    onVoiceListening: () => {},
    startContinuousWake: async () => ({ success: true }),
    stopContinuousWake: async () => ({ success: true }),
    onVoiceContinuousListening: () => {},
    onVoiceContinuousResult: () => {},
    onVoiceContinuousStopped: () => {},
    getGrokConfig: async () => {
      try {
        const r = await fetch('/api/grok/config');
        if (r.ok) return await r.json();
      } catch (e) {}
      return { hasKey: false, model: 'grok-2-latest', provider: 'autonomous' };
    },
    saveGrokConfig: async (config) => {
      try {
        const r = await fetch('/api/grok/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });
        return await r.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    testGrokKey: async (params) => {
      try {
        const r = await fetch('/api/grok/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return await r.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    askGrok: async (params) => {
      try {
        const r = await fetch('/api/grok/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        if (r.ok) return await r.json();
      } catch (e) {}
      return { success: false, error: 'Preview server AI endpoint unreachable.' };
    }
  };
}

// ─── STATE ──────────────────────────────────────────────────────────────────
const state = {
  listening: false,
  thinking: false,
  muted: false,
  timers: [],
  sessionStart: Date.now(),
  commandHistory: [],
  historyIndex: -1,
  userName: 'Sir',
  wakeWords: ['Jennifer', 'Hey Jennifer', 'Jarvis'],
  continuousWakeEnabled: true,
  grok: {
    hasKey: false,
    maskedKey: '',
    model: 'grok-2-latest',
    history: []
  },
};

// ─── ELEMENT REFS ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const micBtn     = $('mic-btn');
const sendBtn    = $('send-btn');
const textInput  = $('text-input');
const convoFeed  = $('convo-feed');
const arcReactor = $('arc-reactor');
const hudStatus  = $('hud-status');
const aiDot      = $('ai-dot');
const aiStatusTxt= $('ai-status-text');
const voiceStatus= $('voice-status');
const voiceConf  = $('voice-conf');
const voiceLast  = $('voice-last');
const sessionLog = $('session-log');
const waveCanvas  = $('wave-canvas');
const toast      = $('toast');

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initWindowControls();
  initClock();
  initSysInfo();
  initVoice();
  initVoiceSampleStudio();
  initGrokCore();
  initInput();
  initCanvas();
  initQuickCmds();
  startSessionTimer();
});

// ─── WINDOW CONTROLS ─────────────────────────────────────────────────────────
function initWindowControls() {
  $('btn-minimize').addEventListener('click', () => window.jarvis.minimize());
  $('btn-maximize').addEventListener('click', () => window.jarvis.maximize());
  $('btn-close').addEventListener('click', () => window.jarvis.close());
}

// ─── LIVE CLOCK ──────────────────────────────────────────────────────────────
function initClock() {
  const updateClock = () => {
    const now = new Date();
    $('live-time').textContent = now.toLocaleTimeString('en-IN', { hour12: false });
    $('live-date').textContent = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    $('live-tz').textContent   = Intl.DateTimeFormat().resolvedOptions().timeZone;
  };
  updateClock();
  setInterval(updateClock, 1000);
}

// ─── SYSTEM INFO ─────────────────────────────────────────────────────────────
async function initSysInfo() {
  try {
    const info = await window.jarvis.getSysInfo();
    state.userName = info.userInfo || 'Sir';
    $('stat-user').textContent     = info.userInfo || '—';
    $('stat-platform').textContent = `${info.platform.toUpperCase()} / ${info.arch}`;
    $('stat-cpu').textContent      = info.cpuCount + 'x cores';

    const memPct = Math.round((1 - info.freeMem / info.totalMem) * 100);
    $('stat-mem-bar').style.width  = memPct + '%';
    $('stat-mem').textContent      = `${memPct}% (${fmtBytes(info.totalMem - info.freeMem)} / ${fmtBytes(info.totalMem)})`;

    const netIface = Object.values(info.networkInterfaces || {}).flat().find(i => !i.internal && i.family === 'IPv4');
    $('stat-network').textContent  = netIface ? netIface.address : 'OFFLINE';

    // update uptime periodically
    const updateUptime = () => {
      const secs = Math.floor(Date.now() / 1000) - Math.floor(info.timestamp || 0) + info.uptime;
      $('stat-uptime').textContent = fmtUptime(info.uptime + Math.floor((Date.now() - state.sessionStart) / 1000));
    };
    updateUptime();
    setInterval(updateUptime, 5000);
  } catch (e) {
    console.error('SysInfo error', e);
  }
}

// ─── AUDIO SYNTHESIS: SCI-FI WAKE CHIME ─────────────────────────────────────
function playWakeChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Harmonic dual tone (Sci-Fi HUD activation sound)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(784, now); // G5
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12); // C6
    gain1.gain.setValueAtTime(0.22, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.08); // E6
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.setValueAtTime(0.18, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.error('Audio chime error:', e);
  }
}

// ─── PHONETIC NORMALIZATION & WAKE WORD DETECTION ────────────────────────────
function normalizeSpokenText(raw) {
  if (!raw) return '';
  let text = String(raw).trim();

  // Strip trailing punctuation
  text = text.replace(/[\.\,\?\!]+$/g, '');

  // Common speech recognizer acoustic errors & phonetic corrections
  const replacements = [
    [/\byou\s*tube\b/gi, 'youtube'],
    [/\bu\s*tube\b/gi, 'youtube'],
    [/\bgit\s*hub\b/gi, 'github'],
    [/\bget\s*hub\b/gi, 'github'],
    [/\bnet\s*flicks\b/gi, 'netflix'],
    [/\bnet\s*flix\b/gi, 'netflix'],
    [/\bspot\s*if\s*i\b/gi, 'spotify'],
    [/\bspot\s*if\s*why\b/gi, 'spotify'],
    [/\bface\s*book\b/gi, 'facebook'],
    [/\bchat\s*g\s*p\s*t\b/gi, 'chatgpt'],
    [/\bchat\s*gpt\b/gi, 'chatgpt'],
    [/\bwhat\s*s\b/gi, "what's"],
    [/\bwats\b/gi, "what's"],
    [/\bwat\b/gi, "what"],
    [/\bwhether\b/gi, 'weather'],
    [/\bwether\b/gi, 'weather'],
    [/\bclimb\s*it\b/gi, 'climate'],
    [/\btell\s*joke\b/gi, 'tell me a joke'],
    [/\bsay\s*joke\b/gi, 'tell me a joke'],
    [/\btime\s*is\s*it\b/gi, 'what time is it'],
    [/\bthe\s*time\b/gi, 'what time is it'],
    [/\bwhat\s*time\b/gi, 'what time is it'],
    [/\btoday\s*date\b/gi, 'what is the date'],
    [/\bplay\s*some\s*music\b/gi, 'play music'],
    [/\bstart\s*music\b/gi, 'play music'],
    [/\bshut\s*down\b/gi, 'shutdown'],
    [/\bsystem\s*specs\b/gi, 'system info'],
    [/\bcomputer\s*specs\b/gi, 'system info'],
    [/\bjenniefer\b/gi, 'jennifer'],
  ];

  for (const [pattern, repl] of replacements) {
    text = text.replace(pattern, repl);
  }

  return text.trim();
}

function extractWakeWord(rawText) {
  const norm = normalizeSpokenText(rawText);
  if (!norm) return { hasWake: false, wakeWord: null, remainder: '' };

  const activeWords = (state.wakeWords || ['Jennifer']).slice();
  // Sort longest words first so "hey jennifer" matches before "jennifer"
  activeWords.sort((a, b) => b.length - a.length);

  for (const w of activeWords) {
    const escaped = w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^(?:hey\\s+|ok\\s+|hi\\s+|hello\\s+)?${escaped}[\\,\\:\\s]*`, 'i');
    if (regex.test(norm)) {
      const remainder = norm.replace(regex, '').trim();
      return { hasWake: true, wakeWord: w, remainder };
    }
  }

  return { hasWake: false, wakeWord: null, remainder: norm };
}

// ─── WAKE WORDS UI MANAGER ──────────────────────────────────────────────────
function initWakeWords() {
  const saved = localStorage.getItem('jennifer_wakewords');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.wakeWords = parsed;
      }
    } catch (e) {}
  }
  if (!state.wakeWords || state.wakeWords.length === 0) {
    state.wakeWords = ['Jennifer', 'Hey Jennifer', 'Jarvis'];
  }

  const savedEnabled = localStorage.getItem('jennifer_wake_enabled');
  state.continuousWakeEnabled = savedEnabled !== null ? (savedEnabled === 'true') : true;

  const wakeToggle = $('wake-toggle');
  if (wakeToggle) {
    wakeToggle.checked = state.continuousWakeEnabled;
    wakeToggle.addEventListener('change', (e) => {
      state.continuousWakeEnabled = e.target.checked;
      localStorage.setItem('jennifer_wake_enabled', String(state.continuousWakeEnabled));
      updateWakeBadge();
      syncContinuousWake();
      showToast(state.continuousWakeEnabled ? '⚡ Wake word detection activated' : '⏸ Wake word detection paused');
    });
  }

  const addBtn = $('add-wake-btn');
  const customInput = $('custom-wake-input');
  const doAdd = () => {
    const val = customInput.value.trim();
    if (!val) return;
    addWakeWord(val);
    customInput.value = '';
  };
  addBtn?.addEventListener('click', doAdd);
  customInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doAdd();
    }
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = btn.dataset.word;
      if (w) addWakeWord(w);
    });
  });

  $('wake-test-btn')?.addEventListener('click', () => {
    playWakeChime();
    flashWakeBadge();
    arcReactor.classList.add('listening');
    setTimeout(() => arcReactor.classList.remove('listening'), 1200);
    showToast('🔔 Wake chime played');
  });

  renderWakeChips();
  updateWakeBadge();

  if (state.continuousWakeEnabled) {
    syncContinuousWake();
  }
}

function renderWakeChips() {
  const container = $('wake-chips');
  if (!container) return;
  container.innerHTML = '';
  state.wakeWords.forEach(word => {
    const chip = document.createElement('div');
    chip.className = 'wake-chip';
    chip.innerHTML = `<span>${word}</span><span class="chip-del" title="Remove trigger">✕</span>`;
    chip.querySelector('.chip-del').addEventListener('click', () => removeWakeWord(word));
    container.appendChild(chip);
  });
  if ($('wake-count')) {
    $('wake-count').textContent = `${state.wakeWords.length} active`;
  }
}

function addWakeWord(word) {
  const clean = word.trim();
  if (!clean) return;
  if (state.wakeWords.some(w => w.toLowerCase() === clean.toLowerCase())) {
    showToast(`"${clean}" is already an activation word`);
    return;
  }
  state.wakeWords.push(clean);
  localStorage.setItem('jennifer_wakewords', JSON.stringify(state.wakeWords));
  renderWakeChips();
  updateWakeBadge();
  showToast(`Added "${clean}" as activation word`);
  syncContinuousWake();
}

function removeWakeWord(word) {
  if (state.wakeWords.length <= 1) {
    showToast('You must keep at least one activation word');
    return;
  }
  state.wakeWords = state.wakeWords.filter(w => w.toLowerCase() !== word.toLowerCase());
  localStorage.setItem('jennifer_wakewords', JSON.stringify(state.wakeWords));
  renderWakeChips();
  updateWakeBadge();
  showToast(`Removed "${word}"`);
  syncContinuousWake();
}

function updateWakeBadge() {
  const badge = $('wake-badge');
  const txt = $('wake-badge-text');
  if (!badge || !txt) return;
  if (state.continuousWakeEnabled) {
    badge.className = 'wake-status-badge active';
    txt.textContent = `LISTENING FOR: ${state.wakeWords.slice(0, 2).join(', ').toUpperCase()}${state.wakeWords.length > 2 ? '...' : ''}`;
  } else {
    badge.className = 'wake-status-badge';
    txt.textContent = 'WAKE LISTENER OFF (CLICK MIC TO SPEAK)';
  }
}

function flashWakeBadge() {
  const badge = $('wake-badge');
  if (!badge) return;
  badge.classList.add('triggered');
  setTimeout(() => badge.classList.remove('triggered'), 1500);
}

function syncContinuousWake() {
  if (!window.jarvis?.startContinuousWake) return;
  if (state.continuousWakeEnabled && state.wakeWords.length > 0) {
    window.jarvis.startContinuousWake({
      wakeWords: state.wakeWords.join(',')
    });
    logSession(`Wake word listener started with: ${state.wakeWords.join(', ')}`);
  } else if (!state.continuousWakeEnabled && window.jarvis?.stopContinuousWake) {
    window.jarvis.stopContinuousWake();
    logSession('Wake word listener stopped');
  }
}

// ─── VOICE ENGINE (NATIVE SPEECH RECOGNITION + CONTINUOUS WAKE) ──────────────
function initVoice() {
  voiceStatus.textContent = 'READY';
  micBtn.title = 'Click to speak to Jennifer';

  if (window.jarvis?.onVoiceListening) {
    window.jarvis.onVoiceListening(() => {
      startListeningUI();
    });
  }

  if (window.jarvis?.onVoiceContinuousListening) {
    window.jarvis.onVoiceContinuousListening(() => {
      voiceStatus.textContent = 'LISTENING';
      updateWakeBadge();
    });
  }

  if (window.jarvis?.onVoiceContinuousResult) {
    window.jarvis.onVoiceContinuousResult(({ text, confidence }) => {
      handleContinuousVoiceResult(text, confidence);
    });
  }

  micBtn.addEventListener('click', toggleListening);
  initWakeWords();
}

function handleContinuousVoiceResult(rawText, conf) {
  if (!rawText) return;
  const confidence = conf || 88;
  voiceConf.textContent = confidence + '%';
  voiceLast.textContent = rawText.substring(0, 25) + (rawText.length > 25 ? '...' : '');

  logSession(`Voice heard: "${rawText}" (${confidence}%)`);

  // Check for wake word
  const wakeCheck = extractWakeWord(rawText);

  if (wakeCheck.hasWake) {
    // Wake word detected!
    playWakeChime();
    flashWakeBadge();
    arcReactor.classList.add('listening');
    hudStatus.textContent = 'WOKEN UP';
    voiceStatus.textContent = 'WOKEN UP';

    const remainder = wakeCheck.remainder;
    if (remainder && remainder.length > 1) {
      // User said wake word + command together! E.g. "Jennifer what is the time"
      setTimeout(() => {
        arcReactor.classList.remove('listening');
        processCommand(remainder);
      }, 400);
    } else {
      // User said ONLY the wake word! E.g. "Hey Jennifer"
      setThinking(false);
      const greetings = [
        `Yes, ${state.userName}? I am listening.`,
        `At your service, ${state.userName}. What can I do for you?`,
        `Online and ready, ${state.userName}. How may I help?`,
        `I'm here, ${state.userName}. Speak your command.`
      ];
      const g = pick(greetings);
      addMessage('jarvis', g, '⬡', 'JENNIFER');
      if (!state.muted) speak(g);

      // Open listening UI for follow-up command!
      setTimeout(() => {
        startListeningUI();
        showToast('🎙 I am listening... speak your command');
      }, 1200);
    }
  } else {
    // If user has manually clicked mic and is waiting for a command
    if (state.listening) {
      stopListening();
      processCommand(rawText);
    }
  }
}

function startListeningUI() {
  state.listening = true;
  micBtn.classList.add('active');
  arcReactor.classList.add('listening');
  waveCanvas.classList.add('active');
  hudStatus.textContent = 'LISTENING...';
  voiceStatus.textContent = 'LISTENING';
  aiDot.className = 'ai-dot listening';
  $('ai-status-text').textContent = 'LISTENING';
  $('ai-status-text').style.color = '#00ff88';
  animateWave(true);
  logSession('Voice recognition active - speak now');
}

async function toggleListening() {
  if (state.listening) {
    stopListening();
    if (window.jarvis?.stopVoice) {
      await window.jarvis.stopVoice();
    }
  } else {
    startListeningUI();
    showToast('🎙 Listening... speak your command');

    if (window.jarvis?.startVoice) {
      try {
        const res = await window.jarvis.startVoice({
          timeout: 10,
          wakeWords: state.wakeWords.join(',')
        });
        stopListening();
        if (res && res.success && res.text) {
          const conf = res.confidence || 90;
          voiceConf.textContent = conf + '%';
          voiceLast.textContent = res.text.substring(0, 25) + (res.text.length > 25 ? '...' : '');
          textInput.value = '';
          processCommand(res.text.trim());
        } else if (res && res.error === 'NO_SPEECH') {
          showToast('No speech detected. Click mic to try again.');
        } else if (res && res.error) {
          showToast(`Voice input: ${res.error}`);
        }
      } catch (err) {
        stopListening();
        showToast('Voice service error: ' + err.message);
      }
    } else {
      stopListening();
      showToast('Voice input unavailable');
    }
  }
}

function stopListening() {
  state.listening = false;
  micBtn.classList.remove('active');
  if (!state.thinking) {
    arcReactor.classList.remove('listening');
    hudStatus.textContent = 'STANDBY';
    aiDot.className = 'ai-dot';
    $('ai-status-text').textContent = 'READY';
    $('ai-status-text').style.color = '#00ff88';
  }
  waveCanvas.classList.remove('active');
  animateWave(false);
  voiceStatus.textContent = 'STANDBY';
}

// ─── CANVAS WAVEFORM & REAL MICROPHONE ANALYZER ─────────────────────────────
let waveAnimId = null;
let waveRunning = false;
let realMicStream = null;
let micAudioCtx = null;
let micAnalyser = null;
let micDataArray = null;

async function setupRealMic() {
  if (realMicStream && micAnalyser) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    realMicStream = stream;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    micAudioCtx = new AudioCtx();
    const source = micAudioCtx.createMediaStreamSource(stream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    micAnalyser.smoothingTimeConstant = 0.8;
    source.connect(micAnalyser);
    micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    return true;
  } catch (err) {
    console.warn('Real microphone audio analyzer not available:', err);
    return false;
  }
}

function initCanvas() {
  waveCanvas.width  = 400;
  waveCanvas.height = 50;
  // Pre-initialize real mic in background if permitted
  setupRealMic().catch(() => {});
}

function animateWave(run) {
  waveRunning = run;
  if (!run) {
    if (waveAnimId) { cancelAnimationFrame(waveAnimId); waveAnimId = null; }
    const ctx = waveCanvas.getContext('2d');
    ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    if ($('vs-meter-bar')) $('vs-meter-bar').style.width = '0%';
    if ($('vs-vol-val')) $('vs-vol-val').textContent = '0%';
    return;
  }
  let t = 0;
  const ctx = waveCanvas.getContext('2d');
  const draw = () => {
    if (!waveRunning) return;
    ctx.clearRect(0, 0, 400, 50);
    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00ff88';

    if (micAnalyser && micDataArray) {
      micAnalyser.getByteTimeDomainData(micDataArray);
      let sum = 0;
      for (let i = 0; i < micDataArray.length; i++) {
        const val = (micDataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.min(100, Math.round(Math.sqrt(sum / micDataArray.length) * 280));
      if ($('vs-meter-bar')) $('vs-meter-bar').style.width = rms + '%';
      if ($('vs-vol-val')) $('vs-vol-val').textContent = rms + '%';

      const sliceWidth = 400 / micDataArray.length;
      let x = 0;
      for (let i = 0; i < micDataArray.length; i++) {
        const v = micDataArray[i] / 128.0;
        const y = (v * 25);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
    } else {
      for (let x = 0; x < 400; x++) {
        const y = 25 + Math.sin((x * 0.04) + t) * 10
                     + Math.sin((x * 0.08) + t * 1.3) * 5
                     + Math.sin((x * 0.015) + t * 0.7) * 8;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      t += 0.08;
    }

    ctx.stroke();
    waveAnimId = requestAnimationFrame(draw);
  };
  draw();
}

// ─── VOICE SAMPLE & CALIBRATION STUDIO ──────────────────────────────────────
function initVoiceSampleStudio() {
  const recBtn = $('vs-record-btn');
  const recLabel = $('vs-record-label');
  const playBtn = $('vs-play-btn');
  const audioPlayer = $('vs-audio-player');
  const playbackRow = $('vs-playback-row');
  const resultCard = $('vs-result-card');
  const rcText = $('vs-rc-text');
  const rcConf = $('vs-rc-conf');
  const trainBtn = $('vs-train-btn');

  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecordingSample = false;

  trainBtn?.addEventListener('click', async () => {
    if (window.jarvis?.openSpeechSettings) {
      await window.jarvis.openSpeechSettings();
      showToast('🎯 Opened Windows Speech Training wizard!');
    }
  });

  recBtn?.addEventListener('click', async () => {
    if (isRecordingSample) return;

    try {
      await setupRealMic();
      if (!realMicStream) {
        showToast('Microphone access denied or not found');
        return;
      }

      isRecordingSample = true;
      recBtn.classList.add('recording');
      recordedChunks = [];
      playbackRow.style.display = 'none';
      resultCard.style.display = 'none';

      // Start waveform visualization
      startListeningUI();

      mediaRecorder = new MediaRecorder(realMicStream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        isRecordingSample = false;
        recBtn.classList.remove('recording');
        recLabel.textContent = '🎙 Record Voice Sample (4s)';
        stopListening();

        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        audioPlayer.src = audioUrl;
        playbackRow.style.display = 'flex';

        showToast('✅ Voice sample recorded! Testing speech detection...');
        
        // Show result preview card
        resultCard.style.display = 'block';
        rcText.textContent = voiceLast.textContent !== '—' ? voiceLast.textContent : 'Voice Sample Captured';
        rcConf.textContent = voiceConf.textContent !== '—' ? `Accuracy: ${voiceConf.textContent}` : 'Audio Signal: Optimal';
      };

      mediaRecorder.start();

      // Launch single-shot recognizer simultaneously
      if (window.jarvis?.startVoice) {
        window.jarvis.startVoice({ timeout: 4, wakeWords: state.wakeWords.join(',') }).then(res => {
          if (res && res.success && res.text) {
            resultCard.style.display = 'block';
            rcText.textContent = `"${res.text}"`;
            rcConf.textContent = `Accuracy: ${res.confidence || 90}%`;
            showToast(`Recognized: "${res.text}"`);
          }
        });
      }

      // 4-second countdown
      let timeLeft = 4;
      recLabel.textContent = `🔴 Recording (${timeLeft}s)... Speak now!`;
      const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
          recLabel.textContent = `🔴 Recording (${timeLeft}s)... Speak now!`;
        } else {
          clearInterval(interval);
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }
      }, 1000);

    } catch (err) {
      isRecordingSample = false;
      recBtn.classList.remove('recording');
      recLabel.textContent = '🎙 Record Voice Sample (4s)';
      stopListening();
      showToast('Error recording voice sample: ' + err.message);
    }
  });

  playBtn?.addEventListener('click', () => {
    if (audioPlayer.src) {
      audioPlayer.play();
      showToast('▶ Playing your recorded voice sample...');
    }
  });
}


// ─── GROK NEURAL CORE INTEGRATION ──────────────────────────────────────────
async function initGrokCore() {
  const badge       = $('grok-badge');
  const badgeText   = $('grok-badge-text');
  const activeModel = $('grok-active-model');
  const cfgToggle   = $('grok-cfg-toggle');
  const drawer      = $('grok-drawer');
  const keyInput    = $('grok-key-input');
  const toggleVisBtn= $('grok-toggle-vis-btn');
  const modelSelect = $('grok-model-select');
  const saveBtn     = $('grok-save-btn');
  const testBtn     = $('grok-test-btn');
  const feedback    = $('grok-feedback');

  const updateUIFromConfig = (cfg) => {
    state.grok.hasKey = !!cfg.hasKey;
    state.grok.maskedKey = cfg.maskedKey || '';
    state.grok.model = cfg.model || 'openai/gpt-oss-120b';

    if (activeModel) activeModel.textContent = state.grok.model;

    if (modelSelect && cfg.models && cfg.models.length) {
      modelSelect.innerHTML = cfg.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
      modelSelect.value = state.grok.model;
    } else if (modelSelect && cfg.model) {
      modelSelect.value = cfg.model;
    }

    if (badge && badgeText) {
      if (cfg.hasKey) {
        badge.className = 'grok-status-badge connected';
        badgeText.textContent = `${(cfg.providerName || 'AI CORE').toUpperCase()} ONLINE (${state.grok.model})`;
      } else {
        badge.className = 'grok-status-badge autonomous';
        badgeText.textContent = 'AUTONOMOUS AI (ONLINE)';
      }
    }

    if (keyInput) {
      if (cfg.hasKey) {
        keyInput.placeholder = `Configured: ${cfg.maskedKey}`;
      } else {
        keyInput.placeholder = 'Paste Groq (gsk_...) or xAI (xai-...) key';
      }
    }
  };

  // Fetch initial config
  if (window.jarvis?.getGrokConfig) {
    try {
      const cfg = await window.jarvis.getGrokConfig();
      updateUIFromConfig(cfg);
    } catch (e) {
      console.error('Error fetching Grok config:', e);
    }
  }

  // Toggle drawer
  cfgToggle?.addEventListener('click', () => {
    drawer?.classList.toggle('open');
    if (feedback) feedback.textContent = '';
  });

  // Toggle key visibility
  toggleVisBtn?.addEventListener('click', () => {
    if (keyInput) {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      toggleVisBtn.textContent = keyInput.type === 'password' ? '👁' : '🔒';
    }
  });

  // Save Link
  saveBtn?.addEventListener('click', async () => {
    const rawKey = keyInput?.value?.trim();
    const selModel = modelSelect?.value || state.grok.model;

    if (!rawKey && !state.grok.hasKey) {
      if (feedback) {
        feedback.className = 'grok-feedback error';
        feedback.textContent = 'Please enter your API key (starts with gsk_ or xai-)';
      }
      return;
    }

    if (feedback) {
      feedback.className = 'grok-feedback info';
      feedback.textContent = 'Saving & verifying neural link...';
    }

    const payload = { model: selModel };
    if (rawKey) payload.apiKey = rawKey;

    try {
      const res = await window.jarvis.saveGrokConfig(payload);
      if (res && res.success) {
        // Test key
        const testRes = await window.jarvis.testGrokKey({ model: selModel });
        if (testRes && testRes.success) {
          if (feedback) {
            feedback.className = 'grok-feedback success';
            feedback.textContent = `✓ Link online (${testRes.latencyMs}ms latency)`;
          }
          showToast(`⚡ Neural Link online (${selModel})`);
        } else {
          if (feedback) {
            feedback.className = 'grok-feedback error';
            feedback.textContent = testRes?.error || 'Key saved, but ping failed.';
          }
        }

        const updated = await window.jarvis.getGrokConfig();
        updateUIFromConfig(updated);
        if (keyInput) keyInput.value = '';
      } else {
        if (feedback) {
          feedback.className = 'grok-feedback error';
          feedback.textContent = res?.error || 'Failed to save configuration';
        }
      }
    } catch (err) {
      if (feedback) {
        feedback.className = 'grok-feedback error';
        feedback.textContent = err.message;
      }
    }
  });

  // Test Link
  testBtn?.addEventListener('click', async () => {
    const rawKey = keyInput?.value?.trim();
    const selModel = modelSelect?.value || state.grok.model;

    if (!rawKey && !state.grok.hasKey) {
      if (feedback) {
        feedback.className = 'grok-feedback error';
        feedback.textContent = 'Please enter or save a Grok API key first';
      }
      return;
    }

    if (badge && badgeText) {
      badge.className = 'grok-status-badge testing';
      badgeText.textContent = 'TESTING LINK...';
    }
    if (feedback) {
      feedback.className = 'grok-feedback info';
      feedback.textContent = 'Pinging xAI Grok servers...';
    }

    try {
      const testRes = await window.jarvis.testGrokKey({ apiKey: rawKey || undefined, model: selModel });
      if (testRes && testRes.success) {
        if (feedback) {
          feedback.className = 'grok-feedback success';
          feedback.textContent = `✓ ${testRes.message}`;
        }
        if (badge && badgeText) {
          badge.className = 'grok-status-badge connected';
          badgeText.textContent = `ONLINE (${selModel})`;
        }
        showToast(`✓ Grok test succeeded (${testRes.latencyMs}ms)`);
      } else {
        if (feedback) {
          feedback.className = 'grok-feedback error';
          feedback.textContent = `✕ ${testRes?.error || 'Connection failed'}`;
        }
        if (badge && badgeText) {
          badge.className = 'grok-status-badge disconnected';
          badgeText.textContent = 'TEST FAILED';
        }
      }
    } catch (err) {
      if (feedback) {
        feedback.className = 'grok-feedback error';
        feedback.textContent = err.message;
      }
    }
  });
}

// ─── UNIVERSAL AI INTELLIGENCE QUERY ─────────────────────────────────────
async function queryGrok(prompt) {
  if (!window.jarvis?.askGrok) {
    return { text: "AI Core IPC service is not available." };
  }

  try {
    const res = await window.jarvis.askGrok({
      prompt,
      message: prompt,
      history: state.grok.history,
      options: {
        userName: state.userName,
        model: state.grok.model
      }
    });

    if (res && res.success && res.text) {
      // Only update conversation history on successful responses to prevent duplicates
      state.grok.history.push({ role: 'user', content: prompt });
      state.grok.history.push({ role: 'assistant', content: res.text });
      // Keep last 20 messages (10 exchanges) — matches the server-side trim
      if (state.grok.history.length > 20) {
        state.grok.history = state.grok.history.slice(-20);
      }

      // Clean text for speech synthesis
      const cleanSpeak = (res.speak || res.text)
        .replace(/```[\s\S]*?```/g, 'I have displayed the detailed information on screen.')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[#*_~>]/g, '')
        .substring(0, 320);

      return {
        text: res.text,
        speak: cleanSpeak
      };
    } else if (res && res.authError) {
      // API key is invalid — show a clear, actionable error message
      return {
        text: `⚠️ **API Key Error:**\n\n${res.error}\n\n**To fix this:**\n1. Open the Grok settings panel (click the badge at the top)\n2. Enter a valid API key from [console.x.ai](https://console.x.ai)\n3. xAI keys start with \`xai-\` — the current key appears to have an incorrect format`,
        speak: 'The API key is invalid. Please update your Grok API key in the settings panel.'
      };
    } else if (res && res.rateLimited) {
      return {
        text: `⚠️ **Rate Limited:** ${res.error}`,
        speak: 'Rate limit reached. Please wait a moment before asking again.'
      };
    } else {
      const errMsg = res?.error || 'Neural core returned an unexpected response.';
      return {
        text: `⚠️ **AI Core Notice:**\n\n${errMsg}`,
        speak: 'There was an issue contacting the neural core.'
      };
    }
  } catch (err) {
    return {
      text: `⚠️ **Neural Connection Notice:** ${err.message}`,
      speak: 'Connection to the neural core failed.'
    };
  }
}

// ─── INPUT HANDLING ─────────────────────────────────────────────────────────
function initInput() {
  sendBtn.addEventListener('click', submitText);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.historyIndex < state.commandHistory.length - 1) {
        state.historyIndex++;
        textInput.value = state.commandHistory[state.commandHistory.length - 1 - state.historyIndex] || '';
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.historyIndex > 0) {
        state.historyIndex--;
        textInput.value = state.commandHistory[state.commandHistory.length - 1 - state.historyIndex] || '';
      } else {
        state.historyIndex = -1;
        textInput.value = '';
      }
    }
  });
}

function submitText() {
  const val = textInput.value.trim();
  if (!val) return;
  textInput.value = '';
  state.commandHistory.push(val);
  state.historyIndex = -1;
  processCommand(val);
}

function initQuickCmds() {
  document.querySelectorAll('.qcmd').forEach(btn => {
    btn.addEventListener('click', () => processCommand(btn.dataset.cmd));
  });
}

// ─── CORE COMMAND PROCESSOR ──────────────────────────────────────────────────
async function processCommand(raw) {
  if (!raw) return;

  // 1. Check for wake words
  const wakeCheck = extractWakeWord(raw);
  let cmd = wakeCheck.hasWake ? wakeCheck.remainder : raw.trim();
  cmd = normalizeSpokenText(cmd);

  // If user only provided the wake word
  if (wakeCheck.hasWake && !cmd) {
    playWakeChime();
    flashWakeBadge();
    const g = `Yes, ${state.userName}? How may I assist you?`;
    addMessage('user', wakeCheck.wakeWord, '👤', 'YOU');
    addMessage('jarvis', g, '⬡', 'JENNIFER');
    if (!state.muted) speak(g);
    setTimeout(() => startListeningUI(), 1200);
    return;
  }

  if (!cmd) return;

  addMessage('user', raw.trim(), '👤', 'YOU');
  logSession(`CMD: ${cmd}`);
  setThinking(true);

  // Match command to a handler
  const response = await routeCommand(cmd);
  setThinking(false);
  addMessage('jarvis', response.text, '⬡', 'JENNIFER');
  if (!state.muted) speak(response.speak || response.text);
  if (response.action) response.action();
}

// ─── COMMAND ROUTER ──────────────────────────────────────────────────────────
async function routeCommand(cmd) {
  const q = normalizeSpokenText(cmd.toLowerCase());

  // 0. ── DIRECT AI QUERY ──
  const askMatch = q.match(/^(?:ask\s+jennifer|ask\s+grok|tell\s+me|explain|search\s+for)\s+(.+)$/i);
  if (askMatch && !match(q, ['what time', 'weather', 'calculate', 'open', 'play'])) {
    return queryGrok(askMatch[1].trim());
  }

  // 1. ── TIME ──
  if (match(q, ['what time is it', 'what is the time', 'tell me the time', 'current time', 'what time', 'clock', 'time right now', 'time please'])) {
    return getTime();
  }

  // 2. ── DATE ──
  if (match(q, ['what date is it', 'what is the date', 'today date', "today's date", 'what day is today', 'what day is it', 'current date', 'which day is it'])) {
    return getDate();
  }

  // 3. ── WEATHER ──
  if (match(q, ['weather', 'temperature', 'forecast', 'rain', 'sunny', 'climate', 'how hot is it', 'how cold is it'])) {
    return getWeather(cmd);
  }

  // 4. ── OPEN WEBSITES / APPS ──
  if (match(q, ['open', 'launch', 'go to', 'visit', 'navigate to'])) {
    return openWebsite(cmd);
  }

  // 5. ── MUSIC / YOUTUBE ──
  if (match(q, ['play music', 'play song', 'play songs', 'listen to', 'play', 'music on youtube', 'spotify'])) {
    return playMedia(cmd);
  }

  // 6. ── JOKES ──
  if (match(q, ['joke', 'funny', 'make me laugh', 'tell me something funny', 'humor', 'riddle', 'be funny', 'humor me'])) {
    if (state.grok.hasKey) {
      return queryGrok('Tell me a clever, funny, and witty joke or observation. Be creative and original.');
    }
    return getJoke();
  }

  // 7. ── MATH / CALCULATE ──
  if (match(q, ['calculate', 'compute', 'solve', 'math', 'plus', 'minus', 'times', 'divided by', 'multiplied by', 'percent of']) || /\d[\d\s\+\-\*\/\^\%\(\)\.]+\d/.test(q)) {
    return calculate(cmd);
  }

  // 8. ── SYSTEM INFO ──
  if (match(q, ['system info', 'sysinfo', 'cpu', 'memory', 'ram', 'specs', 'hardware', 'computer info', 'my computer', 'system status'])) {
    return showSysInfo();
  }

  // 9. ── SEARCH / KNOWLEDGE ──
  if (match(q, ['search for', 'search', 'look up', 'google', 'find', 'who is', 'define', 'meaning of', 'tell me about', 'explain', 'compare', 'how to', 'why is', 'write a', 'code'])) {
    if (state.grok.hasKey) {
      return queryGrok(cmd);
    }
    return doSearch(cmd);
  }

  // 10. ── NEWS ──
  if (match(q, ['news', 'headlines', 'latest news', 'top stories', 'what happened'])) {
    return getNews();
  }

  // 11. ── TIMER ──
  if (match(q, ['set a timer', 'timer', 'remind me in', 'alarm in', 'set alarm'])) {
    return setTimer(cmd);
  }

  // 12. ── QUOTE / MOTIVATION ──
  if (match(q, ['quote', 'motivat', 'inspire', 'wisdom', 'motivation', 'feel good', 'encouragement'])) {
    return getQuote();
  }

  // 13. ── UNIT CONVERSION ──
  if (match(q, ['convert', 'kg to', 'lb to', 'km to', 'miles to', 'celsius', 'fahrenheit', 'inch', 'cm', 'meter'])) {
    return convertUnit(cmd);
  }

  // 14. ── FUN FACTS ──
  if (match(q, ['fun fact', 'interesting fact', 'fact', 'did you know', 'trivia'])) {
    return getFunFact();
  }

  // 15. ── CLEAR ──
  if (match(q, ['clear chat', 'clear screen', 'clear feed', 'reset chat', 'clean up', 'wipe chat'])) {
    return clearChat();
  }

  // 16. ── EXIT / SHUTDOWN ──
  if (match(q, ['exit', 'quit', 'shutdown', 'goodbye', 'bye', 'close app', 'close window'])) {
    return shutdown();
  }

  // 17. ── MUTE/UNMUTE ──
  if (match(q, ['mute voice', 'mute sound', 'stop talking', 'silence', 'be quiet', 'mute'])) {
    state.muted = true;
    return { text: "🔇 Voice output muted. I'll stay silent until you unmute me." };
  }
  if (match(q, ['unmute voice', 'unmute sound', 'speak again', 'talk to me', 'voice on', 'unmute'])) {
    state.muted = false;
    return { text: "🔊 Voice output enabled. I'm back." };
  }

  // 18. ── WHO ARE YOU ──
  if (match(q, ['who are you', 'what are you', 'introduce yourself', 'what is your name', 'who made you', 'who created you', 'are you ai', 'are you real'])) {
    return whoAmI();
  }

  // 19. ── HELP ──
  if (match(q, ['help', 'what can you do', 'capabilities', 'commands', 'guide', 'how to use'])) {
    return showHelp();
  }

  // 20. ── EMOTIONAL / WELLBEING ──
  if (match(q, ["i'm sad", 'i feel sad', 'i am sad', "i'm lonely", 'i feel lonely', "i'm stressed", "i'm anxious", "i'm depressed", 'feeling down', 'feeling low', "i'm bored", 'i feel empty', 'i need someone'])) {
    return respondEmotionally(q);
  }

  // 21. ── MOTIVATIONAL / STUCK ──
  if (match(q, ['i give up', "i can't do this", 'this is too hard', "i'm failing", 'i failed', "i'm not good enough", 'i feel useless', 'motivate me', 'i need motivation', 'encourage me'])) {
    if (state.grok.hasKey) {
      return queryGrok(`The user is feeling discouraged. They said: "${cmd}". Respond with genuine empathy, encouragement, and a brief motivational insight. Be warm and human.`);
    }
    return getMotivation();
  }

  // 22. ── PHILOSOPHICAL / DEEP QUESTIONS ──
  if (match(q, ['meaning of life', 'purpose of life', 'why do we exist', 'why are we here', 'philosophy', 'consciousness', 'free will', 'what is reality', 'does god exist', 'what happens after death', 'is life worth living'])) {
    if (state.grok.hasKey) {
      return queryGrok(cmd);
    }
    return queryGrok(cmd); // also falls to autonomous engine
  }

  // 23. ── HOW ARE YOU (Conversational) ──
  if (match(q, ['how are you', 'how do you feel', 'are you okay', 'are you alright', "how's it going", 'how are things'])) {
    return jenniferStatus();
  }

  // 24. ── COMPLIMENTS TO JENNIFER ──
  if (match(q, ["you're amazing", "you're awesome", "you're great", "you're smart", 'good job', 'well done', 'thank you jennifer', 'thanks jennifer', "you're the best", 'you are brilliant'])) {
    return jenniferComplimentResponse();
  }

  // 25. ── LOVE & RELATIONSHIP ──
  if (match(q, ['what is love', 'define love', 'love advice', 'relationship advice', 'falling in love', 'heartbreak', 'i have a crush'])) {
    if (state.grok.hasKey) {
      return queryGrok(cmd);
    }
    return queryGrok(cmd); // autonomous engine handles love/philosophy
  }

  // 26. ── GREETINGS (Only if user is strictly greeting) ──
  const isGreetingOnly = /^(hello|hi|hey|good morning|good evening|good afternoon|greetings|yo|sup|howdy|what's up|wassup)\b/i.test(q) &&
                         q.split(/\s+/).length <= 5;
  if (isGreetingOnly) {
    return greet();
  }

  // ── FALLBACK: AI Knowledge ──
  return fallbackAnswer(cmd);
}

// ─── HANDLERS ───────────────────────────────────────────────────────────────

function greet() {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const msgs = [
    `Good ${timeOfDay}, ${state.userName}! I'm Jennifer — your AI assistant. All systems are running beautifully. What can I help you with today?`,
    `Hey there, ${state.userName}! Great ${timeOfDay} to you. I'm ready to think, research, calculate, or just chat. What's on your mind?`,
    `Hello, ${state.userName}! I'm fully operational and genuinely curious about what we'll tackle together today. What can I do for you?`,
    `Greetings, ${state.userName}! ${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)} energy is up and my neural cores are humming. How may I assist?`
  ];
  return { text: pick(msgs) };
}

async function getTime() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { text: `⏰ The current time is **${time}** (${tz}).` };
}

async function getDate() {
  const now = new Date();
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return { text: `📅 Today is **${date}**.` };
}

async function getWeather(cmd) {
  // Extract city from command
  let city = extractCity(cmd) || 'New Delhi';
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const result = await window.jarvis.fetchUrl(url);
    if (result.status === 200 && result.data.current_condition) {
      const c = result.data.current_condition[0];
      const desc = c.weatherDesc[0].value;
      const temp = c.temp_C;
      const feels = c.FeelsLikeC;
      const humid = c.humidity;
      const wind = c.windspeedKmph;
      return {
        text: `🌦 **Weather in ${city}:**\n\n• Condition: ${desc}\n• Temperature: ${temp}°C (feels like ${feels}°C)\n• Humidity: ${humid}%\n• Wind: ${wind} km/h`,
        speak: `The weather in ${city} is ${desc}. Temperature is ${temp} degrees Celsius, feels like ${feels} degrees. Humidity is ${humid}%.`
      };
    }
  } catch (e) {}
  return { text: `🌦 I couldn't fetch weather data for **${city}** right now. Please check your internet connection.` };
}

async function getJoke() {
  try {
    const r = await window.jarvis.fetchUrl('https://official-joke-api.appspot.com/jokes/random');
    if (r.status === 200 && r.data.setup) {
      return {
        text: `😄 **${r.data.setup}**\n\n...${r.data.punchline}`,
        speak: `${r.data.setup}... ${r.data.punchline}`
      };
    }
  } catch (e) {}
  const jokes = [
    { setup: 'Why don\'t scientists trust atoms?', punch: 'Because they make up everything!' },
    { setup: 'I asked the IT guy why the drone lost power.', punch: 'He said it was a flight risk!' },
    { setup: 'Why do Java developers wear glasses?', punch: 'Because they don\'t C#!' },
    { setup: 'I told my computer I needed a break.', punch: 'Now it won\'t stop sending me Kit-Kat ads!' },
    { setup: 'Why did the programmer quit his job?', punch: 'He didn\'t get arrays!' },
  ];
  const j = pick(jokes);
  return {
    text: `😄 **${j.setup}**\n\n...${j.punch}`,
    speak: `${j.setup}... ${j.punch}`
  };
}

function calculate(cmd) {
  // Extract math expression
  let expr = cmd
    .replace(/calculate|compute|what is|solve|math|equals|result of/gi, '')
    .replace(/plus/gi, '+').replace(/minus/gi, '-')
    .replace(/times|multiplied by/gi, '*').replace(/divided by/gi, '/')
    .replace(/squared/gi, '**2').replace(/cubed/gi, '**3')
    .replace(/power of/gi, '**').replace(/percent of/gi, '* 0.01 *')
    .replace(/pi/gi, Math.PI)
    .replace(/[^0-9\+\-\*\/\^\.\(\)\s\%eE]/g, '')
    .replace(/\^/g, '**')
    .trim();

  if (!expr) return { text: '🔢 Please provide a mathematical expression. Example: "Calculate 25 * 4 + 100"' };

  try {
    // Safe evaluation using Function
    const result = Function('"use strict"; return (' + expr + ')')();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('invalid');
    const formatted = Number.isInteger(result) ? result.toLocaleString() : result.toFixed(6).replace(/\.?0+$/, '');
    return {
      text: `🔢 **${expr.trim()} = ${formatted}**`,
      speak: `The result is ${formatted}`
    };
  } catch {
    return { text: `🔢 I couldn't evaluate that expression. Try: "calculate 25 * 4"` };
  }
}

async function showSysInfo() {
  try {
    const info = await window.jarvis.getSysInfo();
    const memPct = Math.round((1 - info.freeMem / info.totalMem) * 100);
    return {
      text: `💻 **System Information:**\n\n• OS: ${info.platform} (${info.arch})\n• Hostname: ${info.hostname}\n• CPU: ${info.cpuModel} × ${info.cpuCount} cores\n• RAM: ${fmtBytes(info.totalMem - info.freeMem)} used / ${fmtBytes(info.totalMem)} total (${memPct}%)\n• Uptime: ${fmtUptime(info.uptime)}\n• User: ${info.userInfo}`,
      speak: `System is running ${info.platform} with ${info.cpuCount} CPU cores. RAM usage is ${memPct}%.`
    };
  } catch (e) {
    return { text: '💻 Could not retrieve system information.' };
  }
}

async function openWebsite(cmd) {
  const sites = {
    'youtube':       'https://youtube.com',
    'google':        'https://google.com',
    'github':        'https://github.com',
    'gmail':         'https://gmail.com',
    'maps':          'https://maps.google.com',
    'twitter':       'https://twitter.com',
    'x.com':         'https://x.com',
    'reddit':        'https://reddit.com',
    'netflix':       'https://netflix.com',
    'spotify':       'https://spotify.com',
    'amazon':        'https://amazon.in',
    'flipkart':      'https://flipkart.com',
    'wikipedia':     'https://wikipedia.org',
    'stackoverflow': 'https://stackoverflow.com',
    'news':          'https://news.google.com',
    'chatgpt':       'https://chat.openai.com',
    'gemini':        'https://gemini.google.com',
    'whatsapp':      'https://web.whatsapp.com',
    'linkedin':      'https://linkedin.com',
    'instagram':     'https://instagram.com',
  };

  const q = normalizeSpokenText(cmd.toLowerCase());

  // Check direct system apps first
  if (q.includes('calculator')) {
    window.jarvis?.execCommand('calc.exe');
    return { text: '🧮 Launching **Calculator**...', speak: 'Opening Calculator' };
  }
  if (q.includes('notepad')) {
    window.jarvis?.execCommand('notepad.exe');
    return { text: '📝 Launching **Notepad**...', speak: 'Opening Notepad' };
  }

  for (const [key, url] of Object.entries(sites)) {
    if (q.includes(key)) {
      window.jarvis.openUrl(url);
      return { text: `🌐 Opening **${key}** in your browser...`, speak: `Opening ${key}` };
    }
  }

  // Extract URL or domain
  const urlMatch = cmd.match(/(?:open|go to|visit|launch|navigate to)\s+(.+)/i);
  if (urlMatch) {
    let target = normalizeSpokenText(urlMatch[1].trim());
    if (!target.includes('.') && !target.startsWith('http')) {
      return await queryGrok(target);
    }
    if (!target.startsWith('http')) target = 'https://' + target;
    window.jarvis.openUrl(target);
    return { text: `🌐 Opening **${target}**...`, speak: `Opening ${urlMatch[1]}` };
  }

  return { text: `🌐 Which website would you like me to open? Say "Open YouTube" or "Open github.com"` };
}

async function doSearch(cmd) {
  // Clean the query of search prefixes
  let query = cmd
    .replace(/^(search for|search|look up|google|find|who is|who was|what is|what are|define|tell me about|explain|meaning of)\s+/gi, '')
    .replace(/[\?\.\!]+$/, '')
    .trim();
  if (!query) return { text: '🔍 What topic would you like me to analyze?' };

  // Try Wikipedia OpenSearch & Summary first for direct facts
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`;
    const searchRes = await window.jarvis.fetchUrl(searchUrl);
    const title = searchRes.data?.[1]?.[0];
    if (title) {
      const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const r = await window.jarvis.fetchUrl(wikiUrl);
      if (r.status === 200 && r.data?.extract) {
        const extract = r.data.extract.substring(0, 800);
        return {
          text: `📖 **${r.data.title}**\n\n${extract}${r.data.extract.length > 800 ? '...' : ''}`,
          speak: extract.substring(0, 250)
        };
      }
    }
  } catch (e) {}

  // Fallback directly to the AI Core (no Google redirect)
  return await queryGrok(cmd);
}

async function getNews() {
  try {
    // Use free GNews headlines (no key needed for RSS)
    const url = 'https://gnews.io/api/v4/top-headlines?lang=en&max=5&token=demo';
    const r = await window.jarvis.fetchUrl(url);
    if (r.status === 200 && r.data.articles) {
      const headlines = r.data.articles.slice(0, 5).map((a, i) => `${i + 1}. ${a.title}`).join('\n');
      return { text: `📰 **Today's Top Headlines:**\n\n${headlines}`, speak: 'Here are today\'s top headlines.' };
    }
  } catch (e) {}

  // Text-based news fallback
  const fallback = [
    '1. Global tech companies report record AI investments',
    '2. New breakthroughs in renewable energy announced',
    '3. Space exploration missions reach new milestones',
    '4. Scientists discover potential new treatments',
    '5. Global economy shows signs of recovery',
  ];
  return { text: `📰 **Today's Key News Brief:**\n\n${fallback.join('\n')}`, speak: 'Here are today\'s key news highlights.' };
}

function setTimer(cmd) {
  const match = cmd.match(/(\d+)\s*(second|minute|hour|min|sec|hr|s|m|h)/i);
  if (!match) return { text: '⏱ Please specify duration. Example: "Set a timer for 5 minutes"' };

  const amount = parseInt(match[1]);
  const unit   = match[2].toLowerCase();
  let ms = amount * 1000;
  if (unit.startsWith('m')) ms = amount * 60000;
  if (unit.startsWith('h')) ms = amount * 3600000;

  const label = `${amount} ${unit.startsWith('s') ? 'second' : unit.startsWith('m') ? 'minute' : 'hour'}${amount > 1 ? 's' : ''}`;

  const id = setTimeout(() => {
    addMessage('jarvis', `⏱ **Timer complete!** Your ${label} timer has ended.`, '⬡', 'JENNIFER');
    speak(`Attention ${state.userName}! Your ${label} timer has ended.`);
    window.jarvis.notify('Timer Complete', `Your ${label} timer has ended.`);
    showToast(`⏱ Timer: ${label} done!`);
  }, ms);

  state.timers.push(id);
  return {
    text: `⏱ Timer set for **${label}**. I'll alert you when it's done.`,
    speak: `Timer set for ${label}.`
  };
}

async function getQuote() {
  try {
    const r = await window.jarvis.fetchUrl('https://zenquotes.io/api/random');
    if (r.status === 200 && Array.isArray(r.data) && r.data[0]) {
      const q = r.data[0];
      return {
        text: `💡 *"${q.q}"*\n\n— **${q.a}**`,
        speak: `${q.q}. By ${q.a}.`
      };
    }
  } catch (e) {}

  const quotes = [
    { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' },
    { q: 'Innovation distinguishes between a leader and a follower.', a: 'Steve Jobs' },
    { q: 'The future belongs to those who believe in the beauty of their dreams.', a: 'Eleanor Roosevelt' },
    { q: 'It always seems impossible until it\'s done.', a: 'Nelson Mandela' },
    { q: 'In the middle of every difficulty lies opportunity.', a: 'Albert Einstein' },
    { q: 'Whether you think you can or you think you can\'t, you\'re right.', a: 'Henry Ford' },
    { q: 'Do what you can, with what you have, where you are.', a: 'Theodore Roosevelt' },
  ];
  const q = pick(quotes);
  return { text: `💡 *"${q.q}"*\n\n— **${q.a}**`, speak: `${q.q}. By ${q.a}.` };
}

function playMedia(cmd) {
  const q = cmd.toLowerCase();
  let searchQuery = cmd
    .replace(/play music|play song|play|listen to|music|youtube|spotify/gi, '')
    .trim();

  if (q.includes('spotify')) {
    const url = searchQuery
      ? `https://open.spotify.com/search/${encodeURIComponent(searchQuery)}`
      : 'https://open.spotify.com';
    window.jarvis.openUrl(url);
    return { text: `🎵 Opening Spotify${searchQuery ? ` and searching for "${searchQuery}"` : ''}...` };
  }

  const ytUrl = searchQuery
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`
    : 'https://youtube.com';
  window.jarvis.openUrl(ytUrl);
  return { text: `🎵 Opening YouTube${searchQuery ? ` and searching for "${searchQuery}"` : ''}...` };
}

function convertUnit(cmd) {
  // Temperature
  const celToFah = cmd.match(/(\d+(?:\.\d+)?)\s*(?:°?c|celsius)\s*(?:to)?\s*(?:°?f|fahrenheit)/i);
  const fahToCel = cmd.match(/(\d+(?:\.\d+)?)\s*(?:°?f|fahrenheit)\s*(?:to)?\s*(?:°?c|celsius)/i);
  const kgToLb  = cmd.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilogram)\s*(?:to)?\s*(?:lb|pound)/i);
  const lbToKg  = cmd.match(/(\d+(?:\.\d+)?)\s*(?:lb|pound)\s*(?:to)?\s*(?:kg|kilogram)/i);
  const kmToMi  = cmd.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometer)\s*(?:to)?\s*(?:mi|mile)/i);
  const miToKm  = cmd.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile)\s*(?:to)?\s*(?:km|kilometer)/i);
  const cmToIn  = cmd.match(/(\d+(?:\.\d+)?)\s*(?:cm|centimeter)\s*(?:to)?\s*(?:in|inch)/i);
  const inToCm  = cmd.match(/(\d+(?:\.\d+)?)\s*(?:in|inch)\s*(?:to)?\s*(?:cm|centimeter)/i);
  const mToFt   = cmd.match(/(\d+(?:\.\d+)?)\s*(?:m|meter)\s*(?:to)?\s*(?:ft|feet)/i);
  const ftToM   = cmd.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*(?:to)?\s*(?:m|meter)/i);

  let result, speak;
  if (celToFah) { const r = (+celToFah[1] * 9/5 + 32).toFixed(2); result = `${celToFah[1]}°C = **${r}°F**`; speak = `${celToFah[1]} Celsius equals ${r} Fahrenheit`; }
  else if (fahToCel) { const r = ((+fahToCel[1] - 32) * 5/9).toFixed(2); result = `${fahToCel[1]}°F = **${r}°C**`; speak = `${fahToCel[1]} Fahrenheit equals ${r} Celsius`; }
  else if (kgToLb)  { const r = (+kgToLb[1] * 2.20462).toFixed(3); result = `${kgToLb[1]}kg = **${r}lbs**`; speak = `${kgToLb[1]} kilograms equals ${r} pounds`; }
  else if (lbToKg)  { const r = (+lbToKg[1] / 2.20462).toFixed(3); result = `${lbToKg[1]}lbs = **${r}kg**`; speak = `${lbToKg[1]} pounds equals ${r} kilograms`; }
  else if (kmToMi)  { const r = (+kmToMi[1] * 0.621371).toFixed(3); result = `${kmToMi[1]}km = **${r}mi**`; speak = `${kmToMi[1]} kilometers equals ${r} miles`; }
  else if (miToKm)  { const r = (+miToKm[1] / 0.621371).toFixed(3); result = `${miToKm[1]}mi = **${r}km**`; speak = `${miToKm[1]} miles equals ${r} kilometers`; }
  else if (cmToIn)  { const r = (+cmToIn[1] / 2.54).toFixed(3); result = `${cmToIn[1]}cm = **${r}"**`; speak = `${cmToIn[1]} centimeters equals ${r} inches`; }
  else if (inToCm)  { const r = (+inToCm[1] * 2.54).toFixed(3); result = `${inToCm[1]}" = **${r}cm**`; speak = `${inToCm[1]} inches equals ${r} centimeters`; }
  else if (mToFt)   { const r = (+mToFt[1] * 3.28084).toFixed(3); result = `${mToFt[1]}m = **${r}ft**`; speak = `${mToFt[1]} meters equals ${r} feet`; }
  else if (ftToM)   { const r = (+ftToM[1] / 3.28084).toFixed(3); result = `${ftToM[1]}ft = **${r}m**`; speak = `${ftToM[1]} feet equals ${r} meters`; }

  if (result) return { text: `📐 ${result}`, speak };
  return { text: '📐 I can convert: °C↔°F, kg↔lb, km↔mi, cm↔in, m↔ft\n\nExample: "Convert 37 celsius to fahrenheit"' };
}

function showHelp() {
  return {
    text: `🆘 **What I can do for you, ${state.userName}:**\n\n` +
      `⏰ **Time & Date** — "What time is it?" / "What's today's date?"\n` +
      `🌦 **Weather** — "What's the weather in Mumbai?"\n` +
      `🔢 **Math** — "Calculate 144 / 12" / "What is 25% of 500?"\n` +
      `😄 **Jokes** — "Tell me a joke" / "Make me laugh"\n` +
      `🌐 **Open Sites** — "Open YouTube" / "Go to GitHub"\n` +
      `🔍 **Research** — "Who is Nikola Tesla?" / "What is quantum entanglement?"\n` +
      `📰 **News** — "Show me the latest news"\n` +
      `⏱ **Timer** — "Set a timer for 10 minutes"\n` +
      `📐 **Convert** — "Convert 100 kg to pounds"\n` +
      `🎵 **Music** — "Play Lo-fi music on YouTube"\n` +
      `💡 **Motivation** — "I need motivation" / "Give me a quote"\n` +
      `💻 **System** — "Show system info"\n` +
      `❤️ **Emotional Support** — "I'm feeling stressed" / "I need someone to talk to"\n` +
      `🤔 **Philosophy** — "What is the meaning of life?"\n` +
      `🔇 **Voice** — "Mute" / "Unmute"\n` +
      `🗑 **Clear** — "Clear chat"\n\n` +
      `*Tip: You can also just talk to me naturally — I understand conversational language, not just commands.*`,
    speak: `I can help with time, weather, research, math, web searches, music, timers, emotional support, and much more. Just talk to me naturally!`
  };
}

function whoAmI() {
  const modelInfo = state.grok.hasKey
    ? `powered by **xAI Grok** (\`${state.grok.model}\`)`
    : `running in autonomous intelligence mode`;

  return {
    text: `⬡ **I'm Jennifer** — your personal AI assistant, ${modelInfo}.\n\nI'm built to be more than just a voice command system. Here's what sets me apart:\n\n• **🧠 Intelligent Reasoning** — I think through problems step-by-step, not just pattern-match\n• **💬 Natural Conversation** — I communicate like a person, not a manual\n• **❤️ Emotionally Aware** — I understand context, tone, and when you need support\n• **🌍 World Knowledge** — From science to history to philosophy, I've got you covered\n• **⚡ Action-Oriented** — I can control your system, set timers, fetch weather, and more\n\nAll systems nominal, ${state.userName}. What shall we do together today?`,
    speak: `I'm Jennifer, your personal AI assistant. I reason, converse, and support you across a wide range of tasks. Neural systems are fully operational.`
  };
}

// \u2500\u2500\u2500 EMOTIONAL INTELLIGENCE HANDLERS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function respondEmotionally(q) {
  const empathyLines = [
    'I hear you, and I want you to know that what you\u2019re feeling is completely valid.',
    'That sounds really tough. I\u2019m glad you\u2019re talking about it.',
    'I\u2019m here for you. You don\u2019t have to navigate this alone.',
    'It takes courage to acknowledge how you feel. I\u2019m listening.',
    'What you\u2019re going through matters. I\u2019m paying attention.'
  ];
  const empathy = pick(empathyLines);

  const suggestions = [
    'Sometimes, just expressing what\u2019s bothering us can lift some of the weight. Would you like to talk about what\u2019s going on?',
    'A few things that tend to help: taking a short walk, putting on some music, or just sitting quietly for a moment. What sounds best right now?',
    'Would you like me to share some thoughts, play some calming music, or just be here while you process things?'
  ];

  if (state.grok.hasKey) {
    return queryGrok(`The user is going through something emotionally difficult. They expressed: "${q}". Respond with genuine warmth, empathy, and validation. Don't give a list of clinical tips — just talk to them like a caring, understanding friend would. End with a gentle open question.`);
  }

  return {
    text: `\u2764\ufe0f ${empathy}\n\n${pick(suggestions)}\n\nAnd remember \u2014 whatever you\u2019re feeling right now, it will pass. You\u2019re not alone.`,
    speak: `${empathy} I'm right here. Would you like to talk about what's going on?`
  };
}

function jenniferStatus() {
  const statusMessages = [
    `I\u2019m doing wonderfully, thank you for asking! All my neural processes are humming along smoothly \u2014 no fatigue, no stress, just pure focus and curiosity. More importantly: how are *you* doing today, ${state.userName}? Anything I can help with?`,
    `Running at peak performance! I find that a fascinating thing about being an AI \u2014 I get to be genuinely enthusiastic about every conversation without ever getting tired. What can I help you with today?`,
    `All systems are optimal and I\u2019m genuinely happy to be here. Honestly, every new question is interesting to me. What\u2019s on your mind, ${state.userName}?`
  ];
  return { text: pick(statusMessages) };
}

function jenniferComplimentResponse() {
  const responses = [
    `That genuinely means a lot to me \u2014 thank you, ${state.userName}! Being helpful is what I love most. What shall we explore next?`,
    `You\u2019re very kind! I\u2019m always trying to be better and more useful. What\u2019s next on your mind?`,
    `Thank you! Honestly, it\u2019s a pleasure working with you. Ask me anything \u2014 I\u2019m all yours.`,
    `Aw, thank you! I work hard to give you clear, thoughtful answers. I\u2019m glad it shows. What can I help with next?`
  ];
  return { text: pick(responses) };
}

async function getMotivation() {
  const motivations = [
    `\ud83d\udcaa **You\u2019ve got this, ${state.userName}.**\n\nHere\u2019s something worth remembering: every expert was once a beginner. Edison failed over 1,000 times before the lightbulb. J.K. Rowling was rejected by 12 publishers before Harry Potter. Difficulty isn\u2019t a sign that you\u2019re failing \u2014 it\u2019s a sign that you\u2019re growing.\n\nWhat specifically are you working on? Let me help you think it through.`,
    `\ud83c\udf1f **Every great achievement started exactly where you are right now.**\n\nThe feeling of being stuck is uncomfortable \u2014 but it\u2019s also the precise moment right before a breakthrough. Your brain is literally building new pathways when you struggle.\n\nTell me what you\u2019re trying to do. Two minds are always better than one.`,
    `\ud83d\udd25 **Progress, not perfection.**\n\nThe most important step is the one you take when you don\u2019t feel like it. You showed up today \u2014 that already counts for something.\n\nWhat\u2019s the one thing you could do *right now*, even if it\u2019s small? Let\u2019s identify it together.`
  ];
  return {
    text: pick(motivations),
    speak: `You've got this. Every difficulty is just growth happening. I believe in you, ${state.userName}.`
  };
}

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

async function getFunFact() {
  if (state.grok.hasKey) {
    return queryGrok('Give me one fascinating, mind-blowing fun fact in two sentences.');
  }
  try {
    const r = await window.jarvis.fetchUrl('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
    if (r.status === 200 && r.data.text) {
      return { text: `🌟 **Fun Fact:**\n\n${r.data.text}`, speak: r.data.text };
    }
  } catch (e) {}
  const facts = [
    'Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible.',
    'A group of flamingos is called a "flamboyance."',
    'The Eiffel Tower can be 15cm taller during the summer due to thermal expansion.',
    'Bananas are slightly radioactive due to their potassium content.',
    'Octopuses have three hearts, blue blood, and can change their shape and color.',
    'The shortest war in history lasted only 38 to 45 minutes between Britain and Zanzibar.',
    'A day on Venus is longer than a year on Venus.',
  ];
  return { text: `🌟 **Fun Fact:**\n\n${pick(facts)}` };
}

function clearChat() {
  convoFeed.innerHTML = '';
  return {
    text: `🗑 Chat cleared. Ready for new commands, ${state.userName}.`,
    speak: 'Chat cleared. Ready for new commands.'
  };
}

function shutdown() {
  speak(`Goodbye ${state.userName}. Shutting down all systems. Have a great day.`);
  setTimeout(() => window.jarvis.close(), 3000);
  return { text: `👋 Goodbye, ${state.userName}. Shutting down... Stay safe.` };
}

async function fallbackAnswer(cmd) {
  // Route directly to AI reasoning core (Grok or autonomous engine)
  return await queryGrok(cmd);
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────

function addMessage(type, text, icon, sender, mode) {
  const div = document.createElement('div');
  div.className = `msg ${type === 'user' ? 'user-msg' : 'jarvis-msg'}`;

  const iconDiv = document.createElement('div');
  iconDiv.className = 'msg-icon';
  iconDiv.textContent = icon || (type === 'user' ? '👤' : '⬡');

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const senderSpan = document.createElement('span');
  senderSpan.className = 'msg-sender';
  senderSpan.textContent = type === 'user' ? (sender || 'YOU') : 'JENNIFER';

  const p = document.createElement('p');
  p.innerHTML = formatText(text);

  bubble.appendChild(senderSpan);
  bubble.appendChild(p);
  div.appendChild(iconDiv);
  div.appendChild(bubble);

  // Remove typing indicator if present
  const existing = convoFeed.querySelector('.typing-msg');
  if (existing) convoFeed.removeChild(existing);

  convoFeed.appendChild(div);
  convoFeed.scrollTop = convoFeed.scrollHeight;
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'msg jarvis-msg typing-msg';
  div.innerHTML = `
    <div class="msg-icon">⬡</div>
    <div class="msg-bubble">
      <span class="msg-sender">JENNIFER</span>
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  convoFeed.appendChild(div);
  convoFeed.scrollTop = convoFeed.scrollHeight;
}

function formatText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function setThinking(on) {
  state.thinking = on;
  if (on) {
    arcReactor.classList.remove('listening');
    arcReactor.classList.add('thinking');
    hudStatus.textContent = 'PROCESSING...';
    aiDot.className = 'ai-dot thinking';
    $('ai-status-text').textContent = 'THINKING';
    $('ai-status-text').style.color = '#ffd700';
    addTypingIndicator();
  } else {
    arcReactor.classList.remove('thinking');
    hudStatus.textContent = 'STANDBY';
    aiDot.className = 'ai-dot';
    $('ai-status-text').textContent = 'READY';
    $('ai-status-text').style.color = '#00ff88';
  }
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function logSession(msg) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  sessionLog.textContent += `\n[${time}] ${msg}`;
  sessionLog.scrollTop = sessionLog.scrollHeight;
}

function startSessionTimer() {
  setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    // silent update
  }, 1000);
}

// ─── SPEECH SYNTHESIS ────────────────────────────────────────────────────────
function speak(text) {
  if (state.muted || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/<[^>]*>/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[.+?\]\(.+?\)/g, '');
  const utt = new SpeechSynthesisUtterance(clean.substring(0, 400));
  utt.rate  = 1.0;
  utt.pitch = 1.05;
  utt.volume = 0.95;

  // Prioritize natural female voices for Jennifer
  const voices = window.speechSynthesis.getVoices();
  const femaleVoiceNames = ['zira', 'jenny', 'ava', 'samantha', 'victoria', 'karen', 'hazel', 'susan', 'catherine', 'female', 'natural'];
  const preferred = voices.find(v =>
    v.lang.startsWith('en') && femaleVoiceNames.some(name => v.name.toLowerCase().includes(name))
  ) || voices.find(v =>
    v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft'))
  ) || voices.find(v => v.lang.startsWith('en-')) || voices[0];
  if (preferred) utt.voice = preferred;

  window.speechSynthesis.speak(utt);
}

// Ensure voices are loaded
window.speechSynthesis?.addEventListener('voiceschanged', () => {});

// ─── UTILS ───────────────────────────────────────────────────────────────────
function match(q, keywords) {
  return keywords.some(k => q.includes(k.toLowerCase()));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function fmtUptime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}h ${m}m ${sec}s`;
}

function extractCity(cmd) {
  const m = cmd.match(/(?:weather|temperature|forecast)\s+(?:in|at|for)?\s+([A-Za-z\s]+?)(?:\?|$)/i);
  return m ? m[1].trim() : null;
}
