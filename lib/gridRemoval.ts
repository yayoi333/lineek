
export async function removeGridLines(
  file: File,
  options?: {
    lineThreshold?: number;    // この太さ以下を線とみなす（デフォルト4px）
    colorThreshold?: number;   // この明度以上を薄い線とみなす（デフォルト160）
    minLineLength?: number;    // この長さ以上を直線とみなす（画像幅/高さの割合、デフォルト0.3 = 30%）
  }
): Promise<File> {
  const lineThickness = options?.lineThreshold ?? 4;
  const colorThresh = options?.colorThreshold ?? 160;
  const minLinePct = options?.minLineLength ?? 0.3;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;

      const minHLineLen = Math.floor(w * minLinePct);
      const minVLineLen = Math.floor(h * minLinePct);

      // ピクセルが「線っぽい色」かどうか（薄いグレー〜中程度のグレー）
      const isLineColor = (x: number, y: number): boolean => {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a < 128) return false; // 透明は無視
        const brightness = (r + g + b) / 3;
        // 薄いグレー（明るめ）の線を検出
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC - minC;
        return brightness >= colorThresh && saturation < 50;
      };

      // ピクセルを白にする
      const setWhite = (x: number, y: number) => {
        const idx = (y * w + x) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      };

      // --- 横線検出 ---
      for (let y = 0; y < h; y++) {
        let consecutiveLinePixels = 0;
        let lineStartX = 0;
        const lineSegments: { start: number; end: number }[] = [];

        for (let x = 0; x < w; x++) {
          if (isLineColor(x, y)) {
            if (consecutiveLinePixels === 0) lineStartX = x;
            consecutiveLinePixels++;
          } else {
            if (consecutiveLinePixels >= minHLineLen) {
              lineSegments.push({ start: lineStartX, end: x - 1 });
            }
            consecutiveLinePixels = 0;
          }
        }
        if (consecutiveLinePixels >= minHLineLen) {
          lineSegments.push({ start: lineStartX, end: w - 1 });
        }

        // 検出された横線セグメントを白にする
        for (const seg of lineSegments) {
          // この行と前後 lineThickness/2 行も含めて白にする
          for (let dy = -Math.floor(lineThickness / 2); dy <= Math.floor(lineThickness / 2); dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            for (let x = seg.start; x <= seg.end; x++) {
              // 線の色のピクセルだけ白にする（キャラの上を消さないように）
              if (isLineColor(x, ny)) {
                setWhite(x, ny);
              }
            }
          }
        }
      }

      // --- 縦線検出 ---
      for (let x = 0; x < w; x++) {
        let consecutiveLinePixels = 0;
        let lineStartY = 0;
        const lineSegments: { start: number; end: number }[] = [];

        for (let y = 0; y < h; y++) {
          if (isLineColor(x, y)) {
            if (consecutiveLinePixels === 0) lineStartY = y;
            consecutiveLinePixels++;
          } else {
            if (consecutiveLinePixels >= minVLineLen) {
              lineSegments.push({ start: lineStartY, end: y - 1 });
            }
            consecutiveLinePixels = 0;
          }
        }
        if (consecutiveLinePixels >= minVLineLen) {
          lineSegments.push({ start: lineStartY, end: h - 1 });
        }

        for (const seg of lineSegments) {
          for (let dx = -Math.floor(lineThickness / 2); dx <= Math.floor(lineThickness / 2); dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            for (let y = seg.start; y <= seg.end; y++) {
              if (isLineColor(nx, y)) {
                setWhite(nx, y);
              }
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Blob conversion failed'));
        const newFile = new File([blob], file.name, { type: 'image/png' });
        resolve(newFile);
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export async function detectGridLines(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        URL.revokeObjectURL(url);
        return resolve(false);
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const { data, width, height } = imageData;
      URL.revokeObjectURL(url);

      // グリッド線の色判定ロジック
      const isGridColor = (idx: number): boolean => {
        const r = data[idx];
        const g = data[idx+1];
        const b = data[idx+2];
        const a = data[idx+3];
        
        if (a < 128) return false;
        
        // 彩度が低い（グレー）かつ、ある程度明るい（真っ黒ではない）
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC - minC;
        const brightness = (r + g + b) / 3;
        
        // 許容範囲を少し広げる: 
        // Saturation < 30 (より厳密なグレー)
        // Brightness 80 ~ 250 (かなり暗いグレーから白近くまで)
        return saturation < 30 && brightness > 80 && brightness <= 250;
      };

      // 指定した行(Y)が「線っぽい」か判定する
      // criteria: 行全体のピクセルのうち、threshold以上の割合がGridColorであること
      const isLineRow = (y: number, threshold = 0.4): boolean => {
        if (y < 0 || y >= height) return false;
        let count = 0;
        // 高速化のため4ピクセルごとにサンプリング
        const step = 4; 
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          if (isGridColor(idx)) count++;
        }
        return (count * step) > (width * threshold);
      };

      // 指定した列(X)が「線っぽい」か判定する
      const isLineCol = (x: number, threshold = 0.4): boolean => {
        if (x < 0 || x >= width) return false;
        let count = 0;
        const step = 4;
        for (let y = 0; y < height; y += step) {
          const idx = (y * width + x) * 4;
          if (isGridColor(idx)) count++;
        }
        return (count * step) > (height * threshold);
      };

      let detectedH = 0;
      let detectedV = 0;
      
      // 画像の端（10%）は除外してスキャン
      const marginY = Math.floor(height * 0.1);
      const marginX = Math.floor(width * 0.1);
      
      // チェックする間隔（細い線を見逃さない程度）
      const scanStep = 2; 
      // 線の太さとみなしてスキップする量
      const skipLine = 8; 
      // 線の「孤立性」を確認するための距離
      const neighborDist = 6;

      // --- 水平線の検出 ---
      for (let y = marginY; y < height - marginY; y += scanStep) {
        // 1. その行が「線」の特徴を持っているか（密度チェック：キャラで途切れていても検出可能に）
        if (isLineRow(y, 0.4)) {
          // 2. 「孤立しているか」チェック（誤検知防止：ベタ塗りのグレー背景を除外）
          // 上下の離れた行が「線ではない」なら、これは細い線である可能性が高い
          const isTopSolid = isLineRow(y - neighborDist, 0.2); // 閾値を下げて厳しくチェック
          const isBottomSolid = isLineRow(y + neighborDist, 0.2);

          if (!isTopSolid && !isBottomSolid) {
            detectedH++;
            y += skipLine; // 線一本分スキップ
          }
        }
      }

      // --- 垂直線の検出 ---
      for (let x = marginX; x < width - marginX; x += scanStep) {
        if (isLineCol(x, 0.4)) {
          const isLeftSolid = isLineCol(x - neighborDist, 0.2);
          const isRightSolid = isLineCol(x + neighborDist, 0.2);

          if (!isLeftSolid && !isRightSolid) {
            detectedV++;
            x += skipLine;
          }
        }
      }

      // 合計で2本以上の線が見つかれば「グリッドあり」とみなす
      // (水平1本＋垂直1本、または水平2本など)
      resolve(detectedH + detectedV >= 2);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}
