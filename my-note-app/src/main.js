import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// ---------------------------------------------------------
// 1. HELPER FUNCTION: Scrape X (Twitter) Images
// ---------------------------------------------------------
async function scrapeTwitterMedia(username) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: true, // <--- CHANGE TO TRUE (Allows you to see if it works)
      width: 1000,
      height: 800,
      webPreferences: {
        offscreen: false, // Change to false if showing window
        images: true,
        partition: 'persist:main' // <--- CRITICAL FIX: Share cookies with login window
      }
    });

    const url = `https://x.com/rogercoo2/media`;
    console.log(`[Scraper] Visiting: ${url}`);
    
    win.loadURL(url);
    win.loadURL(url);

    // Wait for the page to finish loading
    win.webContents.on('did-finish-load', async () => {
      try {
        console.log('[Scraper] Page loaded, waiting for content...');
        // Wait 3 seconds for Twitter's React app to render images
        await new Promise(r => setTimeout(r, 3000));

        // Run JavaScript inside the hidden window to extract image URLs
        const imageUrls = await win.webContents.executeJavaScript(`
          (() => {
            // Find all images hosted on 'pbs.twimg.com' (Twitter Media)
            const imgs = Array.from(document.querySelectorAll('img[src*="pbs.twimg.com/media"]'));
            // Return their src attributes, removing duplicates
            return [...new Set(imgs.map(img => img.src))];
          })()
        `);

        console.log(`[Scraper] Found ${imageUrls.length} images`);
        resolve(imageUrls);
      } catch (err) {
        console.error("[Scraper] Error finding images:", err);
        resolve([]);
      } finally {
        // Always close the hidden window when done
        if (!win.isDestroyed()) win.close();
      }
    });

    // Safety Timeout: If it hangs for 30s, kill it
    setTimeout(() => {
      if (!win.isDestroyed()) {
        console.log("[Scraper] Timed out");
        win.close();
        resolve([]);
      }
    }, 30000);
  });
}

// ---------------------------------------------------------
// 2. IPC HANDLERS (The API for your Renderer)
// ---------------------------------------------------------

// Handler for saving board data
ipcMain.handle('save-board', async (event, data) => {
  await fs.writeFile('my-board.json', data);
  return 'saved';
});

// Handler for opening the Twitter Login window
ipcMain.handle('login-twitter', () => {
  const loginWin = new BrowserWindow({
    width: 500,
    height: 600,
    alwaysOnTop: true,
    webPreferences: {
      partition: 'persist:main' // Saves cookies so the scraper can use them later
    }
  });
  loginWin.loadURL('https://x.com/i/flow/login');
});

// THIS WAS MISSING OR NOT REGISTERED:
// Handler for getting the feed (Calls the scraper)
ipcMain.handle('get-feed', async (event, platform) => {
  console.log(`[Main] Received request for feed: ${platform}`);
  
  if (platform === 'twitter_kelium') {
    return await scrapeTwitterMedia('Kelium_art');
  }
  
  return [];
});

// ---------------------------------------------------------
// 3. WINDOW CREATION (Standard Electron Code)
// ---------------------------------------------------------
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:main' // Share cookies with the login window
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

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