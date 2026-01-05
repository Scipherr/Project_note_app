import './index.css';
import Konva from 'konva';

// ---------------------------------------------------------
// 1. STAGE & CANVAS SETUP
// ---------------------------------------------------------
const containerElement = document.getElementById('canvas-container');
const width = containerElement.offsetWidth;
const height = containerElement.offsetHeight;

const stage = new Konva.Stage({
  container: 'canvas-container',
  width: width,
  height: height,
  draggable: true,
});

const layer = new Konva.Layer();
stage.add(layer);

// --- Zoom & Pan Logic ---
const scaleBy = 1.1;
stage.on('wheel', (e) => {
  e.evt.preventDefault();
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition();

  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  const direction = e.evt.deltaY > 0 ? -1 : 1;
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

  stage.scale({ x: newScale, y: newScale });

  const newPos = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  };
  stage.position(newPos);
});

// Helper to get center of view
function getViewportCenter() {
    const scale = stage.scaleX();
    const x = (-stage.x() + stage.width() / 2) / scale;
    const y = (-stage.y() + stage.height() / 2) / scale;
    return { x, y };
}

// ---------------------------------------------------------
// 2. SHAPE HELPERS
// ---------------------------------------------------------

function createStickyNote(text, x, y) {
  const group = new Konva.Group({ x: x, y: y, draggable: true });

  const rect = new Konva.Rect({
    width: 200, height: 150,
    fill: '#fff9c4', stroke: '#ddd', strokeWidth: 1,
    shadowColor: 'black', shadowBlur: 10, shadowOpacity: 0.1,
    cornerRadius: 5,
  });

  const textNode = new Konva.Text({
    text: text, x: 10, y: 10, width: 180,
    fontSize: 16, fontFamily: 'Calibri', fill: '#555',
  });

  function updateShape() {
    const textHeight = textNode.height();
    const newHeight = Math.max(150, textHeight + 20);
    rect.height(newHeight);
  }
  updateShape();

  group.add(rect);
  group.add(textNode);
  layer.add(group);
  
  // Double click to edit text
  group.on('dblclick', () => {
    textNode.hide();
    const textPosition = textNode.getAbsolutePosition();
    const stageBox = stage.container().getBoundingClientRect();
    const areaPosition = {
      x: stageBox.left + textPosition.x,
      y: stageBox.top + textPosition.y,
    };

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = textNode.text();
    textarea.style.position = 'absolute';
    textarea.style.top = areaPosition.y + 'px';
    textarea.style.left = areaPosition.x + 'px';
    textarea.style.width = textNode.width() + 'px';
    textarea.style.fontSize = textNode.fontSize() + 'px';
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.lineHeight = textNode.lineHeight();
    textarea.style.border = 'none';
    textarea.style.padding = '0px';
    textarea.style.margin = '0px';
    textarea.style.background = 'transparent';
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.color = textNode.fill();
    textarea.style.overflow = 'hidden'; 
    
    const scale = stage.scaleX();
    textarea.style.transform = `scale(${scale})`;
    textarea.style.transformOrigin = 'left top';

    function autoExpand() {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        const newHeight = Math.max(150, textarea.scrollHeight + 20);
        rect.height(newHeight);
    }

    autoExpand();
    textarea.focus();
    textarea.addEventListener('input', autoExpand);

    function removeTextarea() {
        if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
        textNode.show();
    }

    function setText() {
        textNode.text(textarea.value);
        updateShape(); 
        removeTextarea();
    }

    textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setText(); }
        if (e.key === 'Escape') { updateShape(); removeTextarea(); }
    });
    textarea.addEventListener('blur', function () { setText(); });
  });
}

// Helper to add image from File object (Desktop Drop)
function addImageToStage(file, x, y) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = () => {
            const konvaImage = new Konva.Image({
                x: x, y: y, image: imgObj,
                width: 200, height: 200 * (imgObj.height / imgObj.width),
                draggable: true,
            });
            layer.add(konvaImage);
        };
    };
    reader.readAsDataURL(file);
}

// ---------------------------------------------------------
// 3. TOOLBAR LISTENERS
// ---------------------------------------------------------

document.getElementById('btn-note').addEventListener('click', () => {
    const center = getViewportCenter();
    createStickyNote('New Note', center.x - 100, center.y - 75);
});

// Hidden file input for Image Button
const imageInput = document.createElement('input');
imageInput.type = 'file';
imageInput.accept = 'image/*';
imageInput.style.display = 'none';
document.body.appendChild(imageInput);

document.getElementById('btn-image').addEventListener('click', () => { imageInput.click(); });
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const center = getViewportCenter();
        addImageToStage(e.target.files[0], center.x - 100, center.y - 100);
        imageInput.value = '';
    }
});

// Placeholders
document.getElementById('btn-link').addEventListener('click', () => alert('Link tool coming soon!'));
document.getElementById('btn-board').addEventListener('click', () => alert('Board tool coming soon!'));
document.getElementById('btn-table').addEventListener('click', () => alert('Table tool coming soon!'));

// ---------------------------------------------------------
// 4. FEED SIDEBAR & DOWNLOADER LOGIC
// ---------------------------------------------------------

const feedSidebar = document.getElementById('feed-sidebar');
const feedContent = document.getElementById('feed-content');

