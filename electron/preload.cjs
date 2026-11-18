const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tinteiroNative', {
  platform: 'desktop',
  driveLogin: (clientId, clientSecret) => ipcRenderer.invoke('drive:login', clientId, clientSecret),
  driveToken: () => ipcRenderer.invoke('drive:token'),
  driveLogout: () => ipcRenderer.invoke('drive:logout')
})
