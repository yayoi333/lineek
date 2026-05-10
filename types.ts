
export interface SourceImage {
  id: string;
  url: string;
  file: File;
  width: number;
  height: number;
}

export interface TextObject {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string; // 'M PLUS Rounded 1c', 'Noto Sans JP', 'Noto Serif JP'
  color: string;
  isVertical: boolean;
  outlineColor: string;
  outlineWidth: number;
  zIndex: 'front' | 'back';
  layerOrder?: number; // Added: Drawing order (smaller is back)
  rotation: number; // degrees
  curvature: number; // -100 to 100 (0 is straight)
}

export interface TextSetConfig {
  texts: string[];           // テキストのリスト（1行1テキスト）
  fontSize: number;
  fontFamily: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  isVertical: boolean;
  position: 'top' | 'center' | 'bottom'; // テキストのY座標の目安
  zIndex: 'front' | 'back';
  rotation: number;
  curvature: number;
}

export interface ImageLayerObject {
  id: string;
  dataUrl: string;       // 透過PNG の base64
  originalWidth: number; // 元画像の幅
  originalHeight: number;// 元画像の高さ
  x: number;             // キャンバス上のX座標（中心基準）
  y: number;             // キャンバス上のY座標（中心基準）
  scale: number;         // 1.0 = 原寸
  rotation: number;      // degrees
  opacity: number;       // 0.0 ~ 1.0
  zIndex: 'front' | 'back';
  layerOrder?: number;   // Added
}

export interface DrawingStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  opacity: number;
  zIndex: 'front' | 'back';
  layerOrder?: number;   // Added
  outlineColor?: string;
  outlineWidth?: number;
}

export interface Stamp {
  id: string;
  sourceImageId: string; // Reference to the source image
  originalX: number;
  originalY: number;
  width: number;
  height: number;
  dataUrl: string; // The cutout transparent image
  originalDataUrl?: string; // The raw cutout image (without bg removal) for restoration
  isExcluded: boolean;
  // For editor state (370x320)
  scale: number;
  rotation?: number; // Added rotation in degrees
  offsetX: number;
  offsetY: number;
  currentTolerance?: number; // Track the tolerance used for this stamp
  textObjects?: TextObject[]; // Added text objects
  
  // Future features
  imageLayers?: ImageLayerObject[];
  drawingStrokes?: DrawingStroke[];
  mainImageLayerOrder?: number; // Added: Order of the main stamp image (default 100)
  
  flipH?: boolean;   // 左右反転
  flipV?: boolean;   // 上下反転
}

export interface ExportConfig {
  id: string;
  scale: number;
  rotation?: number; // Added rotation
  offsetX: number;
  offsetY: number;
  customDataUrl?: string; // If edited specifically for Main/Tab (eraser etc)
  textObjects?: TextObject[]; // Added text objects for Main/Tab
  
  // Future features
  imageLayers?: ImageLayerObject[];
  drawingStrokes?: DrawingStroke[];
  mainImageLayerOrder?: number; // Added
  
  flipH?: boolean;
  flipV?: boolean;
}

export interface MetaData {
  stampNameJa: string;
  stampDescJa: string;
  stampNameEn: string;
  stampDescEn: string;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  EDIT = 'EDIT',
  EXPORT = 'EXPORT',
}

export interface ProcessedResult {
  stamps: Stamp[];
  originalWidth: number;
  originalHeight: number;
}

export const TARGET_WIDTH = 180;
export const TARGET_HEIGHT = 180;
export const MAIN_WIDTH = 240;
export const MAIN_HEIGHT = 240;
export const TAB_WIDTH = 96;
export const TAB_HEIGHT = 74;
