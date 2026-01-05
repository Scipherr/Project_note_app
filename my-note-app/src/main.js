import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

function setupProtocol() {
  protocol.handle('media', (request) => {
    let filePath = request.url.slice('media://'.length);
    filePath = decodeURIComponent(filePath);
    if (process.platform === 'win32' && filePath.startsWith('/') && !filePath.startsWith('//')) {
      filePath = filePath.slice(1);
    }
    return net.fetch('file://' + filePath);
  });
}

const downloadImage = (url, folderPath) => {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      
      // 1. Get the base ID (e.g., "F_xXYZ...")
      let fileName = path.basename(parsedUrl.pathname);

      // 2. Clean up weird suffixes like ":large" (common on Twitter)
      // Example: image.jpg:large -> image.jpg
      if (fileName.includes(':')) {
        fileName = fileName.split(':')[0];
      }

      // 3. Detect Extension from "?format=jpg" or default to .jpg
      const extInPath = path.extname(fileName);
      const formatParam = parsedUrl.searchParams.get('format');

      if (formatParam && !extInPath) {
        // Use the format param if no extension exists in path
        fileName += `.${formatParam}`;
      } else if (!extInPath) {
        // Fallback if absolutely no extension found
        fileName += '.jpg';
      }

      const filePath = path.join(folderPath, fileName);

      const file = fs.createWriteStream(filePath);
      https.get(url, (response) => {
        // Check if we actually got an image (optional safety)
        if (response.statusCode !== 200) {
           file.close();
           fs.unlink(filePath, () => {}); // Delete empty file
           reject(new Error(`Failed to download: ${response.statusCode}`));
           return;
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filePath);
        });
      }).on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });

    } catch (err) {
      reject(err);
    }
  });
};

async function scrapeAndDownloadTwitter(profileUrl) {
  const username = profileUrl.split('/').pop().split('?')[0];
  if (!username) throw new Error("Invalid URL");

  const userDataPath = app.getPath('userData');
  const downloadDir = path.join(userDataPath, 'feeds', username);
  
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: { 
        offscreen: true,
        images: true, 
        partition: 'persist:main'
      }
    });

    let targetUrl = profileUrl;
    if (!targetUrl.includes('x.com') && !targetUrl.includes('twitter.com')) {
       targetUrl = `https://x.com/${targetUrl}`;
    }
    if (!targetUrl.includes('/media')) {
       targetUrl += '/media';
    }

    win.loadURL(targetUrl);

    win.webContents.on('did-finish-load', async () => {
      try {
        await new Promise(r => setTimeout(r, 5000));

        const remoteUrls = await win.webContents.executeJavaScript(`
          (() => {
            const imgs = [
              ...document.querySelectorAll('img[src*="pbs.twimg.com/media"]'),
              ...document.querySelectorAll('div[data-testid="tweetPhoto"] img')
            ];
            return [...new Set(imgs.map(img => img.src))];
          })()
        `);

        if (remoteUrls.length > 0) {
            const localPaths = [];
            for (const url of remoteUrls) {
              try {
                const savedPath = await downloadImage(url, downloadDir);
                localPaths.push(savedPath);
              } catch (e) {
                console.error(e);
              }
            }
            resolve(localPaths);
        } else {
             resolve([]);
        }
      } catch (err) {
        resolve([]);
      } finally {
        if (!win.isDestroyed()) win.close();
      }
    });

    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.close();
        resolve([]);
      }
    }, 60000);
  });
}

ipcMain.handle('save-board', async (event, data) => {
  await fs.promises.writeFile('my-board.json', data);
  return 'saved';
});

ipcMain.handle('login-twitter', () => {
  const loginWin = new BrowserWindow({
    width: 600,
    height: 700,
    alwaysOnTop: true,
    webPreferences: { partition: 'persist:main' }
  });
  loginWin.loadURL('https://x.com/i/flow/login');
});

ipcMain.handle('fetch-feed', async (event, url) => {
  if (url.includes('x.com') || url.includes('twitter.com')) {
    return await scrapeAndDownloadTwitter(url);
  }
  return [];
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:main',
      webSecurity: true
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(() => {
  setupProtocol();
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