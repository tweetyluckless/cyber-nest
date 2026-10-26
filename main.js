const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
const prefsFile = () => path.join(app.getPath('userData'), 'window.json');

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function savePrefs(patch) {
  const prefs = { ...loadPrefs(), ...patch };
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs));
  } catch {}
}

// 铺满主屏工作区（不含任务栏）的底部，高度约为屏幕的 1/5
function stripBounds() {
  const { workArea: a } = screen.getPrimaryDisplay();
  const height = Math.round(a.height / 5);
  return { x: a.x, y: a.y + a.height - height, width: a.width, height };
}

function createWindow() {
  const prefs = loadPrefs();
  win = new BrowserWindow({
    ...stripBounds(),
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: prefs.stripPinned ?? false,
    backgroundColor: '#0b0820',
    title: '赛博小窝',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.setMenu(null);
  win.loadFile('index.html');

  // 分辨率或任务栏变化时重新贴到底部
  const refit = () => win && !win.isDestroyed() && win.setBounds(stripBounds());
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);
}

ipcMain.on('win:close', () => win?.close());
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.handle('win:isPinned', () => win?.isAlwaysOnTop());
ipcMain.handle('win:togglePin', () => {
  const pinned = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(pinned);
  savePrefs({ stripPinned: pinned });
  return pinned;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
