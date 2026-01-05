import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

// --- 1. SETUP LOCAL IMAGE PROTOCOL ---
// This allows the app to load local images using "media://<path>"
// e.g. <img src="media://C:/Users/Name/AppData/..." />
function setupProtocol() {
  protocol.handle('media', (request) => {
    let filePath = request.url.slice('media://'.length);
    // Decode URI (fixes spaces/special chars)
    filePath = decodeURIComponent(filePath);
    // On Windows, paths might start with a slash that needs removing (e.g. /C:/...)
    if (process.platform === 'win32' && filePath.startsWith('/') && !filePath.startsWith('//')) {
      filePath = filePath.slice(1);
    }
    return net.fetch('file://' + filePath);
  });
}

// --- 2. DOWNLOAD HELPER ---
const downloadImage = (url, folderPath) => {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(new URL(url).pathname);
    const filePath = path.join(folderPath, fileName);

    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete failed file
      reject(err);
    });
  });
};

// --- 3. SCRAPER + DOWNLOADER ---
async function scrapeAndDownloadTwitter(profileUrl) {
  // Extract username from URL (e.g. https://x.com/Kelium_art -> Kelium_art)
  const username = profileUrl.split('/').pop().split('?')[0];
  if (!username) throw new Error("Invalid URL");

  // Create a folder for this user
  const userDataPath = app.getPath('userData'); // Safe app folder
  const downloadDir = path.join(userDataPath, 'feeds', username);
  
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  // SCRAPE (Hidden Window)
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false, // Hidden
      width: 1000, height: 800,
      webPreferences: { 
        offscreen: true, 
        images: true, 
        partition: 'persist:main' // Use logged-in cookies
      }
    });

    // Force "/media" tab
    const targetUrl = profileUrl.includes('/media') ? profileUrl : `https://x.com/${username}/media`;
    console.log(`[Scraper] Visiting: ${targetUrl}`);
    win.loadURL(targetUrl);

    win.webContents.on('did-finish-load', async () => {
      try {
        console.log('[Scraper] Page loaded, waiting 4s...');
        await new Promise(r => setTimeout(r, 4000));

        // Get Image URLs
        const remoteUrls = await win.webContents.executeJavaScript(`
          (() => {
            const imgs = Array.from(document.querySelectorAll('img[src*="pbs.twimg.com/media"]'));
            return [...new Set(imgs.map(img => img.src))];
          })()
        `);

        console.log(`[Scraper] Found ${remoteUrls.length} images. Downloading...`);

        // Download all images to local folder
        const localPaths = [];
        for (const url of remoteUrls) {
          try {
            const savedPath = await downloadImage(url, downloadDir);
            localPaths.push(savedPath);
          } catch (e) {
            console.error(`Failed to download ${url}`, e);
          }
        }
        
        console.log(`[Scraper] Downloaded ${localPaths.length} images.`);
        resolve(localPaths);

      } catch (err) {
        console.error(err);
        resolve([]);
      } finally {
        if (!win.isDestroyed()) win.close();
      }
    });

    // Timeout
    setTimeout(() => {
      if (!win.isDestroyed()) { win.close(); resolve([]); }
    }, 45000); // 45s timeout
  });
}

// --- 4. IPC HANDLERS ---
ipcMain.handle('save-board', async (event, data) => {
  await fs.promises.writeFile('my-board.json', data);
  return 'saved';
});

ipcMain.handle('login-twitter', () => {
  const loginWin = new BrowserWindow({
    width: 500, height: 600, alwaysOnTop: true,
    webPreferences: { partition: 'persist:main' }
  });
  loginWin.loadURL('https://x.com/i/flow/login');
});

ipcMain.handle('fetch-feed', async (event, url) => {
  console.log(`Processing Feed: ${url}`);
  if (url.includes('x.com') || url.includes('twitter.com')) {
    return await scrapeAndDownloadTwitter(url);
  }
  return [];
});

// --- 5. APP LIFECYCLE ---
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:main',
      webSecurity: true // We use media:// protocol now, so this is safe
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(() => {
  setupProtocol(); // Register media://
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});