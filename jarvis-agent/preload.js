const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // System
  getSysInfo: () => ipcRenderer.invoke('get-sysinfo'),
  getDateTime: () => ipcRenderer.invoke('get-datetime'),
  execCommand: (cmd) => ipcRenderer.invoke('exec-command', cmd),

  // Network
  fetchUrl: (url, options) => ipcRenderer.invoke('fetch-url', url, options),
  openUrl: (url) => ipcRenderer.send('open-url', url),

  // Notifications
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  openSpeechSettings: () => ipcRenderer.invoke('open-speech-settings'),

  // Native Voice Engine (Windows offline speech recognizer)
  startVoice: (options) => ipcRenderer.invoke('start-native-voice', options),
  stopVoice: () => ipcRenderer.invoke('stop-native-voice'),
  onVoiceListening: (cb) => ipcRenderer.on('voice-listening', (event, ...args) => cb(...args)),

  // Continuous Wake Word Activation
  startContinuousWake: (options) => ipcRenderer.invoke('start-continuous-wake', options),
  stopContinuousWake: () => ipcRenderer.invoke('stop-continuous-wake'),
  onVoiceContinuousListening: (cb) => ipcRenderer.on('voice-continuous-listening', (event, ...args) => cb(...args)),
  onVoiceContinuousResult: (cb) => ipcRenderer.on('voice-continuous-result', (event, data) => cb(data)),
  onVoiceContinuousStopped: (cb) => ipcRenderer.on('voice-continuous-stopped', (event, ...args) => cb(...args)),

  // Grok AI (xAI) Neural Core
  getGrokConfig: () => ipcRenderer.invoke('get-grok-config'),
  saveGrokConfig: (config) => ipcRenderer.invoke('save-grok-config', config),
  testGrokKey: (params) => ipcRenderer.invoke('test-grok-key', params),
  askGrok: (params) => ipcRenderer.invoke('ask-grok', params),
});

