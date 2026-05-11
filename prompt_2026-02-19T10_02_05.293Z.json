import { Stamp, TARGET_WIDTH, TARGET_HEIGHT } from '../types';

/**
 * Main function to process the uploaded image.
 * 1. Estimates background color.
 * 2. Removes background (Flood fill).
 * 3. Detects individual stamp blobs.
 * 4. Extracts them into Stamp objects.
 */
export async function processUploadedImage(
    file: File, 
    sourceImageId: string, 
    bgTolerance: number = 20, 
    mergeGap: number = 15
): Promise<{ stamps: Stamp[], width: number, height: number }> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  // Draw original raw image
  ctx.drawImage(img, 0, 0);
  
  // Clone raw canvas for "originalDataUrl" generation later
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = img.width;
  rawCanvas.height = img.height;
  const rawCtx = rawCanvas.getContext('2d');
  if (rawCtx) rawCtx.drawImage(canvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // 1 & 2. Remove Background (Modifies imageData in place)
  const processedImageData = removeBackground(imageData, bgTolerance);
  ctx.putImageData(processedImageData, 0, 0);

  // 3 & 4. Detect and Extract Stamps (Pass both processed and raw canvas)
  const stamps = extractStamps(processedImageData, canvas, rawCanvas, sourceImageId, mergeGap, bgTolerance);

  return {
    stamps,
    width: img.width,
    height: img.height,
  };
}

/**
 * Re-processes a single stamp's raw image with a new tolerance value.
 * Uses Flood Fill to protect inner colors.
 */
export async function reprocessStampWithTolerance(
  originalDataUrl: string, 
  tolerance: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      // Optimize read operations
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject('No context');

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      // Simple corner detection for background
      // Use Top-Left corner as base
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];

      const stack: [number, number][] = [];
      const visited = new Uint8Array(w * h);

      // Seed all 4 corners
      stack.push([0, 0]);
      stack.push([w-1, 0]);
      stack.push([0, h-1]);
      stack.push([w-1, h-1]);

      const tol = tolerance * 3; 

      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        
        const idx = (y * w + x);
        if (visited[idx]) continue;
        
        const pixelIdx = idx * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];

        // Check if pixel is close to background color
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

        if (diff < tol) {
           data[pixelIdx + 3] = 0; // Transparent
           visited[idx] = 1;
           
           // Add neighbors
           stack.push([x + 1, y]);
           stack.push([x - 1, y]);
           stack.push([x, y + 1]);
           stack.push([x, y - 1]);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = originalDataUrl;
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function removeBackground(imageData: ImageData, tolerance: number): ImageData {
  const { width, height, data } = imageData;
  
  // Robust Background Detection:
  const bg = getDominantBackgroundColor(data, width, height);
  if (!bg) return imageData; // No non-transparent pixels found
  
  const bgR = bg.r;
  const bgG = bg.g;
  const bgB = bg.b;

  const tol = tolerance * 3;

  // Flood fill algorithm to remove continuous background
  const stack: [number, number][] = [];
  const visited = new Uint8Array(width * height);
  
  const getIdx = (x: number, y: number) => (y * width + x) * 4;
  
  const isCloseToBg = (idx: number) => {
     const r = data[idx];
     const g = data[idx + 1];
     const b = data[idx + 2];
     const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
     return diff < tol;
  };

  // Add all edge pixels that look like background to the stack
  for (let x = 0; x < width; x++) {
      [0, height - 1].forEach(y => {
          const idx = getIdx(x, y);
          if (isCloseToBg(idx)) {
              stack.push([x, y]);
              visited[y * width + x] = 1;
          }
      });
  }
  for (let y = 0; y < height; y++) {
      [0, width - 1].forEach(x => {
          const idx = getIdx(x, y);
          if (visited[y * width + x]) return; // Already visited
          if (isCloseToBg(idx)) {
              stack.push([x, y]);
              visited[y * width + x] = 1;
          }
      });
  }

  // Flood Fill
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    
    // Process current pixel
    const idx = getIdx(x, y);
    data[idx + 3] = 0; // Set Alpha to 0

    // Check neighbors
    const neighbors = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];

    for(const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (!visited[ny * width + nx]) {
                const nIdx = getIdx(nx, ny);
                if (isCloseToBg(nIdx)) {
                    visited[ny * width + nx] = 1;
                    stack.push([nx, ny]);
                }
            }
        }
    }
  }

  return imageData;
}

function getDominantBackgroundColor(data: Uint8ClampedArray, width: number, height: number): {r: number, g: number, b: number} | null {
    const samples: {r: number, g: number, b: number}[] = [];
    // Ensure maximum precision
    const step = 1; 

    const addSample = (idx: number) => {
        if (data[idx + 3] > 0) {
            samples.push({r: data[idx], g: data[idx+1], b: data[idx+2]});
        }
    };

    // Sample Top and Bottom rows
    for(let x=0; x<width; x+=step) {
        addSample((0 * width + x) * 4);
        addSample(((height-1) * width + x) * 4);
    }
    // Sample Left and Right cols
    for(let y=0; y<height; y+=step) {
        addSample((y * width + 0) * 4);
        addSample((y * width + (width-1)) * 4);
    }

    if (samples.length === 0) return null;
    const counts: {[key: string]: number} = {};
    let maxCount = 0;
    let dominantStr = "255,255,255"; // Default white

    samples.forEach(s => {
        // Round to nearest 10 to group similar colors
        const r = Math.round(s.r / 10) * 10;
        const g = Math.round(s.g / 10) * 10;
        const b = Math.round(s.b / 10) * 10;
        const key = `${r},${g},${b}`;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > maxCount) {
            maxCount = counts[key];
            dominantStr = key;
        }
    });

    const [r, g, b] = dominantStr.split(',').map(Number);
    return {r, g, b};
}

