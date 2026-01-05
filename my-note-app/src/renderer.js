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

function getViewportCenter() {
    const scale = stage.scaleX();
    const x = (-stage.x() + stage.width() / 2) / scale;
    const y = (-stage.y() + stage.height() / 2) / scale;
    return { x, y };
}

// ---------------------------------------------------------
// 2. SHAPE HELPERS (Sticky Note, Image)
// ---------------------------------------------------------
function createStickyNote(text, x, y) {
  const group = new Konva.Group({ x: x, y: y, draggable: true });
  const rect = new Konva.Rect({
    width: 200, height: 150, fill: '#fff9c4', stroke: '#ddd', strokeWidth: 1,
    shadowColor: 'black', shadowBlur: 10, shadowOpacity: 0.1, cornerRadius: 5,
  });
  const textNode = new Konva.Text({
    text: text, x: 10, y: 10, width: 180, fontSize: 16, fontFamily: 'Calibri', fill: '#555',
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
  
  group.on('dblclick', () => {
    textNode.hide();
    const textPosition = textNode.getAbsolutePosition();
    const stageBox = stage.container().getBoundingClientRect();
    const areaPosition = { x: stageBox.left + textPosition.x, y: stageBox.top + textPosition.y };
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = textNode.text();
    textarea.style.position = 'absolute';
    textarea.style.top = areaPosition.y + 'px';
    textarea.style.left = areaPosition.x + 'px';
    textarea.style.width = textNode.width() + 'px';
    textarea.style.fontSize = textNode.fontSize() + 'px';
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.border = 'none'; textarea.style.padding = '0px'; textarea.style.margin = '0px';
    textarea.style.background = 'transparent'; textarea.style.outline = 'none'; textarea.style.resize = 'none';
    textarea.style.color = textNode.fill();
    const scale = stage.scaleX();
    textarea.style.transform = `scale(${scale})`;
    textarea.style.transformOrigin = 'left top';
    function autoExpand() {
        textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px';
        const newHeight = Math.max(150, textarea.scrollHeight + 20); rect.height(newHeight);
    }
    autoExpand(); textarea.focus(); textarea.addEventListener('input', autoExpand);
    function removeTextarea() { if (textarea.parentNode) textarea.parentNode.removeChild(textarea); textNode.show(); }
    function setText() { textNode.text(textarea.value); updateShape(); removeTextarea(); }
    textarea.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setText(); } if (e.key === 'Escape') { updateShape(); removeTextarea(); } });
    textarea.addEventListener('blur', function () { setText(); });
  });
}

function addImageToStage(file, x, y) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = () => {
            const konvaImage = new Konva.Image({
                x: x, y: y, image: imgObj, width: 200, height: 200 * (imgObj.height / imgObj.width), draggable: true,
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

const imageInput = document.createElement('input');
imageInput.type = 'file'; imageInput.accept = 'image/*'; imageInput.style.display = 'none';
document.body.appendChild(imageInput);
document.getElementById('btn-image').addEventListener('click', () => { imageInput.click(); });
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const center = getViewportCenter();
        addImageToStage(e.target.files[0], center.x - 100, center.y - 100);
        imageInput.value = '';
    }
});

// ---------------------------------------------------------
// 4. REFERENCE SYSTEM (Modal + LocalStorage)
// ---------------------------------------------------------

const feedSidebar = document.getElementById('feed-sidebar');
const feedContent = document.getElementById('feed-content');
const modal = document.getElementById('ref-modal');
const modalStatus = document.getElementById('modal-status');
const closeModalBtn = document.getElementById('close-modal-btn');
const btnFetch = document.getElementById('btn-fetch-confirm');
const inputUrl = document.getElementById('ref-input-url');

// A. LocalStorage Helpers
function getStoredImages() {
    const stored = localStorage.getItem('reference_images');
    return stored ? JSON.parse(stored) : [];
}

function saveStoredImages(newPaths) {
    const current = getStoredImages();
    // Combined unique set (Newest first)
    const combined = [...new Set([...newPaths, ...current])];
    localStorage.setItem('reference_images', JSON.stringify(combined));
    return combined;
}

