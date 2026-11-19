const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tinteiroNative', {
  platform: 'desktop',
  driveLogin: (clientId, clientSecret) => ipcRenderer.invoke('drive:login', clientId, clientSecret),
  driveToken: () => ipcRenderer.invoke('drive:token'),
  driveLogout: () => ipcRenderer.invoke('drive:logout'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdate: cb => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('update:status', h)
    return () => ipcRenderer.removeListener('update:status', h)
  }
})
