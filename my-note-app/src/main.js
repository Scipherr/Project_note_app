import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// --- Helper: Scrape X (Twitter) Media ---
async function scrapeTwitterMedia(username) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false, // Hidden window
      width: 1000,
      height: 800,
      webPreferences: {
        offscreen: true,
        images: true // Load images to ensure they exist
      }
    });

    const url = `https://x.com/${username}/media`;
    console.log(`Scraping: ${url}`);
    
    win.loadURL(url);

    // Wait for page to finish loading
    win.webContents.on('did-finish-load', async () => {
      try {
        // Wait 3 seconds for React to render content
        await new Promise(r => setTimeout(r, 3000));

        // Execute JS in the hidden window to find images
        const imageUrls = await win.webContents.executeJavaScript(`
          (() => {
            // Find all images hosted on twimg (Twitter's image host)
            const imgs = Array.from(document.querySelectorAll('img[src*="pbs.twimg.com/media"]'));
            return [...new Set(imgs.map(img => img.src))];
          })()
        `);

        console.log(`Found ${imageUrls.length} images`);
        resolve(imageUrls);
      } catch (err) {
        console.error("Scrape failed", err);
        resolve([]);
      } finally {
        // Always close the hidden window
        if (!win.isDestroyed()) win.close();
      }
    });

    // Safety timeout: Close after 30s if stuck
    setTimeout(() => {
      if (!win.isDestroyed()) {
        console.log("Scrape timed out");
        win.close();
        resolve([]);
      }
    }, 30000);
  });
}

// --- IPC Handlers ---

ipcMain.handle('save-board', async (event, data) => {
  await fs.writeFile('my-board.json', data);
  return 'saved';
});

// Handler to fetch feed (Calls the scraper)
ipcMain.handle('get-feed', async (event, platform) => {
  if (platform === 'twitter_kelium') {
    return await scrapeTwitterMedia('Kelium_art');
  }
  return [];
});

// Handler to open Login Window
ipcMain.handle('login-twitter', () => {
  const loginWin = new BrowserWindow({
    width: 500,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      partition: 'persist:main' // Ensure cookies persist
    }
  });
  loginWin.loadURL('https://x.com/i/flow/login');
});

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:main' // Share cookies with login window
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