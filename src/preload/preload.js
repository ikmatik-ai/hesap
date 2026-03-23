const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    READY: true,
    saveData: (key, data) => ipcRenderer.send('save-data', key, data),
    getData: (key) => ipcRenderer.invoke('get-data', key),
    autoBackup: (data) => ipcRenderer.send('auto-backup', data),
    openBackupFolder: () => ipcRenderer.send('open-backup-folder')
});
