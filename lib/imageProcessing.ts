import { Stamp, TARGET_WIDTH, TARGET_HEIGHT } from '../types';

// LINE絵文字はオーナー確認済みの仕様として余白を設けない。
export const EMOJI_MARGIN = 0;

export function computeFitScale(
  w: number,
  h: number,
  targetWidth: number,
  targetHeight: number,
  allowUpscale: boolean
): number {
  const availW = targetWidth - EMOJI_MARGIN * 2;
  const availH = targetHeight - EMOJI_MARGIN * 2;
  const scale = Math.min(availW / w, availH / h);
  return allowUpscale ? scale : Math.min(scale, 1);
}

/**
 * 背景透過の扱い。
 * auto  = 画像を見て「透過済み」なら背景透過をスキップする(既定)
 * force = 常に透過済みとみなし、背景透過をしない
 * off   = 常に背景透過する(従来の動き)
 */
export type TransparencyMode = 'auto' | 'force' | 'off';

// alphaがこの値未満なら「透明」とみなす。
const ALPHA_TRANSPARENT_MAX = 10;
// 外周のうちこの割合以上が透明なら「背景透過済み」の候補とする。
const BORDER_TRANSPARENT_RATIO = 0.9;
// 全体のうちこの割合以上が透明であることも条件にする(誤検知防止)。
const TOTAL_TRANSPARENT_RATIO = 0.05;

/**
 * すでに背景が透過されている画像かどうかを判定する。
 * ChatGPTなどが出力する透過PNGは、透明部分のRGBが(0,0,0)になっていることが多く、
 * そのまま背景透過にかけると黒い線画まで背景色とみなされて削られてしまう。
 * そのため、外周がほぼ透明で、かつ画像全体にもある程度の透明部分がある場合は
 * 背景透過をスキップして切り分けだけ行う。
 */
export function detectAlreadyTransparent(imageData: ImageData): boolean {
  const { width, height, data } = imageData;
  if (width < 2 || height < 2) return false;

  // 1. 外周1pxの透明率
  let borderTotal = 0;
  let borderTransparent = 0;
  const countBorder = (idx: number) => {
    borderTotal++;
    if (data[idx + 3] < ALPHA_TRANSPARENT_MAX) borderTransparent++;
  };
  for (let x = 0; x < width; x++) {
    countBorder((0 * width + x) * 4);
    countBorder(((height - 1) * width + x) * 4);
  }
  for (let y = 0; y < height; y++) {
    countBorder((y * width + 0) * 4);
    countBorder((y * width + (width - 1)) * 4);
  }
  if (borderTransparent / borderTotal < BORDER_TRANSPARENT_RATIO) return false;

  // 2. 画像全体の透明率
  const total = width * height;
  let transparent = 0;
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] < ALPHA_TRANSPARENT_MAX) transparent++;
  }
  return transparent / total >= TOTAL_TRANSPARENT_RATIO;
}

/**
 * 画像ファイルが背景透過済みかどうかを判定する。
 * 手動切り出しなど、processUploadedImage を通さない経路でも同じ判定を使うためのもの。
 */
export async function isFileAlreadyTransparent(file: File): Promise<boolean> {
  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    return detectAlreadyTransparent(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    return false;
  }
}

/**
 * transparencyMode と画像の中身から、背景透過をスキップすべきかを決める。
 */
function shouldSkipBgRemoval(imageData: ImageData, mode: TransparencyMode): boolean {
  if (mode === 'force') return true;
  if (mode === 'off') return false;
  return detectAlreadyTransparent(imageData);
}

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
    mergeGap: number = 15,
    fillHoles: boolean = true,
    autoFit: boolean = false,
    transparencyMode: TransparencyMode = 'auto'
): Promise<{ stamps: Stamp[], width: number, height: number, skippedBgRemoval: boolean }> {
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
  // 背景透過済みなら、この工程を丸ごと飛ばして元のalphaをそのまま使う。
  const skippedBgRemoval = shouldSkipBgRemoval(imageData, transparencyMode);
  const processedImageData = skippedBgRemoval
    ? imageData
    : removeBackground(imageData, bgTolerance, fillHoles);
  ctx.putImageData(processedImageData, 0, 0);

  // 3 & 4. Detect and Extract Stamps (Pass both processed and raw canvas)
  const stamps = extractStamps(processedImageData, canvas, rawCanvas, sourceImageId, mergeGap, bgTolerance, autoFit, skippedBgRemoval);

  return {
    stamps,
    width: img.width,
    height: img.height,
    skippedBgRemoval,
  };
}

/**
 * Re-processes a single stamp's raw image with a new tolerance value.
 * Uses Flood Fill to protect inner colors.
 */