function extractStamps(
    imageData: ImageData, 
    sourceCanvas: HTMLCanvasElement, 
    rawCanvas: HTMLCanvasElement, 
    sourceImageId: string,
    mergeGap: number,
    tolerance: number
): Stamp[] {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const boxes: { x: number, y: number, w: number, h: number }[] = [];

  // Iterate to find islands of non-transparent pixels
  // Removed optimization: iterate every pixel to ensure no small details are missed on mobile/high-res
  for (let y = 0; y < height; y++) { 
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 0 && !visited[y * width + x]) {
        const box = findBoundingBox(x, y, width, height, data, visited);
        // Only keep boxes that are reasonably sized
        if (box.w > 20 && box.h > 20) {
           boxes.push(box);
        }
      }
    }
  }

  const mergedBoxes = mergeBoxes(boxes, mergeGap);

  // Sort boxes (Grid order: Top-Left to Bottom-Right)
  mergedBoxes.sort((a, b) => a.y - b.y);
  
  const rows: typeof mergedBoxes[] = [];
  let currentRow: typeof mergedBoxes = [];
  let lastY = -1000;

  // Group by rough Y position
  mergedBoxes.forEach(box => {
    if (currentRow.length === 0) {
      currentRow.push(box);
      lastY = box.y;
    } else {
      // If box is roughly on the same line (center is close)
      const centerY = box.y + box.h/2;
      const lastCenterY = lastY + currentRow[0].h/2; // rough approx
      
      const yDiff = Math.abs(box.y - lastY);
      
      if (yDiff < box.h / 2) {
        currentRow.push(box);
      } else {
        rows.push(currentRow);
        currentRow = [box];
        lastY = box.y;
      }
    }
  });
  if (currentRow.length > 0) rows.push(currentRow);

  const sortedBoxes = rows.flatMap(row => row.sort((a, b) => a.x - b.x));

  return sortedBoxes.map((box, index) => {
    // 1. Create Transparent Stamp (processed)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = box.w;
    tempCanvas.height = box.h;
    const tCtx = tempCanvas.getContext('2d');
    tCtx?.drawImage(sourceCanvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    
    // 2. Create Original Raw Stamp (for restoration)
    const rawTempCanvas = document.createElement('canvas');
    rawTempCanvas.width = box.w;
    rawTempCanvas.height = box.h;
    const rawTCtx = rawTempCanvas.getContext('2d');
    rawTCtx?.drawImage(rawCanvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

    // Calculate initial scale to fit TARGET_WIDTH/HEIGHT
    const padding = 0;
    const availW = TARGET_WIDTH - padding;
    const availH = TARGET_HEIGHT - padding;
    
    let scale = Math.min(availW / box.w, availH / box.h);
    if (scale > 1) scale = 1;

    return {
      id: `stamp-${sourceImageId}-${index}`,
      sourceImageId,
      originalX: box.x,
      originalY: box.y,
      width: box.w,
      height: box.h,
      dataUrl: tempCanvas.toDataURL('image/png'),
      originalDataUrl: rawTempCanvas.toDataURL('image/png'),
      isExcluded: false,
      scale: scale, 
      rotation: 0, // Initialize rotation
      offsetX: 0,
      offsetY: 0,
      currentTolerance: tolerance
    };
  });
}

function findBoundingBox(startX: number, startY: number, w: number, h: number, data: Uint8ClampedArray, visited: Uint8Array) {
  let minX = startX, maxX = startX, minY = startY, maxY = startY;
  const stack = [[startX, startY]];
  visited[startY * w + startX] = 1;

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        if (!visited[ny * w + nx]) {
           const idx = (ny * w + nx) * 4;
           if (data[idx + 3] > 10) { // If pixel is not fully transparent
             visited[ny * w + nx] = 1;
             stack.push([nx, ny]);
           }
        }
      }
    }
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function mergeBoxes(boxes: { x: number, y: number, w: number, h: number }[], gap: number) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (rectIntersect(a, b, gap)) {
          const newX = Math.min(a.x, b.x);
          const newY = Math.min(a.y, b.y);
          const newMaxX = Math.max(a.x + a.w, b.x + b.w);
          const newMaxY = Math.max(a.y + a.h, b.y + b.h);
          
          boxes[i] = { x: newX, y: newY, w: newMaxX - newX, h: newMaxY - newY };
          boxes.splice(j, 1);
          changed = true;
          j--;
        }
      }
    }
  }
  return boxes;
}

function rectIntersect(a: { x: number, y: number, w: number, h: number }, b: { x: number, y: number, w: number, h: number }, gap: number) {
  return (a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
          a.y < b.y + b.h + gap && a.y + a.h + gap > b.y);
}