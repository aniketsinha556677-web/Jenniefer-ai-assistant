const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const grokService = require('./grok_service');

let mainWindow;
let voiceProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#020c1b',
    icon: fs.existsSync(path.join(__dirname, 'assets', 'icon.png')) ? path.join(__dirname, 'assets', 'icon.png') : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    titleBarStyle: 'hidden',
    show: false,
  });

  // Automatically allow microphone access for real-time waveform & voice sampling
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });
  mainWindow.webContents.session.setDevicePermissionHandler(() => {
    return true;
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// Open URL in default browser
ipcMain.on('open-url', (event, url) => {
  shell.openExternal(url);
});

// Execute system command
ipcMain.handle('exec-command', async (event, cmd) => {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({ error: error?.message, stdout, stderr });
    });
  });
});

// Open Windows Speech Recognition Calibration & Settings
ipcMain.handle('open-speech-settings', async () => {
  exec('start ms-settings:speech', () => {});
  exec('start control /name Microsoft.SpeechRecognition', () => {});
  return true;
});


// Get system info
ipcMain.handle('get-sysinfo', async () => {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuCount: cpus.length,
    userInfo: os.userInfo().username,
    homeDir: os.homedir(),
    networkInterfaces: os.networkInterfaces(),
  };
});

// HTTP fetch helper (for APIs)
ipcMain.handle('fetch-url', async (event, url, options = {}) => {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
      timeout: options.timeout || 12000,
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data };
  } catch (err) {
    return { status: 500, error: err.message, data: null };
  }
});

// Show notification
ipcMain.on('notify', (event, { title, body }) => {
  new Notification({ title, body }).show();
});

// Get current time
ipcMain.handle('get-datetime', async () => {
  return {
    date: new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestamp: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});

// Native offline speech recognition (Windows System.Speech)
let continuousVoiceProcess = null;

function cleanupContinuousVoice() {
  if (continuousVoiceProcess) {
    try {
      continuousVoiceProcess.stdin.write('QUIT\n');
    } catch (e) {}
    try {
      continuousVoiceProcess.kill();
    } catch (e) {}
    continuousVoiceProcess = null;
  }
}

ipcMain.handle('start-native-voice', (event, options = 8) => {
  if (voiceProcess) {
    try { voiceProcess.kill(); } catch (e) {}
    voiceProcess = null;
  }

  const timeout = typeof options === 'object' ? (options.timeout || 8) : options;
  const wakeWords = typeof options === 'object' && options.wakeWords ? options.wakeWords : 'jennifer,hey jennifer,jarvis,hey jarvis,computer';

  return new Promise((resolve) => {
    const psScript = path.join(__dirname, 'voice_recognizer.ps1');
    voiceProcess = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-File', psScript,
      '-Mode', 'single',
      '-TimeoutSeconds', String(timeout),
      '-WakeWords', String(wakeWords)
    ]);

    let capturedResult = null;
    let confidence = 88;

    voiceProcess.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('STATUS:LISTENING')) {
          mainWindow?.webContents.send('voice-listening');
        } else if (line.startsWith('CONFIDENCE:')) {
          confidence = parseInt(line.replace('CONFIDENCE:', '').trim()) || 88;
        } else if (line.startsWith('RESULT:')) {
          capturedResult = line.replace('RESULT:', '').trim();
        }
      }
    });

    voiceProcess.stderr.on('data', (data) => {
      console.error('Voice stderr:', data.toString());
    });

    voiceProcess.on('close', () => {
      voiceProcess = null;
      if (capturedResult) {
        resolve({ success: true, text: capturedResult, confidence });
      } else {
        resolve({ success: false, error: 'NO_SPEECH' });
      }
    });

    voiceProcess.on('error', (err) => {
      voiceProcess = null;
      resolve({ success: false, error: err.message });
    });
  });
});

ipcMain.handle('stop-native-voice', () => {
  if (voiceProcess) {
    try { voiceProcess.kill(); } catch (e) {}
    voiceProcess = null;
    return true;
  }
  return false;
});

// Continuous Wake Word Listener
ipcMain.handle('start-continuous-wake', (event, options = {}) => {
  cleanupContinuousVoice();

  const wakeWords = options.wakeWords || 'jennifer,hey jennifer,jarvis,hey jarvis,computer';
  const psScript = path.join(__dirname, 'voice_recognizer.ps1');

  try {
    continuousVoiceProcess = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-File', psScript,
      '-Mode', 'continuous',
      '-WakeWords', String(wakeWords)
    ]);

    continuousVoiceProcess.stdout.on('data', (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('STATUS:LISTENING')) {
          mainWindow?.webContents.send('voice-continuous-listening');
        } else if (trimmed.startsWith('STATUS:RESULT:')) {
          const parts = trimmed.substring('STATUS:RESULT:'.length).split(':');
          if (parts.length >= 2) {
            const conf = parseInt(parts.pop()) || 90;
            const text = parts.join(':').trim();
            if (text) {
              mainWindow?.webContents.send('voice-continuous-result', { text, confidence: conf });
            }
          }
        }
      }
    });

    continuousVoiceProcess.stderr.on('data', (data) => {
      console.error('Continuous voice stderr:', data.toString());
    });

    continuousVoiceProcess.on('close', () => {
      continuousVoiceProcess = null;
      mainWindow?.webContents.send('voice-continuous-stopped');
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-continuous-wake', () => {
  cleanupContinuousVoice();
  return { success: true };
});

// ─── Grok AI (xAI) Handlers ──────────────────────────────────────────────────
ipcMain.handle('get-grok-config', async () => {
  return grokService.getConfig();
});

ipcMain.handle('save-grok-config', async (event, config) => {
  return grokService.saveConfig(config);
});

ipcMain.handle('test-grok-key', async (event, params = {}) => {
  return grokService.testKey(params.apiKey, params.model);
});

ipcMain.handle('ask-grok', async (event, params = {}) => {
  return grokService.chat(params);
});

app.on('before-quit', () => {
  if (voiceProcess) {
    try { voiceProcess.kill(); } catch (e) {}
  }
  cleanupContinuousVoice();
});


