// preload.cjs — 暴露最小信息给 BrowserWindow 渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('t8pc', {
  getInfo: () => ipcRenderer.invoke('t8pc:get-info'),
  openExternal: (url) => ipcRenderer.invoke('t8pc:open-external', url),
  updater: {
    getStatus: () => ipcRenderer.invoke('t8pc:updater:status'),
    check: () => ipcRenderer.invoke('t8pc:updater:check'),
    download: () => ipcRenderer.invoke('t8pc:updater:download'),
    install: () => ipcRenderer.invoke('t8pc:updater:install'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('t8pc:updater-status', listener);
      return () => ipcRenderer.removeListener('t8pc:updater-status', listener);
    },
  },
});
