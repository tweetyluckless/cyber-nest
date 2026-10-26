const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  close: () => ipcRenderer.send('win:close'),
  minimize: () => ipcRenderer.send('win:minimize'),
  isPinned: () => ipcRenderer.invoke('win:isPinned'),
  togglePin: () => ipcRenderer.invoke('win:togglePin'),
});
