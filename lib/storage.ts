
import { Stamp, SourceImage, ExportConfig, MetaData } from '../types';

// 保存するプロジェクトデータの型
export interface ProjectData {
  version: number;
  savedAt: string;
  stamps: Stamp[];
  sourceImages: SourceImageData[];
  mainEmojiIds?: string[];
  tabConfig: ExportConfig | null;
  meta: MetaData;
  globalTolerance: number;
  gapTolerance: number;
  previewBg: string;
}

interface SourceImageData {
  id: string;
  url: string; // base64 DataURL
  blob: Blob;  // File object (stored as Blob in IDB)
  fileName: string;
  fileType: string;
  width: number;
  height: number;
}

// 素材の型
export interface MaterialItem {
  id: string;
  dataUrl: string;       // base64
  width: number;
  height: number;
  name: string;          // ファイル名
  createdAt: string;     // ISO文字列
}

const DB_NAME = 'stamp-cutter-db';
const DB_VERSION = 2; // Increment version for schema update
const STORE_NAME = 'projects';
const PROJECT_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      // 素材ライブラリ用ストア
      if (!db.objectStoreNames.contains('materials')) {
        db.createObjectStore('materials', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, type: string): Blob {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type });
}

export async function saveProject(
  stamps: Stamp[],
  sourceImages: SourceImage[],
  mainEmojiIds: string[],
  tabConfig: ExportConfig | null,
  meta: MetaData,
  globalTolerance: number,
  gapTolerance: number,
  previewBg: string
): Promise<void> {
  try {
    const sourceImageData: SourceImageData[] = await Promise.all(
      sourceImages.map(async (src) => ({
        id: src.id,
        url: await fileToBase64(src.file),
        blob: src.file,
        fileName: src.file.name,
        fileType: src.file.type,
        width: src.width,
        height: src.height,
      }))
    );

    // Sanitize stamps to ensure all properties are saved even if undefined
    const sanitizedStamps = stamps.map((s, idx) => ({
      ...s,
      isExcluded: s.isExcluded ?? false,
      flipH: s.flipH ?? false,
      flipV: s.flipV ?? false,
      rotation: s.rotation ?? 0,
      textObjects: (s.textObjects ?? []).map((t, i) => ({
        ...t,
        layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 10 + i : 150 + i),
        outlineColor: t.outlineColor ?? '#ffffff',
        outlineWidth: t.outlineWidth ?? 0,
      })),
      imageLayers: (s.imageLayers ?? []).map((l, i) => ({
        ...l,
        layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 30 + i : 170 + i),
      })),
      drawingStrokes: (s.drawingStrokes ?? []).map((d, i) => ({
        ...d,
        layerOrder: d.layerOrder ?? (d.zIndex === 'back' ? 20 + i : 160 + i),
        outlineColor: d.outlineColor ?? '#ffffff',
        outlineWidth: d.outlineWidth ?? 0,
      })),
      currentTolerance: s.currentTolerance ?? 50,
      mainImageLayerOrder: s.mainImageLayerOrder ?? 100,
    }));

    const sanitizeConfig = (config: ExportConfig | null): ExportConfig | null => {
      if (!config) return null;
      return {
        ...config,
        rotation: config.rotation ?? 0,
        textObjects: (config.textObjects ?? []).map((t, i) => ({
            ...t,
            layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 10 + i : 150 + i),
            outlineColor: t.outlineColor ?? '#ffffff',
            outlineWidth: t.outlineWidth ?? 0,
        })),
        imageLayers: (config.imageLayers ?? []).map((l, i) => ({
            ...l,
            layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 30 + i : 170 + i),
        })),
        drawingStrokes: (config.drawingStrokes ?? []).map((d, i) => ({
            ...d,
            layerOrder: d.layerOrder ?? (d.zIndex === 'back' ? 20 + i : 160 + i),
            outlineColor: d.outlineColor ?? '#ffffff',
            outlineWidth: d.outlineWidth ?? 0,
        })),
        mainImageLayerOrder: config.mainImageLayerOrder ?? 100,
        flipH: config.flipH ?? false,
        flipV: config.flipV ?? false,
      };
    };

    const data: ProjectData = {
      version: 1,
      savedAt: new Date().toISOString(),
      stamps: sanitizedStamps,
      sourceImages: sourceImageData,
      mainEmojiIds,
      tabConfig: sanitizeConfig(tabConfig),
      meta,
      globalTolerance,
      gapTolerance,
      previewBg,
    };

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, PROJECT_KEY);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('プロジェクト保存に失敗:', err);
  }
}

export async function loadProject(): Promise<ProjectData | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(PROJECT_KEY);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('プロジェクト読み込みに失敗:', err);
    return null;
  }
}

export async function deleteProject(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(PROJECT_KEY);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('プロジェクト削除に失敗:', err);
  }
}

export function restoreSourceImages(data: SourceImageData[]): SourceImage[] {
  return data.map(d => {
    // We try to use the blob from IDB if we were to change implementation, 
    // but sticking to base64 reconstruction as per instruction logic.
    const blob = base64ToBlob(d.url, d.fileType);
    const file = new File([blob], d.fileName, { type: d.fileType });
    return {
      id: d.id,
      url: URL.createObjectURL(file),
      file,
      width: d.width,
      height: d.height,
    };
  });
}

export async function hasExistingProject(): Promise<boolean> {
  const data = await loadProject();
  return data !== null;
}

// --- Material Library Functions ---

export async function saveMaterial(item: MaterialItem): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('materials', 'readwrite');
  tx.objectStore('materials').put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadMaterials(): Promise<MaterialItem[]> {
  try {
    const db = await openDB();
    // Check if store exists (for safety during upgrade)
    if (!db.objectStoreNames.contains('materials')) {
        db.close();
        return [];
    }
    const tx = db.transaction('materials', 'readonly');
    const request = tx.objectStore('materials').getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => { db.close(); resolve(request.result || []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (e) {
      console.warn("Failed to load materials", e);
      return [];
  }
}

export async function deleteMaterial(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('materials', 'readwrite');
      const store = tx.objectStore('materials');
      const request = store.delete(id);
      
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        console.error('delete transaction error:', tx.error);
        db.close();
        reject(tx.error);
      };
    } catch (err) {
      console.error('delete try/catch error:', err);
      db.close();
      reject(err);
    }
  });
}
