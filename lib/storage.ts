
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

// 旧DB名 'stamp-cutter-db' はスタンプ切り出しくんと同一オリジン（yayoi333.github.io）で
// 共有されており、互いのプロジェクト保存を上書きし合う問題があったため、専用のDB名に分離した。
const DB_NAME = 'emoji-cutter-db';
const LEGACY_DB_NAME = 'stamp-cutter-db'; // 旧: スタンプ切り出しくんと共有していたDB名
const DB_VERSION = 2; // Increment version for schema update
const STORE_NAME = 'projects';
const PROJECT_KEY = 'current';
const DB_MIGRATED_FLAG = 'ek_db_migrated';

function openDBRaw(name: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
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

// 初回起動時に一度だけ、旧DBに残っている絵文字くんのデータを新DBへ移す。
// 絵文字くんのプロジェクトは mainEmojiIds（配列）を持つことで判別できるため、
// スタンプ切り出しくんのデータ（mainConfig を持つ）は移動も削除もしない。
let migrationPromise: Promise<void> | null = null;

function migrateFromLegacyDB(): Promise<void> {
  if (!migrationPromise) migrationPromise = runLegacyMigration();
  return migrationPromise;
}

async function runLegacyMigration(): Promise<void> {
  try {
    if (localStorage.getItem(DB_MIGRATED_FLAG) === 'true') return;
    const legacyDb = await openDBRaw(LEGACY_DB_NAME);

    // プロジェクト: 絵文字くんのデータ（mainEmojiIds あり）だけ移動し、旧DBからは削除する
    const legacyData: any = await new Promise((resolve, reject) => {
      const tx = legacyDb.transaction(STORE_NAME, 'readonly');
      const rq = tx.objectStore(STORE_NAME).get(PROJECT_KEY);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    if (legacyData && Array.isArray(legacyData.mainEmojiIds)) {
      const newDb = await openDBRaw();
      await new Promise<void>((resolve, reject) => {
        const tx = newDb.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(legacyData, PROJECT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      newDb.close();
      await new Promise<void>((resolve, reject) => {
        const tx = legacyDb.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(PROJECT_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // 素材: どちらのアプリで保存したものか判別できないため、コピーして旧DB側にも残す
    if (legacyDb.objectStoreNames.contains('materials')) {
      const materials: any[] = await new Promise((resolve, reject) => {
        const tx = legacyDb.transaction('materials', 'readonly');
        const rq = tx.objectStore('materials').getAll();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => reject(rq.error);
      });
      if (materials.length > 0) {
        const newDb = await openDBRaw();
        await new Promise<void>((resolve, reject) => {
          const tx = newDb.transaction('materials', 'readwrite');
          const store = tx.objectStore('materials');
          materials.forEach(m => store.put(m));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        newDb.close();
      }
    }

    legacyDb.close();
    localStorage.setItem(DB_MIGRATED_FLAG, 'true');
  } catch (err) {
    // 移行に失敗しても新DBで動作は続行できる（フラグ未設定のため次回起動時に再試行される）
    console.warn('旧DBからの移行に失敗:', err);
  }
}

async function openDB(): Promise<IDBDatabase> {
  await migrateFromLegacyDB();
  return openDBRaw();
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

// --- API Key Encrypted Storage ---
// 注意: これは APIキーを localStorage に平文のまま置かないための「簡易的な保護（難読化）」です。
// 復号に必要な鍵も同じ端末の localStorage に保存されるため、この端末・ブラウザを直接操作できる相手や、
// XSS で任意コードを実行された場合には保護になりません。
// 根本対策は、外部CDN依存の同梱化（バンドル）・SRI・CSP などで XSS 自体を防ぐことです。

const API_KEY_ENC_STORAGE = 'gemini_api_key_enc';   // 暗号化済みキー（JSON: iv + data）
const API_KEY_LEGACY_STORAGE = 'gemini_api_key';    // 旧形式（平文）。読み込み時に移行して削除する
const API_KEY_CRYPTO_STORAGE = 'gemini_api_key_k';  // AES-GCM 用の鍵素材

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getApiKeyCryptoKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(API_KEY_CRYPTO_STORAGE);
  let bytes: Uint8Array;
  if (stored) {
    bytes = base64ToBytes(stored);
  } else {
    bytes = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(API_KEY_CRYPTO_STORAGE, bytesToBase64(bytes));
  }
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function saveApiKey(plainKey: string): Promise<void> {
  const key = await getApiKeyCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainKey)
  );
  const payload = {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
  localStorage.setItem(API_KEY_ENC_STORAGE, JSON.stringify(payload));
  // 平文のキーを残さない
  localStorage.removeItem(API_KEY_LEGACY_STORAGE);
}

export async function loadApiKey(): Promise<string | null> {
  try {
    // 旧形式（平文）が残っていれば暗号化形式へ移行する
    const legacy = localStorage.getItem(API_KEY_LEGACY_STORAGE);
    if (legacy) {
      await saveApiKey(legacy);
      return legacy;
    }
    const stored = localStorage.getItem(API_KEY_ENC_STORAGE);
    if (!stored) return null;
    const payload = JSON.parse(stored);
    if (!payload?.iv || !payload?.data) return null;
    const key = await getApiKeyCryptoKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.data)
    );
    return new TextDecoder().decode(plain);
  } catch (err) {
    console.error('APIキーの読み込みに失敗:', err);
    return null;
  }
}

export function removeApiKey(): void {
  localStorage.removeItem(API_KEY_ENC_STORAGE);
  localStorage.removeItem(API_KEY_CRYPTO_STORAGE);
  localStorage.removeItem(API_KEY_LEGACY_STORAGE);
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

export async function clearMaterials(): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains('materials')) {
    db.close();
    return;
  }
  const tx = db.transaction('materials', 'readwrite');
  tx.objectStore('materials').clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
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
