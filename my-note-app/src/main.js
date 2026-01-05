import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import started from 'electron-squirrel-startup';

// 1. REGISTER SCHEME
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

if (started) {
  app.quit();
}

// 2. SETUP PROTOCOL HANDLER (THE FIX)
function setupProtocol() {
  protocol.handle('media', (request) => {
    // 1. Strip 'media://' to get the raw path
    let filePath = request.url.slice('media://'.length);
    
    // 2. Decode characters (e.g. %20 -> Space)
    filePath = decodeURIComponent(filePath);
    
    // 3. Windows Cleanup: Remove leading slash if present (e.g. "/C:/Users" -> "C:/Users")
    if (process.platform === 'win32' && filePath.startsWith('/') && !filePath.startsWith('//')) {
      filePath = filePath.slice(1);
    }

    // 4. Debugging: Log what we are trying to read (Check your terminal!)
    console.log(`[Media Protocol] Loading: "${filePath}"`);

    // 5. Native File Check
    if (!fs.existsSync(filePath)) {
        console.error(`[Media Protocol] ❌ File not found: "${filePath}"`);
        return new Response('File not found', { status: 404 });
    }

    // 6. Return File Stream (The Robust Way)
    // We try to guess the mime type, but defaulting to nothing usually lets the browser sniff it.
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';

    return new Response(fs.createReadStream(filePath), {
        headers: { 'content-type': mimeType }
    });
  });
}

// ... Keep your existing downloadImage and other functions below ...
const downloadImage = (url, folderPath) => { 
    // ... (Your existing code) ... 
    return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }

      const parsedUrl = new URL(url);
      let fileName = path.basename(parsedUrl.pathname);
      if (fileName.includes(':')) fileName = fileName.split(':')[0];

      let ext = path.extname(fileName);
      if (!ext) {
        const formatParam = parsedUrl.searchParams.get('format');
        if (formatParam) ext = `.${formatParam}`;
      }
      
      if (!ext) {
        const contentType = response.headers['content-type'];
        if (contentType) {
          if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
          else if (contentType.includes('png')) ext = '.png';
          else if (contentType.includes('gif')) ext = '.gif';
          else if (contentType.includes('webp')) ext = '.webp';
        }
      }
      if (!ext) ext = '.jpg';
      if (!fileName.endsWith(ext)) fileName += ext;

      const filePath = path.join(folderPath, fileName);
      const file = fs.createWriteStream(filePath);

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });

      file.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });

    }).on('error', (err) => reject(err));
  });
};

async function scrapeAndDownloadTwitter(profileUrl) {
    // ... (Your existing code) ...
    // Make sure you keep the process.cwd() change from before!
      const username = profileUrl.split('/').pop().split('?')[0];
      if (!username) throw new Error("Invalid URL");

      const projectRoot = process.cwd(); 
      const downloadDir = path.join(projectRoot, 'img', username);
      
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      return new Promise((resolve) => {
        const win = new BrowserWindow({
          show: false,
          width: 1200, height: 900,
          webPreferences: { offscreen: true, images: true, partition: 'persist:main' }
        });

        let targetUrl = profileUrl;
        if (!targetUrl.includes('x.com') && !targetUrl.includes('twitter.com')) targetUrl = `https://x.com/${targetUrl}`;
        if (!targetUrl.includes('/media')) targetUrl += '/media';

        win.loadURL(targetUrl);

        win.webContents.on('did-finish-load', async () => {
          try {
            await new Promise(r => setTimeout(r, 4000));
            const remoteUrls = await win.webContents.executeJavaScript(`
              (() => {
                const imgs = [...document.querySelectorAll('img[src*="pbs.twimg.com/media"]')];
                return [...new Set(imgs.map(img => img.src))];
              })()
            `);

            const localPaths = [];
            if (remoteUrls.length > 0) {
                for (const url of remoteUrls) {
                  try {
                    const savedPath = await downloadImage(url, downloadDir);
                    localPaths.push(savedPath);
                  } catch (e) { console.error(e); }
                }
            }
            resolve(localPaths);
          } catch (err) { resolve([]); } 
          finally { if (!win.isDestroyed()) win.close(); }
        });

        setTimeout(() => { if (!win.isDestroyed()) { win.close(); resolve([]); } }, 60000);
      });
}

// ... (Rest of ipcMain handlers and createWindow remain the same) ...
ipcMain.handle('save-board', async (event, data) => {
  await fs.promises.writeFile('my-board.json', data);
});

ipcMain.handle('login-twitter', () => {
  const loginWin = new BrowserWindow({ width: 600, height: 700, webPreferences: { partition: 'persist:main' }});
  loginWin.loadURL('https://x.com/i/flow/login');
});

ipcMain.handle('fetch-feed', async (event, url) => {
  return await scrapeAndDownloadTwitter(url);
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:main',
      webSecurity: false // Keep this true if using the protocol fix
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
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });