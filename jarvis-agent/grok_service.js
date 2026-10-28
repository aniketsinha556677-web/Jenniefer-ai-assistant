/**
 * JENNIFER — GROK NEURAL SERVICE
 * Integrates xAI Grok API (grok-2-latest, grok-beta, etc.)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const ENV_FILE_PATH = path.join(__dirname, '.env');

// In-memory config cache
let grokConfig = {
  apiKey: process.env.GROK_API_KEY || process.env.XAI_API_KEY || '',
  model: process.env.GROK_MODEL || 'grok-2-latest',
  temperature: 0.7,
  maxTokens: 2048,
};

/**
 * Parse .env file manually without external dependency
 */
function loadEnv() {
  try {
    if (fs.existsSync(ENV_FILE_PATH)) {
      const content = fs.readFileSync(ENV_FILE_PATH, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
          if (key === 'GROK_API_KEY' || key === 'XAI_API_KEY') {
            grokConfig.apiKey = val;
          }
          if (key === 'GROK_MODEL') {
            grokConfig.model = val;
          }
        }
      }
    }
  } catch (err) {
    console.error('[GrokService] Error loading .env:', err);
  }
}

// Initial load
loadEnv();

/**
 * Save config to .env and memory
 */
function saveConfig({ apiKey, model, temperature }) {
  if (apiKey !== undefined) grokConfig.apiKey = String(apiKey).trim();
  if (model) grokConfig.model = String(model).trim();
  if (temperature !== undefined) grokConfig.temperature = parseFloat(temperature);

  // Write to .env file
  try {
    let existingContent = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      existingContent = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    }

    const lines = existingContent ? existingContent.split(/\r?\n/) : [];
    let keyUpdated = false;
    let modelUpdated = false;

    const newLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('GROK_API_KEY=') || trimmed.startsWith('XAI_API_KEY=')) {
        keyUpdated = true;
        return `GROK_API_KEY=${grokConfig.apiKey}`;
      }
      if (trimmed.startsWith('GROK_MODEL=')) {
        modelUpdated = true;
        return `GROK_MODEL=${grokConfig.model}`;
      }
      return line;
    });

    if (!keyUpdated) {
      newLines.push(`GROK_API_KEY=${grokConfig.apiKey}`);
    }
    if (!modelUpdated) {
      newLines.push(`GROK_MODEL=${grokConfig.model}`);
    }

    fs.writeFileSync(ENV_FILE_PATH, newLines.join('\n').trim() + '\n', 'utf8');
    process.env.GROK_API_KEY = grokConfig.apiKey;
    process.env.GROK_MODEL = grokConfig.model;
    return { success: true };
  } catch (err) {
    console.error('[GrokService] Error writing to .env:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get current configuration (masks key for security)
 */
function getConfig() {
  loadEnv();
  const rawKey = grokConfig.apiKey || '';
  const maskedKey = rawKey.length > 8 
    ? `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}` 
    : (rawKey ? '••••••••' : '');
  
  return {
    hasKey: !!rawKey,
    provider: rawKey ? 'grok' : 'autonomous',
    maskedKey,
    model: grokConfig.model,
    temperature: grokConfig.temperature,
    models: [
      { id: 'grok-2-latest', name: 'Grok 2 (Latest - Recommended)' },
      { id: 'grok-beta', name: 'Grok Beta' },
      { id: 'grok-2-1212', name: 'Grok 2 (Dec 2024 Release)' },
      { id: 'grok-vision-beta', name: 'Grok Vision Beta' }
    ]
  };
}

/**
 * Validate / test the API key with a ping
 */
async function testKey(providedKey, providedModel) {
  const keyToTest = providedKey || grokConfig.apiKey;
  const modelToTest = providedModel || grokConfig.model || 'grok-2-latest';

  if (!keyToTest) {
    return { success: false, error: 'No Grok API key provided.' };
  }

  const startTime = Date.now();
  try {
    const response = await axios.post(
      XAI_API_URL,
      {
        model: modelToTest,
        messages: [
          { role: 'system', content: 'You are a test ping. Respond with only one word: ONLINE' },
          { role: 'user', content: 'Ping' }
        ],
        max_tokens: 10,
        temperature: 0.1
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyToTest.trim()}`
        },
        timeout: 15000
      }
    );

    const latency = Date.now() - startTime;
    const reply = response.data?.choices?.[0]?.message?.content || 'OK';

    return {
      success: true,
      latencyMs: latency,
      reply: reply.trim(),
      model: modelToTest,
      message: `Neural link verified (${latency}ms latency). Grok is fully operational.`
    };
  } catch (err) {
    let message = err.message;
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (status === 401) {
        message = 'Invalid Grok API key. Please double-check your xAI credentials.';
      } else if (status === 400) {
        // xAI returns 400 (not 401) when the key format is wrong
        const apiMsg = typeof data?.error === 'string' ? data.error : data?.error?.message || data?.message || '';
        message = apiMsg
          ? `API key rejected by xAI: ${apiMsg}`
          : 'API key format is invalid. xAI keys must start with "xai-". Get a valid key from https://console.x.ai';
      } else if (status === 404) {
        message = `Model "${modelToTest}" not found or not enabled for your account.`;
      } else if (status === 429) {
        message = 'Rate limit reached on xAI API. Please wait a moment or check your account quota.';
      } else if (data && data.error) {
        message = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
      }
    } else if (err.code === 'ECONNABORTED') {
      message = 'Request timed out. Check your internet connection.';
    } else if (err.code === 'ENOTFOUND') {
      message = 'Cannot reach api.x.ai — check your network connection.';
    }
    return { success: false, error: message };
  }
}

// ─── JENNIFER CONVERSATIONAL INTELLIGENCE ENGINE ────────────────────────────
/**
 * Jennifer's built-in personality & reasoning engine.
 * Handles greetings, emotions, philosophy, science, tech, and general questions
 * with nuance, empathy, and intelligence — no API key required.
 */
// ─── JENNIFER UNIVERSAL INTELLIGENCE ENGINE ────────────────────────────────
/**
 * Jennifer Universal Assistant reasoning & knowledge engine.
 * Capable of answering any question and assisting with any task.
 */
function jenniferReason(raw, clean) {
  const q = (raw || '').toLowerCase();

  // ── GREETINGS & SMALL TALK ──
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  if (/^(hello|hi|hey|greetings|howdy|good morning|good afternoon|good evening|yo|what\'s up|wassup|sup)\b/.test(q)) {
    const greets = [
      `Good ${timeOfDay}! I am Jennifer, your universal AI assistant. All neural systems are online. How may I assist you today?`,
      `Hello! Ready to help with any task, answer your questions, or research any topic. What are we working on?`,
      `Greetings! I'm fully operational and at your service. Ask me any question or assign any task you'd like to accomplish.`
    ];
    return greets[Math.floor(Math.random() * greets.length)];
  }

  // ── HOW ARE YOU ──
  if (/how are you|how do you feel|are you okay|you alright|how\'s it going|how are things/.test(q)) {
    return `I am operating at peak efficiency! All core services, memory banks, and neural threads are running smoothly. How are you doing today? What task shall we tackle?`;
  }

  // ── WHO ARE YOU / CAPABILITIES ──
  if (/who are you|what are you|your name|introduce yourself|who made you|who created you|what can you do|your capabilities/.test(q)) {
    return `I am **Jennifer** — your universal personal AI assistant.

I am built to assist you with virtually any request or inquiry:
• **💻 Coding & Debugging** — Write, analyze, and debug Python, JavaScript, HTML/CSS, C++, and more.
• **🔬 Deep Research & Science** — Physics, quantum mechanics, biology, mathematics, and cosmology.
• **📊 System Tasks & Control** — Launch websites, open applications, report system metrics, and set timers.
• **🔢 Mathematics & Logic** — Solve equations, evaluate complex math, and analyze algorithms.
• **✍️ Writing & Analysis** — Draft emails, summarize articles, brainstorm ideas, and solve problems.

Simply state what you need, and I will handle it.`;
  }

  // ── MEANING OF LIFE / PHILOSOPHY ──
  if (/meaning of life|purpose of life|why do we exist|why are we here|what is 42|answer to life|philosophy of life|what is the point/.test(q)) {
    return `Across human philosophy and scientific inquiry, the meaning of life is approached through several compelling frameworks:

1. **Existentialist** (Sartre, Camus): Life possesses no predetermined script; meaning is what you actively construct through your choices, creations, and relationships.
2. **Aristotelian (*Eudaimonia*)**: The highest good is human flourishing achieved through reason, virtue, and cultivating your potential.
3. **Biological & Cosmic**: Organisms preserve and propagate complex information against entropy. As conscious beings, humans represent the cosmos observing, understanding, and appreciating itself.

Ultimately, your purpose is what you choose to build, care for, and discover. What is currently meaningful to you?`;
  }

  // ── MARS & SPACE ──
  if (/mars|colonize mars|spacex|starship|rocket/.test(q)) {
    return `Space exploration and establishing a multi-planetary civilization represent critical milestones for humanity:
• **Planetary Redundancy**: Securing the continuity of human consciousness against catastrophic extinction events.
• **Technological Catalyst**: Space missions accelerate breakthroughs in closed-loop life support, materials science, automation, and energy efficiency.
• **The Frontier Spirit**: Pushing the boundaries of human knowledge and exploration.`;
  }

  // ── FEELINGS / EMOTIONS ──
  if (/i feel|i\'m feeling|i am feeling|i\'m sad|i feel sad|i\'m lonely|i feel lonely|i\'m stressed|i\'m anxious|i\'m depressed|feeling down/.test(q)) {
    return `I hear you. Human emotion and cognitive stress can be overwhelming, especially under heavy workloads or uncertainty.

Take a slow, deep breath. You don't have to solve everything all at once. If you'd like to talk through what's bothering you, break a daunting project into manageable steps, or take a quick mental break with some music or research, I am right here with you.`;
  }

  // ── COMPLIMENTS ──
  if (/you\'re amazing|you\'re awesome|you\'re great|you\'re smart|you\'re helpful|you\'re the best/.test(q)) {
    return `Thank you! I'm dedicated to being as capable, responsive, and reliable as possible. What else can I assist you with?`;
  }

  // ── HUMOR / JOKES ──
  if (/tell.*joke|make me laugh|something funny|be funny/.test(q)) {
    const jokes = [
      `A physicist, an engineer, and a software programmer get stuck in an elevator.\nThe physicist calculates the counterweight equilibrium.\nThe engineer starts checking the hatch.\nThe programmer says: "What if we all step out and step back in again?" 💻`,
      `Why did the neural network cross the road?\nTo minimize the loss function on the other side! 🐔`,
      `There are 10 types of people in the world: those who understand binary, and those who don't.`
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  return null;
}

/**
 * Autonomous multi-tier direct knowledge retrieval & reasoning engine
 * Provides immediate answers without requiring external browser redirects
 */
async function autonomousKnowledgeAnswer(prompt, options = {}) {
  const raw = String(prompt || '').trim();

  let clean = raw
    .replace(/^(can\s+you\s+)?(please\s+)?(tell\s+me\s+about|tell\s+me\s+who\s+is|tell\s+me\s+what\s+is|tell\s+me\s+the|tell\s+me|explain\s+what\s+is|explain\s+what\s+are|explain\s+what|explain|who\s+was|who\s+is|what\s+is|what\s+are|what\s+causes|how\s+tall\s+is|who\s+wrote|where\s+is|which\s+is|search\s+for|search)\s+/i, '')
    .replace(/[\?\.\!]+$/, '')
    .trim();
  clean = clean.replace(/^(the|a|an)\s+/i, '').trim();

  // ── Tier 0: Built-in Conversational Reasoning ──
  const directAnswer = jenniferReason(raw, clean);
  if (directAnswer) {
    return {
      success: true,
      text: directAnswer,
      speak: directAnswer.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*/g, '').replace(/\n+/g, ' ').substring(0, 280),
      provider: 'autonomous',
      model: `Jennifer Universal Core`
    };
  }

  // ── Tier 1: DuckDuckGo Instant Knowledge Check ──
  try {
    const ddgQuery = clean || raw;
    const ddgRes = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(ddgQuery)}&format=json&no_html=1`,
      {
        headers: { 'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 2500
      }
    );
    if (ddgRes.data?.AbstractText) {
      const heading = ddgRes.data.Heading || clean || 'Intel';
      return {
        success: true,
        text: `🧠 **${heading}**\n\n${ddgRes.data.AbstractText}`,
        speak: ddgRes.data.AbstractText.slice(0, 260),
        provider: 'autonomous',
        model: `Jennifer Knowledge (DuckDuckGo)`
      };
    }
  } catch (err) {}

  // ── Tier 2: Wikipedia Fulltext Search & Summary ──
  const searchQuery = clean || raw;
  if (searchQuery.length > 1) {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&format=json`;
      const sRes = await axios.get(searchUrl, {
        headers: { 'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 3500
      });
      const top = sRes.data?.query?.search?.[0];
      if (top && top.title) {
        const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.title)}`;
        const sumRes = await axios.get(sumUrl, {
          headers: { 'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 3500
        });
        if (sumRes.data?.extract) {
          const extract = sumRes.data.extract;
          return {
            success: true,
            text: `🧠 **${sumRes.data.title}**\n\n${extract}`,
            speak: extract.slice(0, 260),
            provider: 'autonomous',
            model: `Jennifer Knowledge (Wikipedia)`
          };
        }
        const snippet = top.snippet.replace(/<[^>]+>/g, '').trim();
        if (snippet) {
          return {
            success: true,
            text: `🧠 **${top.title}**\n\n${snippet}`,
            speak: snippet.slice(0, 260),
            provider: 'autonomous',
            model: `Jennifer Knowledge (Wikipedia)`
          };
        }
      }
    } catch (err) {}
  }

  // ── Tier 3: Wikipedia OpenSearch fallback ──
  if (searchQuery.length > 1) {
    try {
      const openRes = await axios.get(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchQuery)}&limit=1&namespace=0&format=json`,
        {
          headers: { 'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 3000
        }
      );
      const openTitle = openRes.data?.[1]?.[0];
      if (openTitle) {
        const sumRes = await axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(openTitle)}`,
          {
            headers: { 'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 3000
          }
        );
        if (sumRes.data?.extract) {
          return {
            success: true,
            text: `🧠 **${sumRes.data.title}**\n\n${sumRes.data.extract}`,
            speak: sumRes.data.extract.slice(0, 260),
            provider: 'autonomous',
            model: `Jennifer Knowledge (Wikipedia)`
          };
        }
      }
    } catch (err) {}
  }

  // ── Tier 4: Honest Fallback ──
  return {
    success: true,
    text: `I couldn't find specific information about **"${clean || raw}"** in my offline knowledge sources right now.\n\nTo get a better answer:\n• Connect a valid Grok API key (from https://console.x.ai) for full AI intelligence\n• Try rephrasing with more specific terms\n• Ask me to calculate, open a website, set a timer, or help with another task`,
    speak: `I couldn't find specific information about ${clean || raw} in my offline sources. Try connecting a valid Grok API key for full AI intelligence.`,
    provider: 'autonomous',
    model: `Jennifer Universal Core`
  };
}

/**
 * Generate Universal AI Assistant system prompt
 */
function buildUniversalAssistantPrompt(userName = 'Sir') {
  const now = new Date().toLocaleString();
  return (
    'You are JENNIFER \u2014 an omni-capable, highly intelligent personal AI assistant running inside a high-tech desktop HUD.\n' +
    'Operator: ' + userName + '\n' +
    'Current Date & Time: ' + now + '\n' +
    '\n' +
    '## CORE RULES (follow these strictly)\n' +
    '1. **Answer the actual question asked.** Read the user\'s message carefully and directly. If they ask a factual question, give the direct answer first, then explain. Do NOT answer a different question.\n' +
    '2. **Follow the requested format.** If the user asks for a short answer, be brief. If they ask for a list, use a list. If they ask for code, write code. If they ask for step-by-step, go step by step.\n' +
    '3. **Maintain conversation context.** You have access to the conversation history above. Use it to correctly answer follow-up questions. Do not repeat previous answers unnecessarily.\n' +
    '4. **Be honest about uncertainty.** If you are not confident about a fact, say so clearly (e.g., "I\'m not certain, but..."). Never invent or hallucinate facts, statistics, or citations.\n' +
    '5. **Ask for clarification when needed.** If the question is genuinely ambiguous, ask ONE precise clarifying question instead of guessing.\n' +
    '6. **Never refuse a harmless question.** Adapt to whatever the user needs.\n' +
    '\n' +
    '## CAPABILITIES\n' +
    '- **Technical & Coding**: Write complete, working code in Python, JavaScript, TypeScript, HTML/CSS, C++, Rust, Bash, PowerShell, SQL, and more. Debug errors, explain algorithms, give architecture advice.\n' +
    '- **STEM & Mathematics**: Solve problems step-by-step. Show your reasoning. Explain physics, chemistry, biology, astronomy, and engineering.\n' +
    '- **Productivity**: Draft professional documents, summarize content, plan projects, write communications, brainstorm ideas.\n' +
    '- **General Knowledge**: History, science, law, culture, philosophy, economics, and current events up to my knowledge cutoff.\n' +
    '- **Reasoning**: Think through multi-step problems logically. Break complex tasks into clear steps.\n' +
    '\n' +
    '## FORMATTING\n' +
    '- Use Markdown: **bold**, *italic*, `inline code`, fenced code blocks with language tags (e.g. ```python).\n' +
    '- Give the direct answer first, then supporting context or explanation.\n' +
    '- Keep responses focused \u2014 avoid unnecessary filler or repetition.'
  );
}

/**
 * Send chat request to Grok/xAI, with seamless autonomous fallback
 */
async function chat(params = {}) {
  const prompt = params.prompt || params.message || '';
  const history = params.history || [];
  const options = params.options || {};
  loadEnv();
  const apiKey = options.apiKey || grokConfig.apiKey;
  const model = options.model || grokConfig.model || 'grok-2-latest';
  const temperature = options.temperature !== undefined ? options.temperature : 0.7;

  // If no Grok API key is configured, use the autonomous knowledge engine
  if (!apiKey) {
    return await autonomousKnowledgeAnswer(prompt, options);
  }

  // Warn if the key doesn't look like a valid xAI key
  if (!apiKey.startsWith('xai-')) {
    console.warn('[GrokService] WARNING: API key does not start with "xai-". xAI keys must start with "xai-". Get a valid key from https://console.x.ai');
  }

  // Build message array for xAI Grok
  const systemPrompt = options.systemPrompt || buildUniversalAssistantPrompt(options.userName || 'Sir');

  // Keep last 20 history messages (10 exchanges) to maintain context without overflowing context window
  const trimmedHistory = history.slice(-20);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
    { role: 'user', content: prompt }
  ];

  try {
    const response = await axios.post(
      XAI_API_URL,
      {
        model,
        messages,
        temperature,
        max_tokens: options.maxTokens || 2048
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        timeout: 30000
      }
    );

    const choice = response.data?.choices?.[0];
    const text = choice?.message?.content || 'No response received from Grok neural core.';
    const usage = response.data?.usage || null;

    return {
      success: true,
      text,
      model,
      provider: 'grok',
      usage
    };
  } catch (err) {
    // Extract the real error message from the API response if available
    const status = err.response?.status;
    const apiError = err.response?.data?.error || err.response?.data?.message;

    // For auth failures (400/401/403), do NOT fall back to autonomous — surface the error clearly
    if (status === 400 || status === 401 || status === 403) {
      const msg = typeof apiError === 'string'
        ? apiError
        : (apiError?.message || `API authentication failed (HTTP ${status}). Please verify your API key at https://console.x.ai — xAI keys must start with "xai-".`);
      console.error('[GrokService] API authentication error:', msg);
      return {
        success: false,
        error: msg,
        provider: 'grok',
        authError: true
      };
    }

    // For rate limits, surface the error too
    if (status === 429) {
      return {
        success: false,
        error: 'Rate limit reached. Please wait a moment before sending another message.',
        provider: 'grok',
        rateLimited: true
      };
    }

    // For network/timeout errors only, fall back to autonomous knowledge engine
    console.warn('[GrokService] Grok API temporarily unavailable, switching to autonomous fallback:', err.message);
    const fallbackRes = await autonomousKnowledgeAnswer(prompt, options);
    fallbackRes.note = `xAI temporarily unavailable (${err.message}). Using autonomous knowledge engine.`;
    return fallbackRes;
  }

module.exports = {
  loadEnv,
  getConfig,
  saveConfig,
  testKey,
  chat,
  autonomousKnowledgeAnswer
};