// Helper to Create the Input Box & Download Button
function createFeedUI() {
    feedContent.innerHTML = ''; // Clear existing

    // Container
    const container = document.createElement('div');
    container.style.padding = '10px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.borderBottom = '1px solid #ccc';

    // 1. Login Button
    const loginBtn = document.createElement('button');
    loginBtn.innerText = "🔑 Login to X (First Time)";
    loginBtn.style.padding = '8px';
    loginBtn.style.cursor = 'pointer';
    loginBtn.title = "Click this if scraper finds 0 images";
    loginBtn.onclick = () => window.electronAPI.loginTwitter();

    // 2. Input Box
    const input = document.createElement('input');
    input.placeholder = "Paste X.com profile link...";
    input.style.padding = '8px';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '4px';
    input.value = "https://x.com/Kelium_art"; // Default example

    // 3. Download Button
    const fetchBtn = document.createElement('button');
    fetchBtn.innerText = "📥 Download References";
    fetchBtn.style.padding = '10px';
    fetchBtn.style.backgroundColor = '#2196F3';
    fetchBtn.style.color = 'white';
    fetchBtn.style.border = 'none';
    fetchBtn.style.borderRadius = '4px';
    fetchBtn.style.cursor = 'pointer';
    fetchBtn.style.fontWeight = 'bold';

    // 4. Status Text
    const statusText = document.createElement('div');
    statusText.style.fontSize = '12px';
    statusText.style.color = '#555';
    statusText.style.marginTop = '5px';
    statusText.innerText = 'Ready to download.';

    // Logic: Click Download
    fetchBtn.onclick = async () => {
        const url = input.value.trim();
        if (!url) return;

        statusText.innerText = "⏳ Scraping & Downloading... (Wait ~10s)";
        fetchBtn.disabled = true;
        fetchBtn.style.backgroundColor = '#ccc';

        try {
            // Call Main Process to scrape and download
            const localFilePaths = await window.electronAPI.fetchFeed(url);
            
            if (localFilePaths.length === 0) {
                statusText.innerText = "❌ No images found. Please Login above.";
            } else {
                statusText.innerText = `✅ Success! Loaded ${localFilePaths.length} images.`;
                renderLocalImages(localFilePaths);
            }
        } catch (err) {
            statusText.innerText = "❌ Error: " + err.message;
            console.error(err);
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.style.backgroundColor = '#2196F3';
        }
    };

    container.appendChild(loginBtn);
    container.appendChild(input);
    container.appendChild(fetchBtn);
    container.appendChild(statusText);
    feedContent.appendChild(container);

    // Image Grid Container
    const grid = document.createElement('div');
    grid.id = 'feed-grid';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.gap = '15px';
    grid.style.padding = '10px';
    feedContent.appendChild(grid);
}

// Helper to Render Images with media:// protocol
function renderLocalImages(paths) {
    const grid = document.getElementById('feed-grid');
    grid.innerHTML = ''; // Clear old images

    paths.forEach(filePath => {
        const img = document.createElement('img');
        
        // USE CUSTOM PROTOCOL (Allows local file access)
        img.src = `media://${filePath}`; 
        
        img.className = 'feed-item';
        img.draggable = true;
        
        // Pass the media:// URL during Drag
        img.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', img.src);
            e.dataTransfer.effectAllowed = 'copy';
        });
        
        grid.appendChild(img);
    });
}

// Toggle Sidebar Listener
document.getElementById('btn-feed').addEventListener('click', () => {
    feedSidebar.classList.toggle('open');
    // Initialize UI if empty
    if (feedSidebar.classList.contains('open') && feedContent.children.length === 0) {
        createFeedUI();
    }
});

// ---------------------------------------------------------
// 5. DRAG AND DROP HANDLER (FINAL)
// ---------------------------------------------------------

const container = document.getElementById('canvas-container');

container.addEventListener('dragover', (e) => { e.preventDefault(); });

container.addEventListener('drop', (e) => {
  e.preventDefault();
  stage.setPointersPositions(e);
  
  // Calculate Drop Position relative to Stage
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const pos = transform.point(stage.getPointerPosition());

  const imageUrl = e.dataTransfer.getData('text/plain');

  // CASE 1: Local Downloaded Files (media://)
  if (imageUrl && imageUrl.startsWith('media://')) {
      const imgObj = new Image();
      imgObj.src = imageUrl; // Browser handles the protocol now
      imgObj.onload = () => {
          const konvaImage = new Konva.Image({
              x: pos.x, y: pos.y,
              image: imgObj,
              width: 250, 
              height: 250 * (imgObj.height / imgObj.width),
              draggable: true,
          });
          layer.add(konvaImage);
      };
      return;
  }

  // CASE 2: Desktop Files (Drag from Folder)
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/')) {
        addImageToStage(file, pos.x, pos.y);
    }
    return;
  }

  // CASE 3: Web Images (Drag from Chrome/Browser)
  if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
     const imgObj = new Image();
     imgObj.src = imageUrl;
     imgObj.crossOrigin = 'Anonymous';
     imgObj.onload = () => {
         const konvaImage = new Konva.Image({
             x: pos.x, y: pos.y, 
             image: imgObj,
             width: 250, 
             height: 250 * (imgObj.height / imgObj.width), 
             draggable: true
         });
         layer.add(konvaImage);
     };
  }
});

// Double Click on empty stage = New Note
stage.on('dblclick', (e) => {
  if (e.target === stage) {
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(stage.getPointerPosition());
    createStickyNote('New Idea...', pos.x, pos.y);
  }
});