function renderImagesFromStorage() {
    const paths = getStoredImages();
    feedContent.innerHTML = ''; // Clear current view

    paths.forEach(filePath => {
        const img = document.createElement('img');
        
        // --- URL FIX START ---
        // 1. Normalize slashes (Windows uses \, web uses /)
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        // 2. Encode URI to handle spaces, parenthesis, etc. safely
        const safePath = encodeURI(normalizedPath);
        
        // 3. Use 3 slashes (media:///) to signal absolute path with empty host
        img.src = `media:///${safePath}`; 
        // --- URL FIX END ---
        
        img.className = 'feed-item';
        img.draggable = true;
        
        // Drag to Canvas Logic
        img.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', img.src);
            e.dataTransfer.effectAllowed = 'copy';
        });

        // Right-click to delete
        img.addEventListener('contextmenu', (e) => {
             e.preventDefault();
             if(confirm("Remove this image?")) {
                 const current = getStoredImages();
                 const newStore = current.filter(p => p !== filePath);
                 localStorage.setItem('reference_images', JSON.stringify(newStore));
                 renderImagesFromStorage();
             }
        });

        feedContent.appendChild(img);
    });
}

// B. Modal Interactions
document.getElementById('btn-feed').addEventListener('click', () => {
    modal.style.display = "block";
    feedSidebar.classList.add('open');
});

document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    feedSidebar.classList.toggle('open');
});

closeModalBtn.onclick = () => { modal.style.display = "none"; };
window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; };

document.getElementById('btn-login-twitter').onclick = () => {
    window.electronAPI.loginTwitter();
};

document.getElementById('clear-refs').onclick = () => {
    if(confirm("Clear library?")) {
        localStorage.removeItem('reference_images');
        renderImagesFromStorage();
    }
};

// C. Fetch Logic
btnFetch.onclick = async () => {
    const url = inputUrl.value.trim();
    if (!url || url === 'empty') return; 

    modalStatus.innerText = "⏳ Fetching latest...";
    btnFetch.disabled = true;

    try {
        const localFilePaths = await window.electronAPI.fetchFeed(url);
        
        if (localFilePaths.length === 0) {
            modalStatus.innerText = "❌ No new images found.";
        } else {
            saveStoredImages(localFilePaths);
            modalStatus.innerText = `✅ Added ${localFilePaths.length} new refs!`;
            renderImagesFromStorage();
            
            document.getElementById('feed-content').scrollTop = 0;

            setTimeout(() => {
                modal.style.display = "none";
                modalStatus.innerText = "Ready to fetch.";
            }, 1000);
        }
    } catch (err) {
        modalStatus.innerText = "Error: " + err.message;
    } finally {
        btnFetch.disabled = false;
    }
};

// D. Initialize
renderImagesFromStorage();

// ---------------------------------------------------------
// 5. DRAG AND DROP HANDLER
// ---------------------------------------------------------
const container = document.getElementById('canvas-container');
container.addEventListener('dragover', (e) => { e.preventDefault(); });

container.addEventListener('drop', (e) => {
  e.preventDefault();
  stage.setPointersPositions(e);
  
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const pos = transform.point(stage.getPointerPosition());
  const imageUrl = e.dataTransfer.getData('text/plain');

  // Handle Local media://
  if (imageUrl && imageUrl.startsWith('media://')) {
      const imgObj = new Image();
      imgObj.src = imageUrl;
      // We must allow crossOrigin if needed, but for custom protocol it's usually handled by main
      imgObj.onload = () => {
          const konvaImage = new Konva.Image({
              x: pos.x, y: pos.y, image: imgObj,
              width: 250, height: 250 * (imgObj.height / imgObj.width),
              draggable: true,
          });
          layer.add(konvaImage);
      };
      return;
  }

  // Handle Desktop Files
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    if (files[0].type.startsWith('image/')) {
        addImageToStage(files[0], pos.x, pos.y);
    }
    return;
  }
  
  // Handle Web Images
  if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
     const imgObj = new Image();
     imgObj.src = imageUrl;
     imgObj.crossOrigin = 'Anonymous';
     imgObj.onload = () => {
         const konvaImage = new Konva.Image({
             x: pos.x, y: pos.y, image: imgObj,
             width: 250, height: 250 * (imgObj.height / imgObj.width), draggable: true
         });
         layer.add(konvaImage);
     };
  }
});

// Double click empty stage -> New Note
stage.on('dblclick', (e) => {
  if (e.target === stage) {
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(stage.getPointerPosition());
    createStickyNote('New Idea...', pos.x, pos.y);
  }
});