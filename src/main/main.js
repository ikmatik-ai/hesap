const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const preloadPath = path.join(app.getAppPath(), 'src/preload/preload.js');

    const win = new BrowserWindow({
        width: 1300,
        height: 850,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#f8fafc',
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            spellcheck: false
        },
        icon: path.join(__dirname, '../../public/assets/icon.png')
    });

    win.loadFile(path.join(__dirname, '../../index.html'));

    win.once('ready-to-show', () => {
        win.show();
        win.focus();
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        const { shell } = require('electron');
        shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('context-menu', (event, params) => {
        const menu = new Menu();
        if (params.isEditable) {
            menu.append(new MenuItem({ label: 'Kes', role: 'cut' }));
            menu.append(new MenuItem({ label: 'Kopyala', role: 'copy' }));
            menu.append(new MenuItem({ label: 'Yapıştır', role: 'paste' }));
            menu.append(new MenuItem({ type: 'separator' }));
            menu.append(new MenuItem({ label: 'Tümünü Seç', role: 'selectAll' }));
        } else if (params.selectionText) {
            menu.append(new MenuItem({ label: 'Kopyala', role: 'copy' }));
        }

        if (menu.items.length > 0) {
            menu.popup(win, params.x, params.y);
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

ipcMain.handle('get-data', (event, key) => {
    return null;
});

ipcMain.on('save-data', (event, data) => {
});

ipcMain.on('auto-backup', (event, data) => {
    try {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `yedek_${timestamp}.json`;
        const filePath = path.join(backupDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Auto-backup failed:', err);
    }
});

ipcMain.on('open-backup-folder', async () => {
    const { shell } = require('electron');
    const backupDir = path.join(process.cwd(), 'backups');

    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const result = await shell.openPath(backupDir);
        if (result) {
            shell.openExternal('file:///' + backupDir.replace(/\\/g, '/'));
        }
    } catch (err) {
        console.error('Failed to open backup folder:', err);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