export async function reprocessStampWithTolerance(
  originalDataUrl: string, 
  tolerance: number,
  fillHoles: boolean = true,
  skipBgRemoval: boolean = false
): Promise<string> {
  // 背景透過済みのスタンプは、透過スライダーを動かしても何もしない。
  if (skipBgRemoval) return originalDataUrl;
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

      // 背景透過済みの画像は透過処理をしない(黒い線画が削られるのを防ぐ)。
      if (detectAlreadyTransparent(imageData)) {
        resolve(originalDataUrl);
        return;
      }
      // Simple corner detection for background
      // Use Top-Left corner as base
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];

      const tol = tolerance * 3;
      fillBackgroundRegions(imageData, bgR, bgG, bgB, tol, fillHoles, HOLE_MIN_AREA);

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

// 囲まれた背景(「○」の中、手と顔の間など)の穴とみなす最小面積(px)。
const HOLE_MIN_AREA = 3;

export function removeBackground(imageData: ImageData, tolerance: number, fillHoles: boolean = true): ImageData {
  const { width, height, data } = imageData;
  
  // Robust Background Detection:
  const bg = getDominantBackgroundColor(data, width, height);
  if (!bg) return imageData; // No non-transparent pixels found
  
  const tol = tolerance * 3;
  fillBackgroundRegions(imageData, bg.r, bg.g, bg.b, tol, fillHoles, HOLE_MIN_AREA);

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
    tolerance: number,
    autoFit: boolean,
    skippedBgRemoval: boolean = false
): Stamp[] {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const boxes: { x: number, y: number, w: number, h: number }[] = [];
  // 濁点・キラキラ・効果線などの小部品を、本体との近さで残せるようにする。
  // ここでは1px程度の孤立ノイズだけを除外し、最終サイズ判定は結合後に行う。
  const MIN_COMPONENT_PX = 2;

  // Iterate to find islands of non-transparent pixels
  // Removed optimization: iterate every pixel to ensure no small details are missed on mobile/high-res
  for (let y = 0; y < height; y++) { 
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 0 && !visited[y * width + x]) {
        const box = findBoundingBox(x, y, width, height, data, visited);
        if (box.w >= MIN_COMPONENT_PX && box.h >= MIN_COMPONENT_PX) {
           boxes.push(box);
        }
      }
    }
  }

  // 近い小部品を本体へ結合してから、独立した小さなゴミを除外する。
  const mergedBoxes = mergeBoxes(boxes, mergeGap).filter(box => box.w > 20 && box.h > 20);

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

    const scale = computeFitScale(box.w, box.h, TARGET_WIDTH, TARGET_HEIGHT, autoFit);

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
      currentTolerance: tolerance,
      skipBgRemoval: skippedBgRemoval || undefined
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

function fillBackgroundRegions(
  imageData: ImageData,
  bgR: number,
  bgG: number,
  bgB: number,
  tol: number,
  fillHoles: boolean,
  holeMinArea: number
): void {
  const { width, height, data } = imageData;
  const total = width * height;
  const isCandidate = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const diff = Math.abs(data[p] - bgR) + Math.abs(data[p + 1] - bgG) + Math.abs(data[p + 2] - bgB);
    if (diff < tol) isCandidate[i] = 1;
  }

  const labels = new Int32Array(total);
  const touchesBorder: boolean[] = [false];
  const areas: number[] = [0];
  const stack: number[] = [];
  let nextLabel = 1;

  for (let start = 0; start < total; start++) {
    if (!isCandidate[start] || labels[start] !== 0) continue;
    const label = nextLabel++;
    touchesBorder.push(false);
    areas.push(0);
    labels[start] = label;
    stack.push(start);

    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      areas[label]++;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) touchesBorder[label] = true;
      if (x > 0) { const n = p - 1; if (isCandidate[n] && labels[n] === 0) { labels[n] = label; stack.push(n); } }
      if (x < width - 1) { const n = p + 1; if (isCandidate[n] && labels[n] === 0) { labels[n] = label; stack.push(n); } }
      if (y > 0) { const n = p - width; if (isCandidate[n] && labels[n] === 0) { labels[n] = label; stack.push(n); } }
      if (y < height - 1) { const n = p + width; if (isCandidate[n] && labels[n] === 0) { labels[n] = label; stack.push(n); } }
    }
  }

  for (let i = 0; i < total; i++) {
    const label = labels[i];
    if (label !== 0 && (touchesBorder[label] || (fillHoles && areas[label] >= holeMinArea))) {
      data[i * 4 + 3] = 0;
    }
  }
}

