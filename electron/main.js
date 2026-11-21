// Desktop app: runs the same local server + web app inside its own window.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { start } = require('../server');

async function createWindow() {
  const server = await start(0); // random free port
  const { port } = server.address();
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: 'Pennant Maker', backgroundColor: '#f3efe7', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'app', 'icons', 'pennant-maker.ico'),
    webPreferences: { contextIsolation: true },
  });
  // Downloads go through Chromium's normal "save as" flow
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(`http://127.0.0.1:${port}/`);
  win.on('closed', () => server.close());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
