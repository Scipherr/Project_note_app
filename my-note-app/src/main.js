import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import started from 'electron-squirrel-startup';

// --- FIX STARTS HERE ---
// This tells Electron: "media:// is a real, safe protocol like http://"
protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'media', 
    privileges: { 
      secure: true, 
      standard: true, 
      supportFetchAPI: true, 
      bypassCSP: true,
      stream: true
    } 
  }
]);
// --- FIX ENDS HERE ---

if (started) {
  app.quit();
}

function setupProtocol() {
  protocol.handle('media', (request) => {
    let filePath = request.url.slice('media://'.length);
    // Decode URI (e.g. %20 -> space)
    filePath = decodeURIComponent(filePath);
    
    // Windows Fix: Remove leading slash if it exists (e.g. /C:/Users -> C:/Users)
    if (process.platform === 'win32' && filePath.startsWith('/') && !filePath.startsWith('//')) {
      filePath = filePath.slice(1);
    }
    
    // IMPORTANT: Use file:/// protocol for the internal fetch
    return net.fetch('file:///' + filePath);
  });
}

const downloadImage = (url, folderPath) => {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      let fileName = path.basename(parsedUrl.pathname);

      if (fileName.includes(':')) {
        fileName = fileName.split(':')[0];
      }

      const extInPath = path.extname(fileName);
      const formatParam = parsedUrl.searchParams.get('format');

      if (formatParam && !extInPath) {
        fileName += `.${formatParam}`;
      } else if (!extInPath) {
        fileName += '.jpg';
      }

      const filePath = path.join(folderPath, fileName);
      const file = fs.createWriteStream(filePath);

      https.get(url, (response) => {
        if (response.statusCode !== 200) {
           file.close();
           fs.unlink(filePath, () => {});
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