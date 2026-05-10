
import { TextObject, ImageLayerObject, DrawingStroke } from '../types';

// 全レイヤーのlayerOrderを取得する型
export interface LayerItem {
  type: 'text' | 'imageLayer' | 'drawing' | 'mainImage';
  id: string;
  layerOrder: number;
}

// 既存データにlayerOrderが無い場合にデフォルト値を付与
export function ensureLayerOrder(
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[],
  mainImageOrder?: number
): {
  textObjects: TextObject[];
  imageLayers: ImageLayerObject[];
  drawingStrokes: DrawingStroke[];
  mainImageLayerOrder: number;
} {
  const mainOrder = mainImageOrder ?? 100;
  let backCounter = 10;
  let frontCounter = 110;

  const assignOrder = <T extends { zIndex: 'front' | 'back'; layerOrder?: number }>(
    items: T[]
  ): T[] => {
    return items.map(item => {
      if (item.layerOrder !== undefined && item.layerOrder !== null) {
        return item;
      }
      if (item.zIndex === 'back') {
        return { ...item, layerOrder: backCounter++ };
      } else {
        return { ...item, layerOrder: frontCounter++ };
      }
    });
  };

  return {
    textObjects: assignOrder(textObjects),
    imageLayers: assignOrder(imageLayers),
    drawingStrokes: assignOrder(drawingStrokes),
    mainImageLayerOrder: mainOrder,
  };
}

// 全レイヤーをlayerOrder順にソートしたリストを返す
export function getSortedLayers(
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[],
  mainImageOrder: number
): LayerItem[] {
  const items: LayerItem[] = [];

  textObjects.forEach(t => {
    items.push({ type: 'text', id: t.id, layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 50 : 150) });
  });

  imageLayers.forEach(l => {
    items.push({ type: 'imageLayer', id: l.id, layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 50 : 150) });
  });

  drawingStrokes.forEach(s => {
    items.push({ type: 'drawing', id: s.id, layerOrder: s.layerOrder ?? (s.zIndex === 'back' ? 50 : 150) });
  });

  items.push({ type: 'mainImage', id: 'main', layerOrder: mainImageOrder });

  items.sort((a, b) => a.layerOrder - b.layerOrder);

  return items;
}

// 次のlayerOrderを取得（新規レイヤー作成用）
export function getNextLayerOrder(
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[],
  mainImageOrder: number,
  position: 'front' | 'back'
): number {
  const all = getSortedLayers(textObjects, imageLayers, drawingStrokes, mainImageOrder);
  
  if (position === 'back') {
    // スタンプ画像より下で、最も大きいlayerOrder + 1
    const backItems = all.filter(a => a.layerOrder < mainImageOrder && a.type !== 'mainImage');
    if (backItems.length === 0) return mainImageOrder - 1;
    return Math.max(...backItems.map(a => a.layerOrder)) + 1;
  } else {
    // スタンプ画像より上で、最も大きいlayerOrder + 1
    const frontItems = all.filter(a => a.layerOrder > mainImageOrder && a.type !== 'mainImage');
    if (frontItems.length === 0) return mainImageOrder + 1;
    return Math.max(...frontItems.map(a => a.layerOrder)) + 1;
  }
}

// レイヤーを1つ上（前面方向）に移動
export function moveLayerUp(
  targetType: 'text' | 'imageLayer' | 'drawing' | 'mainImage',
  targetId: string,
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[],
  mainImageOrder: number
): { textObjects: TextObject[]; imageLayers: ImageLayerObject[]; drawingStrokes: DrawingStroke[]; mainImageLayerOrder: number } {
  const sorted = getSortedLayers(textObjects, imageLayers, drawingStrokes, mainImageOrder);
  const currentIndex = sorted.findIndex(l => l.type === targetType && l.id === targetId);
  if (currentIndex === -1 || currentIndex === sorted.length - 1) {
    return { textObjects, imageLayers, drawingStrokes, mainImageLayerOrder: mainImageOrder };
  }

  // 1つ上のレイヤーと layerOrder を交換
  const current = sorted[currentIndex];
  const above = sorted[currentIndex + 1];

  return applySwap(current, above, textObjects, imageLayers, drawingStrokes, mainImageOrder);
}

// レイヤーを1つ下（背面方向）に移動
export function moveLayerDown(
  targetType: 'text' | 'imageLayer' | 'drawing' | 'mainImage',
  targetId: string,
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[],
  mainImageOrder: number
): { textObjects: TextObject[]; imageLayers: ImageLayerObject[]; drawingStrokes: DrawingStroke[]; mainImageLayerOrder: number } {
  const sorted = getSortedLayers(textObjects, imageLayers, drawingStrokes, mainImageOrder);
  const currentIndex = sorted.findIndex(l => l.type === targetType && l.id === targetId);
  if (currentIndex === -1 || currentIndex === 0) {
    return { textObjects, imageLayers, drawingStrokes, mainImageLayerOrder: mainImageOrder };
  }

  const current = sorted[currentIndex];
  const below = sorted[currentIndex - 1];

  return applySwap(current, below, textObjects, imageLayers, drawingStrokes, mainImageOrder);
}

// 2つのレイヤーの layerOrder を交換する内部関数
function applySwap(
  a: LayerItem,
  b: LayerItem,
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[],
  mainImageOrder: number
): { textObjects: TextObject[]; imageLayers: ImageLayerObject[]; drawingStrokes: DrawingStroke[]; mainImageLayerOrder: number } {
  const orderA = a.layerOrder;
  const orderB = b.layerOrder;

  let newTexts = [...textObjects];
  let newImages = [...imageLayers];
  let newStrokes = [...drawingStrokes];
  let newMainOrder = mainImageOrder;

  const setOrder = (item: LayerItem, newOrder: number) => {
    if (item.type === 'text') {
      newTexts = newTexts.map(t => t.id === item.id ? { ...t, layerOrder: newOrder } : t);
    } else if (item.type === 'imageLayer') {
      newImages = newImages.map(l => l.id === item.id ? { ...l, layerOrder: newOrder } : l);
    } else if (item.type === 'drawing') {
      newStrokes = newStrokes.map(s => s.id === item.id ? { ...s, layerOrder: newOrder } : s);
    } else if (item.type === 'mainImage') {
      newMainOrder = newOrder;
    }
  };

  setOrder(a, orderB);
  setOrder(b, orderA);

  return {
    textObjects: newTexts,
    imageLayers: newImages,
    drawingStrokes: newStrokes,
    mainImageLayerOrder: newMainOrder,
  };
}

// レイヤーの表示名を取得
export function getLayerDisplayName(
  item: LayerItem,
  textObjects: TextObject[],
  imageLayers: ImageLayerObject[],
  drawingStrokes: DrawingStroke[]
): string {
  if (item.type === 'mainImage') return 'スタンプ画像';
  
  if (item.type === 'text') {
    const index = textObjects.findIndex(x => x.id === item.id);
    const t = textObjects[index];
    const num = index !== -1 ? index + 1 : '';
    const content = t ? `「${t.text.substring(0, 6)}${t.text.length > 6 ? '…' : ''}」` : '';
    return t && t.text ? `文字 ${num} ${content}` : `文字 ${num}`;
  }
  
  if (item.type === 'imageLayer') {
    const index = imageLayers.findIndex(l => l.id === item.id);
    return index !== -1 ? `画像レイヤー ${index + 1}` : '画像レイヤー';
  }
  
  if (item.type === 'drawing') {
    const index = drawingStrokes.findIndex(s => s.id === item.id);
    return index !== -1 ? `手書き ${index + 1}` : '手書き';
  }
  
  return '不明';
}
