import './index.css';
import Konva from 'konva';

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
    let isRemoving = false;
    function removeTextarea() {
        if (isRemoving) return;
        isRemoving = true;
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

// Reusable function to add image from File object
function addImageToStage(file, x, y) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = () => {
            const konvaImage = new Konva.Image({
                x: x, y: y, image: imgObj,
                width: 200, height: 200 * (imgObj.height / imgObj.width), draggable: true,
            });
            layer.add(konvaImage);
        };
    };
    reader.readAsDataURL(file);
}

// --- Tool Palette Event Listeners ---
document.getElementById('btn-note').addEventListener('click', () => {
    const center = getViewportCenter();
    createStickyNote('New Note', center.x - 100, center.y - 75);
});

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

// Placeholder tools
document.getElementById('btn-link').addEventListener('click', () => alert('Link tool coming soon!'));
document.getElementById('btn-board').addEventListener('click', () => alert('Board tool coming soon!'));
document.getElementById('btn-table').addEventListener('click', () => alert('Table tool coming soon!'));

// --- FEED & SIDEBAR LOGIC ---
const feedSidebar = document.getElementById('feed-sidebar');
const feedContent = document.getElementById('feed-content');

// 1. Add Login Button
const loginBtn = document.createElement('button');
loginBtn.innerText = "🔑 Login to X";
loginBtn.style.width = "100%";
loginBtn.style.padding = "10px";
loginBtn.style.cursor = "pointer";
loginBtn.onclick = () => window.electronAPI.loginTwitter();
feedSidebar.insertBefore(loginBtn, feedContent);

// 2. Feed Button Click
document.getElementById('btn-feed').addEventListener('click', async () => {
    feedSidebar.classList.toggle('open');
    
    // Only load if opening and empty/error state
    if (feedSidebar.classList.contains('open')) {
        feedContent.innerHTML = '<div style="text-align:center; padding:20px;">Loading @Kelium_art...</div>';
        try {
            const images = await window.electronAPI.getFeed('twitter_kelium');
            
            if (images.length === 0) {
                feedContent.innerHTML = '<div style="padding:10px; text-align:center;">No images found.<br><br>Please click "Login to X" above, login, close the popup, and try again.</div>';
            } else {
                renderFeedItems(images);
            }
        } catch (error) {
            console.error("Feed error:", error);
            feedContent.innerHTML = '<div style="color:red; padding:10px;">Error loading feed.</div>';
        }
    }
});

function renderFeedItems(imageUrls) {
    feedContent.innerHTML = '';
    imageUrls.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'feed-item';
        img.draggable = true;
        
        // Save URL to drag event
        img.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', url);
            e.dataTransfer.effectAllowed = 'copy';
        });
        
        feedContent.appendChild(img);
    });
}

// --- Drag and Drop Handling (Updated) ---
const container = document.getElementById('canvas-container');

container.addEventListener('dragover', (e) => { e.preventDefault(); });

container.addEventListener('drop', (e) => {
  e.preventDefault();

  stage.setPointersPositions(e);
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const pos = transform.point(stage.getPointerPosition());

  // Case 1: Desktop Files
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/')) {
        addImageToStage(file, pos.x, pos.y);
    }
    return;
  }

  // Case 2: Web Images (Sidebar)
  const imageUrl = e.dataTransfer.getData('text/plain');
  if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
      const imgObj = new Image();
      imgObj.src = imageUrl;
      imgObj.crossOrigin = 'Anonymous';
      imgObj.onload = () => {
          const konvaImage = new Konva.Image({
              x: pos.x,
              y: pos.y,
              image: imgObj,
              width: 200,
              height: 200 * (imgObj.height / imgObj.width),
              draggable: true,
          });
          layer.add(konvaImage);
      };
  }
});

stage.on('dblclick', (e) => {
  if (e.target === stage) {
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(stage.getPointerPosition());
    createStickyNote('New Idea...', pos.x, pos.y);
  }
});