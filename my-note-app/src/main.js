import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';



if (started) {
  app.quit();
}
ipcMain.handle('save-board', async (event, data) => {
  await fs.writeFile('my-board.json', data);
  return 'saved';
});
const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};


ipcMain.handle('get-feed', async (event, platform) => {
  
  const mockImages = [
    "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=300",
    "https://images.unsplash.com/photo-1493612276216-ee3925520721?w=300",
    "https://images.unsplash.com/photo-1544256718-3bcf237f3974?w=300",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300"
  ];

  return mockImages; 
});
app.whenReady().then(() => {
  createWindow();

  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
