import './index.css';
import Konva from 'konva';

// 1. Initialize the Stage (The Infinite Canvas)
const width = window.innerWidth;
const height = window.innerHeight;

const stage = new Konva.Stage({
  container: 'canvas-container',
  width: width,
  height: height,
  draggable: true, // Allows panning the entire board
});

const layer = new Konva.Layer();
stage.add(layer);

// 2. Handle Zooming (Mouse Wheel)
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

// 3. Function to Create a Sticky Note
function createStickyNote(text, x, y) {
  const group = new Konva.Group({
    x: x,
    y: y,
    draggable: true,
  });

  const rect = new Konva.Rect({
    width: 200,
    height: 150,
    fill: '#fff9c4', // Classic sticky note yellow
    stroke: '#ddd',
    strokeWidth: 1,
    shadowColor: 'black',
    shadowBlur: 10,
    shadowOpacity: 0.1,
    cornerRadius: 5,
  });

  const textNode = new Konva.Text({
    text: text,
    x: 10,
    y: 10,
    width: 180,
    fontSize: 16,
    fontFamily: 'Calibri',
    fill: '#555',
  });

  group.add(rect);
  group.add(textNode);
  layer.add(group);
  
  // Double click to edit text (Simple prompt for now)
  group.on('dblclick', () => {
    const newText = prompt('Edit note:', textNode.text());
    if (newText !== null) {
      textNode.text(newText);
    }
  });
}

// 4. Double Click on background to add a Note
stage.on('dblclick', (e) => {
  // If we clicked on an empty area (the stage), add a note
  if (e.target === stage) {
    // We need to calculate position relative to the stage's zoom/pan
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(stage.getPointerPosition());
    
    createStickyNote('New Idea...', pos.x, pos.y);
  }
});

// 5. Handle Image Drag & Drop (From Desktop)
// We need to listen to the DOM events on the container, not Konva events
const container = document.getElementById('canvas-container');

container.addEventListener('dragover', (e) => {
  e.preventDefault(); // Necessary to allow dropping
});

container.addEventListener('drop', (e) => {
  e.preventDefault();

  // Get the stage position pointer to drop exactly where mouse is
  stage.setPointersPositions(e);
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const pos = transform.point(stage.getPointerPosition());

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = () => {
          const konvaImage = new Konva.Image({
            x: pos.x,
            y: pos.y,
            image: imgObj,
            width: 200,
            height: 200 * (imgObj.height / imgObj.width), // Maintain aspect ratio
            draggable: true,
          });
          layer.add(konvaImage);
        };
      };
      reader.readAsDataURL(file);
    }
  }
});