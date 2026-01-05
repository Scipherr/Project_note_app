const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveBoard: (data) => ipcRenderer.invoke('save-board', data),
  loadBoard: () => ipcRenderer.invoke('load-board'),
  loginTwitter: () => ipcRenderer.invoke('login-twitter'),
  getFeed: (platform) => ipcRenderer.invoke('get-feed', platform)
});