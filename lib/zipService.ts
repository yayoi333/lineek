
import JSZip from 'jszip';
import { Stamp, MetaData, ExportConfig, TextObject, ImageLayerObject, DrawingStroke, TARGET_WIDTH, TARGET_HEIGHT, MAIN_WIDTH, MAIN_HEIGHT, TAB_WIDTH, TAB_HEIGHT } from '../types';
import { getSortedLayers } from './layerUtils';

export const createAndDownloadZip = async (
  stamps: Stamp[],
  mainEmojiIds: string[],
  tabConfig: ExportConfig | null,
  metaData: MetaData,
  renumber: boolean
) => {
  const zip = new JSZip();
  
  // 1. Add Stamps
  let counter = 1;
  for (const stamp of stamps) {
    if (stamp.isExcluded) continue;
    
    // Process final image for the stamp
    const config: ExportConfig = {
        id: stamp.id,
        scale: stamp.scale,
        rotation: stamp.rotation,
        offsetX: stamp.offsetX,
        offsetY: stamp.offsetY,
        textObjects: stamp.textObjects,
        // Forward future props
        imageLayers: stamp.imageLayers,
        drawingStrokes: stamp.drawingStrokes,
        mainImageLayerOrder: stamp.mainImageLayerOrder,
        flipH: stamp.flipH,
        flipV: stamp.flipV
    };
    // For regular stamps, we use stamp.dataUrl directly
    const blob = await createFinalImageBlob(stamp.dataUrl, config, TARGET_WIDTH, TARGET_HEIGHT);
    if (!blob) continue;

    const fileName = renumber 
      ? `${String(counter).padStart(3, '0')}.png` 
      : `${stamp.id.replace(/stamp-.*?-/, '')}.png`; // Simplified replace logic
    
    zip.file(fileName, blob);
    counter++;
  }

  // 2. Add Main (2x2 grid of 4 emojis)
  if (mainEmojiIds.length > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = MAIN_WIDTH;
    canvas.height = MAIN_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        for (let i = 0; i < 4; i++) {
            const id = mainEmojiIds[i];
            if (!id) continue;
            const stamp = stamps.find(s => s.id === id);
            if (!stamp) continue;
            
            await new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const row = Math.floor(i / 2);
                    const col = i % 2;
                    const slotW = MAIN_WIDTH / 2;
                    const slotH = MAIN_HEIGHT / 2;
                    
                    // Fit the emoji into the 120x120 slot
                    const scale = Math.min(slotW / TARGET_WIDTH, slotH / TARGET_HEIGHT);
                    const dw = TARGET_WIDTH * scale;
                    const dh = TARGET_HEIGHT * scale;
                    const dx = col * slotW + (slotW - dw) / 2;
                    const dy = row * slotH + (slotH - dh) / 2;

                    ctx.drawImage(img, dx, dy, dw, dh);
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = stamp.dataUrl;
            });
        }
        const mainBlob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
        if (mainBlob) zip.file("main.png", mainBlob);
    }
  }

  // 3. Add Tab
  if (tabConfig) {
    const tabStamp = stamps.find(s => s.id === tabConfig.id);
    if (tabStamp) {
        const sourceUrl = tabConfig.customDataUrl || tabStamp.dataUrl;
        const tabBlob = await createFinalImageBlob(sourceUrl, tabConfig, TAB_WIDTH, TAB_HEIGHT);
        if (tabBlob) zip.file("tab.png", tabBlob);
    }
  }

  // 4. Add Meta.txt
  const dateStr = new Date().toISOString().split('T')[0];
  const txtContent = `AppName: 絵文字切り出しくん
CreatedAt: ${dateStr} (JST)

[Japanese]
Name: ${metaData.stampNameJa}
Description: ${metaData.stampDescJa}

[English]
Name: ${metaData.stampNameEn}
Description: ${metaData.stampDescEn}
`;
  zip.file("meta.txt", txtContent);

  // 5. Add _project.json (full project state for restore)
  const projectData = {
    version: 1,
    stamps: stamps.map(s => ({
      ...s,
      // dataUrl と originalDataUrl はそのまま含める（base64）
    })),
    mainEmojiIds,
    tabConfig,
    metaData,
    savedAt: new Date().toISOString(),
  };
  zip.file("_project.json", JSON.stringify(projectData));

  // Generate and download
  const content = await zip.generateAsync({ type: "blob" });
  
  // Simple download trigger
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  link.download = `emojis_${dateStr}_${timeStr}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Helper for drawing an image layer
const drawImageLayerOnExport = (
    ctx: CanvasRenderingContext2D, 
    layer: ImageLayerObject, 
    img: HTMLImageElement
  ) => {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    const w = layer.originalWidth * layer.scale;
    const h = layer.originalHeight * layer.scale;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1.0;
    ctx.restore();
};

const drawStrokeOnExport = (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
    if (stroke.points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
    };
    
    if (stroke.outlineWidth && stroke.outlineWidth > 0) {
      tracePath();
      ctx.strokeStyle = stroke.outlineColor || '#ffffff';
      ctx.lineWidth = stroke.width + (stroke.outlineWidth * 2);
      ctx.stroke();
    }
    
    tracePath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.stroke();
    
    ctx.globalAlpha = 1.0;
    ctx.restore();
};

export function renderAllLayers(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  config: ExportConfig,
  targetW: number,
  targetH: number,
  layerImages?: Map<string, HTMLImageElement>
): void {
  // Note: We removed ctx.clearRect here to allow the caller to handle background clearing/filling.
  // The caller (createFinalImageBlob or StampPreview) must ensure the canvas is cleared or has a background.

  const textObjects = config.textObjects ?? [];
  const imageLayers = config.imageLayers ?? [];
  const drawingStrokes = config.drawingStrokes ?? [];
  const mainImageOrder = config.mainImageLayerOrder ?? 100;

  const sortedLayers = getSortedLayers(textObjects, imageLayers, drawingStrokes, mainImageOrder);

  const drawnW = img.width * config.scale;
  const drawnH = img.height * config.scale;
  const centerX = targetW / 2;
  const centerY = targetH / 2;

  for (const layer of sortedLayers) {
    if (layer.type === 'mainImage') {
      // スタンプ画像本体を描画
      ctx.save();
      const cx = centerX + config.offsetX;
      const cy = centerY + config.offsetY;
      ctx.translate(cx, cy);
      if (config.rotation) {
        ctx.rotate((config.rotation * Math.PI) / 180);
      }
      if (config.flipH || config.flipV) {
        ctx.scale(config.flipH ? -1 : 1, config.flipV ? -1 : 1);
      }
      ctx.drawImage(img, -drawnW / 2, -drawnH / 2, drawnW, drawnH);
      ctx.restore();

    } else if (layer.type === 'text') {
      const textObj = textObjects.find(t => t.id === layer.id);
      if (textObj) drawTextOnCanvas(ctx, textObj);

    } else if (layer.type === 'imageLayer') {
      const imageLayer = imageLayers.find(l => l.id === layer.id);
      if (imageLayer && layerImages) {
        const lImg = layerImages.get(imageLayer.id);
        if (lImg) drawImageLayerOnExport(ctx, imageLayer, lImg);
      }

    } else if (layer.type === 'drawing') {
      const stroke = drawingStrokes.find(s => s.id === layer.id);
      if (stroke) drawStrokeOnExport(ctx, stroke);
    }
  }
}

// Helper: Takes image URL + config and renders it into the final PNG blob
export async function createFinalImageBlob(
    imageUrl: string,
    config: ExportConfig,
    targetW: number, 
    targetH: number
): Promise<Blob | null> {
  // Preload all layer images
  const layerImages = new Map<string, HTMLImageElement>();
  if (config.imageLayers) {
    await Promise.all(config.imageLayers.map(layer => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { layerImages.set(layer.id, img); resolve(); };
        img.onerror = () => resolve(); // Ignore errors to prevent block
        img.src = layer.dataUrl;
      });
    }));
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(null);

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, targetW, targetH); // Clear canvas for transparency before rendering
      renderAllLayers(ctx, img, config, targetW, targetH, layerImages);
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    };
    img.src = imageUrl; 
  });
}

// Helper to draw text (Shared logic logic for Canvas rendering)
export function drawTextOnCanvas(ctx: CanvasRenderingContext2D, textObj: TextObject) {
    if (!textObj.text) return;

    ctx.save();
    // Move to text origin
    ctx.translate(textObj.x, textObj.y);
    // Apply rotation
    ctx.rotate((textObj.rotation * Math.PI) / 180);

    ctx.font = `bold ${textObj.fontSize}px '${textObj.fontFamily}'`;
    ctx.textBaseline = 'middle'; // Center vertical alignment helps with rotation/curve
    ctx.textAlign = 'center';    // Draw from center
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const lines = textObj.text.split('\n');
    const lineHeight = textObj.fontSize * 1.2;
    
    // Calculate total height to center vertically block
    const totalHeight = lineHeight * lines.length;
    const startY = -(totalHeight / 2) + (lineHeight / 2);

    lines.forEach((line, lineIndex) => {
        const lineY = startY + (lineIndex * lineHeight);

        // Curvature Logic (Only for Horizontal)
        // curvature: -100 (up) to 100 (down). 0 is straight.
        if (textObj.curvature !== 0 && !textObj.isVertical) {
            const radius = 10000 / textObj.curvature; // approximates radius
            const anglePerPixel = 1 / radius;
            
            // Measure total width to center it on the arc
            const totalWidth = ctx.measureText(line).width;
            let currentArcPos = -totalWidth / 2;

            for (const char of line) {
                const charWidth = ctx.measureText(char).width;
                const charMiddle = currentArcPos + charWidth / 2;
                
                // Calculate angle for this character
                // +90 deg offset because 0 deg is usually 3 o'clock, we want 12 o'clock or 6 o'clock reference
                const angle = charMiddle * anglePerPixel;

                ctx.save();
                
                // Translate to the curve center point (which is far below or above)
                // y axis is inverted in canvas (down is positive)
                // If curvature > 0 (downward curve), center is at (0, radius) relative to text line
                // If curvature < 0 (upward curve), center is at (0, radius) (radius is negative)
                
                // Position for this specific line
                ctx.translate(0, lineY + radius); 
                ctx.rotate(angle);
                ctx.translate(0, -radius);

                // Outline
                if (textObj.outlineWidth > 0) {
                    ctx.strokeStyle = textObj.outlineColor;
                    ctx.lineWidth = textObj.outlineWidth;
                    ctx.strokeText(char, 0, 0);
                }
                // Fill
                ctx.fillStyle = textObj.color;
                ctx.fillText(char, 0, 0);

                ctx.restore();
                currentArcPos += charWidth;
            }

        } else if (textObj.isVertical) {
            // Vertical Text (Simple column)
            // Vertical text doesn't support curvature in this implementation for simplicity
            let currentX = 0; // Centered
            // We need to calculate width of this line to center the block? 
            // Simplified: Vertical text is usually single line or just drawn top-down
            // For multiline vertical, we spread them on X
            // Let's assume lines go Right to Left for Vertical
            const verticalSpacing = textObj.fontSize * 1.2;
            const lineX = (lines.length - 1) * verticalSpacing / 2 - (lineIndex * verticalSpacing);

            let charY = -(line.length * textObj.fontSize) / 2 + (textObj.fontSize / 2);
            
            for (const char of line) {
                let drawChar = char;
                let rotate = 0;
                let offsetX = 0;
                let offsetY = 0;

                if (['ー', '-', '～'].includes(char)) {
                     rotate = 90;
                     // Adjustments for centered rotation
                }
                if (['、', '。'].includes(char)) {
                    offsetX = textObj.fontSize * 0.4;
                    offsetY = -textObj.fontSize * 0.4;
                }

                ctx.save();
                ctx.translate(lineX + offsetX, charY + offsetY);
                if (rotate) ctx.rotate(rotate * Math.PI / 180);

                if (textObj.outlineWidth > 0) {
                     ctx.strokeStyle = textObj.outlineColor;
                     ctx.lineWidth = textObj.outlineWidth;
                     ctx.strokeText(drawChar, 0, 0);
                 }
                 ctx.fillStyle = textObj.color;
                 ctx.fillText(drawChar, 0, 0);
                 ctx.restore();

                 charY += textObj.fontSize;
            }

        } else {
            // Standard Horizontal
            if (textObj.outlineWidth > 0) {
                ctx.strokeStyle = textObj.outlineColor;
                ctx.lineWidth = textObj.outlineWidth;
                ctx.strokeText(line, 0, lineY);
            }
            ctx.fillStyle = textObj.color;
            ctx.fillText(line, 0, lineY);
        }
    });

    ctx.restore();
}

// ZIPファイルからプロジェクトデータを読み込む
export async function loadProjectFromZip(file: File): Promise<{
  stamps: Stamp[];
  mainEmojiIds: string[];
  tabConfig: ExportConfig | null;
  metaData: MetaData;
} | null> {
  const zip = await JSZip.loadAsync(file);
  
  const projectFile = zip.file("_project.json");
  
  // --- _project.json がある場合: フルリストア ---
  if (projectFile) {
    const jsonText = await projectFile.async("text");
    const projectData = JSON.parse(jsonText);
    
    const restoredStamps: Stamp[] = (projectData.stamps || []).map((s: any, idx: number) => ({
      ...s,
      isExcluded: s.isExcluded ?? false,
      flipH: s.flipH ?? false,
      flipV: s.flipV ?? false,
      rotation: s.rotation ?? 0,
      scale: s.scale ?? 1,
      offsetX: s.offsetX ?? 0,
      offsetY: s.offsetY ?? 0,
      textObjects: (s.textObjects ?? []).map((t: any, i: number) => ({
        ...t,
        layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 10 + i : 150 + i),
        outlineColor: t.outlineColor ?? '#ffffff',
        outlineWidth: t.outlineWidth ?? 4,
      })),
      imageLayers: (s.imageLayers ?? []).map((l: any, i: number) => ({
        ...l,
        layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 30 + i : 170 + i),
      })),
      drawingStrokes: (s.drawingStrokes ?? []).map((d: any, i: number) => ({
        ...d,
        layerOrder: d.layerOrder ?? (d.zIndex === 'back' ? 20 + i : 160 + i),
        outlineColor: d.outlineColor ?? '#ffffff',
        outlineWidth: d.outlineWidth ?? 0,
      })),
      currentTolerance: s.currentTolerance ?? 50,
      mainImageLayerOrder: s.mainImageLayerOrder ?? 100,
    }));

    const sanitizeConfig = (config: any): ExportConfig | null => {
      if (!config) return null;
      return {
        ...config,
        rotation: config.rotation ?? 0,
        flipH: config.flipH ?? false,
        flipV: config.flipV ?? false,
        textObjects: (config.textObjects ?? []).map((t: any, i: number) => ({
          ...t,
          layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 10 + i : 150 + i),
          outlineColor: t.outlineColor ?? '#ffffff',
          outlineWidth: t.outlineWidth ?? 4,
        })),
        imageLayers: (config.imageLayers ?? []).map((l: any, i: number) => ({
          ...l,
          layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 30 + i : 170 + i),
        })),
        drawingStrokes: (config.drawingStrokes ?? []).map((d: any, i: number) => ({
          ...d,
          layerOrder: d.layerOrder ?? (d.zIndex === 'back' ? 20 + i : 160 + i),
          outlineColor: d.outlineColor ?? '#ffffff',
          outlineWidth: d.outlineWidth ?? 0,
        })),
        mainImageLayerOrder: config.mainImageLayerOrder ?? 100,
      };
    };

    return {
      stamps: restoredStamps,
      mainEmojiIds: projectData.mainEmojiIds || [],
      tabConfig: sanitizeConfig(projectData.tabConfig),
      metaData: projectData.metaData || {
        stampNameJa: '',
        stampDescJa: '',
        stampNameEn: '',
        stampDescEn: '',
      },
    };
  }
  
  // --- _project.json がない場合: PNGファイルからスタンプを生成 ---
  
  // PNG ファイルを収集（main.png, tab.png は別扱い）
  const pngFiles: { name: string; file: JSZip.JSZipObject }[] = [];
  let mainPng: JSZip.JSZipObject | null = null;
  let tabPng: JSZip.JSZipObject | null = null;
  let metaTxt: JSZip.JSZipObject | null = null;
  
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const name = relativePath.split('/').pop() || '';
    if (!name.endsWith('.png')) {
      if (name === 'meta.txt') metaTxt = zipEntry;
      return;
    }
    if (name === 'main.png') {
      mainPng = zipEntry;
    } else if (name === 'tab.png') {
      tabPng = zipEntry;
    } else {
      pngFiles.push({ name, file: zipEntry });
    }
  });
  
  // PNGがなければ復元不可
  if (pngFiles.length === 0) return null;
  
  // ファイル名で番号順にソート（001.png, 002.png, ... の順）
  pngFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  
  // 各PNGをスタンプに変換
  const stamps: Stamp[] = [];
  for (let i = 0; i < pngFiles.length; i++) {
    const pngData = await pngFiles[i].file.async("base64");
    const dataUrl = `data:image/png;base64,${pngData}`;
    
    // 画像サイズを取得
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve({ w: TARGET_WIDTH, h: TARGET_HEIGHT });
      img.src = dataUrl;
    });
    
    // スタンプの scale を計算（370x320 にフィットするように）
    const fitScale = Math.min(TARGET_WIDTH / dims.w, TARGET_HEIGHT / dims.h, 1);
    
    stamps.push({
      id: `stamp-zip-${Date.now()}-${i}`,
      sourceImageId: 'zip-import',
      originalX: 0,
      originalY: 0,
      width: dims.w,
      height: dims.h,
      dataUrl: dataUrl,
      isExcluded: false,
      scale: fitScale,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      currentTolerance: 50,
      textObjects: [],
      imageLayers: [],
      drawingStrokes: [],
      mainImageLayerOrder: 100,
      flipH: false,
      flipV: false,
    });
  }
  
  // main/tab の設定
  let mainEmojiIds: string[] = [];
  let tabConfig: ExportConfig | null = null;
  
  if (stamps.length > 0) {
    mainEmojiIds = [stamps[0].id];
    const mainStamp = stamps[0];
    tabConfig = {
      id: mainStamp.id,
      scale: Math.min(TAB_WIDTH / mainStamp.width, TAB_HEIGHT / mainStamp.height, 1),
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      flipH: false,
      flipV: false,
      textObjects: [],
      imageLayers: [],
      drawingStrokes: [],
      mainImageLayerOrder: 100,
    };
  }
  
  // meta.txt からメタデータを復元
  let metaData: MetaData = {
    stampNameJa: '',
    stampDescJa: '',
    stampNameEn: '',
    stampDescEn: '',
  };
  
  if (metaTxt) {
    try {
      const metaContent = await (metaTxt as JSZip.JSZipObject).async("text");
      const nameJaMatch = metaContent.match(/\[Japanese\]\s*\n\s*Name:\s*(.+)/);
      const descJaMatch = metaContent.match(/\[Japanese\]\s*\n\s*Name:.*\n\s*Description:\s*(.+)/);
      const nameEnMatch = metaContent.match(/\[English\]\s*\n\s*Name:\s*(.+)/);
      const descEnMatch = metaContent.match(/\[English\]\s*\n\s*Name:.*\n\s*Description:\s*(.+)/);
      if (nameJaMatch) metaData.stampNameJa = nameJaMatch[1].trim();
      if (descJaMatch) metaData.stampDescJa = descJaMatch[1].trim();
      if (nameEnMatch) metaData.stampNameEn = nameEnMatch[1].trim();
      if (descEnMatch) metaData.stampDescEn = descEnMatch[1].trim();
    } catch (e) {
      // meta.txt のパースに失敗しても続行
    }
  }
  
  return {
    stamps,
    mainEmojiIds,
    tabConfig,
    metaData,
  };
}
