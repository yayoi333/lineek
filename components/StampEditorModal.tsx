import React, { useRef, useEffect, useState } from 'react';
import { Stamp, TextObject, ImageLayerObject, DrawingStroke, TARGET_WIDTH, TARGET_HEIGHT, StrokeItem } from '../types';
import { Check, X, Sliders, Layers, Trash2, Move, Type, Image as ImageIcon, PenTool, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eraser, Wand2 } from 'lucide-react';
import { drawTextOnCanvas } from '../lib/zipService';
import { reprocessStampWithTolerance } from '../lib/imageProcessing';
import { saveMaterial, loadMaterials, deleteMaterial, MaterialItem } from '../lib/storage';
import { getSortedLayers, getNextLayerOrder, moveLayerUp, moveLayerDown, getLayerDisplayName, getStrokeItems } from '../lib/layerUtils';

import { TextEditPanel } from './editor/TextEditPanel';
import { ImageControlPanel } from './editor/ImageControlPanel';
import { ImageLayerPanel } from './editor/ImageLayerPanel';
import { DrawingPanel } from './editor/DrawingPanel';
import { EditorToolbar } from './editor/EditorToolbar';
import { ModeSelector } from './editor/ModeSelector';
import { ControlSlider } from './editor/ControlSlider';
import { CollapsiblePanel } from './editor/CollapsiblePanel';
import { LayerOrderPanel } from './editor/LayerOrderPanel';

const backgroundOptions = [
    { value: 'checker', label: '透明', color: 'bg-gray-200' }, 
    { value: '#ffffff', label: '白', color: 'bg-white border' },
    { value: '#ff00ff', label: 'マゼンタ', color: 'bg-[#ff00ff]' },
    { value: '#60a5fa', label: '青', color: 'bg-[#60a5fa]' },
    { value: '#000000', label: '黒', color: 'bg-black' },
    { value: '#16a34a', label: '緑', color: 'bg-[#16a34a]' },
    { value: '#f97316', label: 'オレンジ', color: 'bg-[#f97316]' },
];

interface Props {
  stamp: Stamp;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedStamp: Stamp) => void;
  onReCrop?: () => void; 
  initialPreviewBg?: string; 
  targetWidth?: number;
  targetHeight?: number;
  initialScale?: number;
  initialRotation?: number;
  initialOffset?: { x: number, y: number };
  initialTextObjects?: TextObject[];
  initialImageLayers?: ImageLayerObject[];
  initialDrawingStrokes?: DrawingStroke[];
}

interface HistoryState {
    scale: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    offset: { x: number, y: number };
    dataUrl: string;
    tolerance: number;
    textObjects: TextObject[];
    imageLayers: ImageLayerObject[];
    drawingStrokes: DrawingStroke[];
    mainImageLayerOrder: number;
}

export const StampEditorModal: React.FC<Props> = ({ 
  stamp, 
  isOpen, 
  onClose, 
  onSave, 
  onReCrop,
  initialPreviewBg = 'checker',
  targetWidth = TARGET_WIDTH,
  targetHeight = TARGET_HEIGHT,
  initialScale,
  initialRotation,
  initialOffset,
  initialTextObjects,
  initialImageLayers,
  initialDrawingStrokes
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Image State
  const [scale, setScale] = useState(initialScale ?? stamp.scale);
  const [rotation, setRotation] = useState(initialRotation ?? stamp.rotation ?? 0);
  const [offset, setOffset] = useState(initialOffset ?? { x: stamp.offsetX, y: stamp.offsetY });
  const [flipH, setFlipH] = useState(stamp.flipH ?? false);
  const [flipV, setFlipV] = useState(stamp.flipV ?? false);
  const [mainImageLayerOrder, setMainImageLayerOrder] = useState(stamp.mainImageLayerOrder ?? 100);
  
  // Text State
  const [textObjects, setTextObjects] = useState<TextObject[]>(initialTextObjects ?? stamp.textObjects ?? []);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Image Layer State
  const [imageLayers, setImageLayers] = useState<ImageLayerObject[]>(initialImageLayers ?? stamp.imageLayers ?? []);
  const [selectedImageLayerId, setSelectedImageLayerId] = useState<string | null>(null);
  const [isResizingImageLayer, setIsResizingImageLayer] = useState(false);
  const [activeImageLayerHandle, setActiveImageLayerHandle] = useState<'tl'|'tr'|'bl'|'br'|null>(null);

  // Keep track of latest imageLayers for async checks
  const imageLayersRef = useRef(imageLayers);
  useEffect(() => { imageLayersRef.current = imageLayers; }, [imageLayers]);

  // Materials State
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [showMaterialLibrary, setShowMaterialLibrary] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Drawing State
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>(initialDrawingStrokes ?? stamp.drawingStrokes ?? []);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[] | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [penColor, setPenColor] = useState('#000000');
  const [penWidth, setPenWidth] = useState(4);
  const [penOpacity, setPenOpacity] = useState(1.0);
  const [penZIndex, setPenZIndex] = useState<'front' | 'back'>('front');
  const [penOutlineColor, setPenOutlineColor] = useState('#ffffff');
  const [penOutlineWidth, setPenOutlineWidth] = useState(0);

  // Panel Collapsed State
  const [panelCollapsed, setPanelCollapsed] = useState<Record<string, boolean>>({
    move: false,
    text: false,
    image: false,
    draw: false,
    layers: false,
  });

  const togglePanel = (key: string) => {
    setPanelCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // History State
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Editor View state
  const [viewZoom, setViewZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const panContainerRef = useRef<HTMLDivElement>(null);
  const [previewBg, setPreviewBg] = useState(initialPreviewBg);

  const [mode, setMode] = useState<'move' | 'eraser' | 'wand' | 'restore' | 'text' | 'image' | 'draw'>('move');
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingText, setIsResizingText] = useState(false);
  
  // Cursor visual state
  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [eraserSize, setEraserSize] = useState(20);
  
  const [activeTextHandle, setActiveTextHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);

  // Pinch & Resize State
  const [pinchStartDist, setPinchStartDist] = useState<number | null>(null);
  const [pinchStartScale, setPinchStartScale] = useState<number>(1);
  const [pinchStartAngle, setPinchStartAngle] = useState<number | null>(null);
  const [pinchStartRotation, setPinchStartRotation] = useState<number>(0);
  
  // Image Resizing State
  const [isResizingImage, setIsResizingImage] = useState(false);
  const [activeImageHandle, setActiveImageHandle] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);

  const [tolerance, setTolerance] = useState(stamp.currentTolerance || 50);

  const [workingDataUrl, setWorkingDataUrl] = useState(stamp.dataUrl);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  
  // Debounce for tolerance
  const toleranceTimeoutRef = useRef<number | null>(null);
  // Edit canvas for eraser/restore operations to avoid creating new images constantly
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastBrushTimeRef = useRef<number>(0);
  const pendingBrushRef = useRef<number | null>(null);
  
  // Cache for image layers to prevent flickering
  const imageLayerCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Load Image Layer Cache
  useEffect(() => {
    const cache = imageLayerCacheRef.current;
    
    // Load new images
    imageLayers.forEach(layer => {
      if (!cache.has(layer.id)) {
        const img = new Image();
        img.src = layer.dataUrl;
        img.onload = () => {
          cache.set(layer.id, img);
          drawCanvas(); // Redraw once loaded
        };
      }
    });
    
    // Cleanup removed images
    const currentIds = new Set(imageLayers.map(l => l.id));
    for (const id of cache.keys()) {
        if (!currentIds.has(id)) {
            cache.delete(id);
        }
    }
  }, [imageLayers]);

  useEffect(() => {
    if (isOpen) {
      setScale(initialScale ?? stamp.scale);
      setRotation(initialRotation ?? stamp.rotation ?? 0);
      setOffset(initialOffset ?? { x: stamp.offsetX, y: stamp.offsetY });
      setFlipH(stamp.flipH ?? false);
      setFlipV(stamp.flipV ?? false);
      setMainImageLayerOrder(stamp.mainImageLayerOrder ?? 100);
      setWorkingDataUrl(stamp.dataUrl);
      setMode('move');
      setViewZoom(1);
      setCanvasPan({ x: 0, y: 0 });
      setTolerance(stamp.currentTolerance || 50);
      setTextObjects(initialTextObjects ?? stamp.textObjects ?? []);
      setImageLayers(initialImageLayers ?? stamp.imageLayers ?? []);
      setDrawingStrokes(initialDrawingStrokes ?? stamp.drawingStrokes ?? []);
      setSelectedTextId(null);
      setSelectedImageLayerId(null);
      setSelectedDrawingId(null);

      const initialState = {
          scale: initialScale ?? stamp.scale,
          rotation: initialRotation ?? stamp.rotation ?? 0,
          flipH: stamp.flipH ?? false,
          flipV: stamp.flipV ?? false,
          offset: initialOffset ?? { x: stamp.offsetX, y: stamp.offsetY },
          dataUrl: stamp.dataUrl,
          tolerance: stamp.currentTolerance || 50,
          textObjects: initialTextObjects ?? stamp.textObjects ?? [],
          imageLayers: initialImageLayers ?? stamp.imageLayers ?? [],
          drawingStrokes: initialDrawingStrokes ?? stamp.drawingStrokes ?? [],
          mainImageLayerOrder: stamp.mainImageLayerOrder ?? 100,
      };
      setHistory([initialState]);
      setHistoryIndex(0);

      if (stamp.originalDataUrl) {
          const img = new Image();
          img.src = stamp.originalDataUrl;
          img.onload = () => setOriginalImage(img);
      } else {
          setOriginalImage(null);
      }

      // Load Materials
      loadMaterials().then(setMaterials).catch(console.error);
    }
  }, [isOpen, stamp, initialScale, initialRotation, initialOffset, initialTextObjects, initialImageLayers, initialDrawingStrokes]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    drawCanvas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, scale, rotation, flipH, flipV, offset, workingDataUrl, previewBg, targetWidth, targetHeight, cursorPos, mode, eraserSize, textObjects, selectedTextId, imageLayers, selectedImageLayerId, drawingStrokes, currentStroke, penColor, penWidth, penOpacity, penOutlineColor, penOutlineWidth, mainImageLayerOrder]); 

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const addToHistory = (newState: Partial<HistoryState>) => {
      const currentState = {
          scale,
          rotation,
          flipH,
          flipV,
          offset,
          dataUrl: workingDataUrl,
          tolerance,
          textObjects,
          imageLayers,
          drawingStrokes,
          mainImageLayerOrder,
          ...newState
      };
      
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(currentState);
      if (newHistory.length > 20) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          const prevState = history[prevIndex];
          setScale(prevState.scale);
          setRotation(prevState.rotation);
          setFlipH(prevState.flipH ?? false);
          setFlipV(prevState.flipV ?? false);
          setOffset(prevState.offset);
          setWorkingDataUrl(prevState.dataUrl);
          setTolerance(prevState.tolerance);
          setTextObjects(prevState.textObjects);
          setImageLayers(prevState.imageLayers);
          setDrawingStrokes(prevState.drawingStrokes);
          setMainImageLayerOrder(prevState.mainImageLayerOrder);
          setHistoryIndex(prevIndex);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          const nextState = history[nextIndex];
          setScale(nextState.scale);
          setRotation(nextState.rotation);
          setFlipH(nextState.flipH ?? false);
          setFlipV(nextState.flipV ?? false);
          setOffset(nextState.offset);
          setWorkingDataUrl(nextState.dataUrl);
          setTolerance(nextState.tolerance);
          setTextObjects(nextState.textObjects);
          setImageLayers(nextState.imageLayers);
          setDrawingStrokes(nextState.drawingStrokes);
          setMainImageLayerOrder(nextState.mainImageLayerOrder);
          setHistoryIndex(nextIndex);
      }
  };

  const sortedLayers = getSortedLayers(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(ctx, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
        // Prepare common variables
        const drawnW = stamp.width * scale;
        const drawnH = stamp.height * scale;
        const cx = canvas.width / 2 + offset.x;
        const cy = canvas.height / 2 + offset.y;

        // Draw layers in order
        for (const layer of sortedLayers) {
            if (layer.type === 'mainImage') {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
                ctx.drawImage(img, -drawnW / 2, -drawnH / 2, drawnW, drawnH);
                ctx.restore();
            } else if (layer.type === 'text') {
                const textObj = textObjects.find(t => t.id === layer.id);
                if (textObj) {
                    drawTextOnCanvas(ctx, textObj);
                }
            } else if (layer.type === 'imageLayer') {
                const imageLayer = imageLayers.find(l => l.id === layer.id);
                if (imageLayer) {
                    const cachedImg = imageLayerCacheRef.current.get(imageLayer.id);
                    if (cachedImg) drawImageLayer(ctx, imageLayer, cachedImg);
                }
            } else if (layer.type === 'drawing') {
                const stroke = drawingStrokes.find(s => s.id === layer.id);
                if (stroke) drawStroke(ctx, stroke);
            }
        }

        // --- Draw UI Overlays (Selection, Handles, Cursors) on TOP ---

        // 1. Image Layer Selection Handles
        if (mode === 'image' && selectedImageLayerId) {
            const layer = imageLayers.find(l => l.id === selectedImageLayerId);
            if (layer) drawImageLayerSelectionUI(ctx, layer);
        }

        // 2. Text Selection Handles
        if (mode === 'text' && selectedTextId) {
            const textObj = textObjects.find(t => t.id === selectedTextId);
            if (textObj) drawTextSelectionUI(ctx, textObj);
        }

        // 3. Main Image Selection Handles (Move mode)
        if (mode === 'move') {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((rotation * Math.PI) / 180);
            const hw = drawnW / 2;
            const hh = drawnH / 2;
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(-hw, -hh, drawnW, drawnH);
            const handleSize = 12; 
            ctx.fillStyle = '#ffffff';
            [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: -hw, y: hh }, { x: hw, y: hh }].forEach(c => {
                ctx.fillRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
            });
            ctx.restore();
        }

        // 4. Current Drawing Stroke
        if (currentStroke && currentStroke.length >= 2) {
            ctx.save();
            ctx.globalAlpha = penOpacity;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const tracePath = () => {
                ctx.beginPath();
                ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
                for (let i = 1; i < currentStroke.length; i++) {
                    ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
                }
            };
            if (penOutlineWidth > 0) {
                tracePath();
                ctx.strokeStyle = penOutlineColor;
                ctx.lineWidth = penWidth + (penOutlineWidth * 2);
                ctx.stroke();
            }
            tracePath();
            ctx.strokeStyle = penColor;
            ctx.lineWidth = penWidth;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }

        // 5. Canvas Border
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

        // 6. Brush Cursor
        if ((mode === 'eraser' || mode === 'restore') && cursorPos) {
            ctx.beginPath();
            ctx.arc(cursorPos.x, cursorPos.y, eraserSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 0.4;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 0.4;
            ctx.stroke();
        }
        if (mode === 'draw' && cursorPos) {
            ctx.beginPath();
            ctx.arc(cursorPos.x, cursorPos.y, penWidth / 2, 0, Math.PI * 2);
            ctx.strokeStyle = penColor;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    };
    img.src = workingDataUrl;
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: DrawingStroke) => {
    const strokesToDraw = getStrokeItems(stroke);
    if (strokesToDraw.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Phase 1: outlines
    strokesToDraw.forEach((s) => {
      if (s.points.length < 2) return;
      const outlineWidth = s.outlineWidth ?? 0;
      if (outlineWidth <= 0) return;

      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.outlineColor || '#ffffff';
      ctx.lineWidth = s.width + outlineWidth * 2;
      ctx.stroke();
    });

    // Phase 2: foreground lines
    strokesToDraw.forEach((s) => {
      if (s.points.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.stroke();
    });

    ctx.restore();
  };

  const drawImageLayer = (ctx: CanvasRenderingContext2D, layer: ImageLayerObject, layerImg: HTMLImageElement) => {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    const w = layer.originalWidth * layer.scale;
    const h = layer.originalHeight * layer.scale;
    ctx.drawImage(layerImg, -w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1.0;
    ctx.restore();
  };

  const drawImageLayerSelectionUI = (ctx: CanvasRenderingContext2D, layer: ImageLayerObject) => {
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    const w = layer.originalWidth * layer.scale;
    const h = layer.originalHeight * layer.scale;
    const hw = w / 2;
    const hh = h / 2;
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-hw, -hh, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#8b5cf6';
    const handleSize = 10;
    [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: -hw, y: hh }, { x: hw, y: hh }].forEach(c => {
        ctx.fillRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
    });
    ctx.restore();
  }

  const getTextBoundingBox = (ctx: CanvasRenderingContext2D, textObj: TextObject) => {
      ctx.font = `bold ${textObj.fontSize}px '${textObj.fontFamily}'`;
      const lines = textObj.text.split('\n');
      const lineHeight = textObj.fontSize * 1.2;
      let w = 0, h = 0;
      if (textObj.text.length === 0) { w = 40; h = 40; } 
      else if (textObj.isVertical) {
          w = lineHeight * lines.length;
          const maxChars = Math.max(...lines.map(l => l.length));
          h = textObj.fontSize * maxChars;
      } else {
          const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
          w = maxW;
          h = lineHeight * lines.length;
      }
      return { w: Math.max(20, w + 10), h: Math.max(20, h + 10) };
  };

  const drawTextSelectionUI = (ctx: CanvasRenderingContext2D, textObj: TextObject) => {
      ctx.save();
      ctx.translate(textObj.x, textObj.y);
      ctx.rotate((textObj.rotation * Math.PI) / 180);
      const { w, h } = getTextBoundingBox(ctx, textObj);
      const hw = w / 2;
      const hh = h / 2;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-hw, -hh, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      const handleSize = 10;
      [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: -hw, y: hh }, { x: hw, y: hh }].forEach(c => {
          ctx.fillRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
          ctx.strokeRect(c.x - handleSize/2, c.y - handleSize/2, handleSize, handleSize);
      });
      ctx.restore();
  }

  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (previewBg === 'checker') {
        const size = 10;
        for(let y=0; y<h; y+=size) {
            for(let x=0; x<w; x+=size) {
                ctx.fillStyle = ((x/size + y/size) % 2 === 0) ? '#f3f4f6' : '#e5e7eb';
                ctx.fillRect(x, y, size, size);
            }
        }
    } else {
        ctx.fillStyle = previewBg;
        ctx.fillRect(0, 0, w, h);
    }
  };

  const handleUpdateText = (id: string, updates: Partial<TextObject>) => {
      let extraUpdates = {};
      if (updates.zIndex !== undefined) {
          extraUpdates = {
              layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, updates.zIndex)
          };
      }
      const newObjects = textObjects.map(t => t.id === id ? { ...t, ...updates, ...extraUpdates } : t);
      setTextObjects(newObjects);
  };
  const handleTextChangeComplete = () => { addToHistory({ textObjects }); };
  const handleAddText = () => {
      if (textObjects.length >= 3) { showToast("テキストは最大3つまでです"); return; }
      const newText: TextObject = {
          id: Date.now().toString(), text: "", x: targetWidth / 2, y: targetHeight / 2, fontSize: 40, fontFamily: 'M PLUS Rounded 1c',
          color: '#000000', isVertical: false, outlineColor: '#ffffff', outlineWidth: 4, zIndex: 'front', rotation: 0, curvature: 0,
          layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, 'front')
      };
      const newObjects = [...textObjects, newText];
      setTextObjects(newObjects); setSelectedTextId(newText.id); addToHistory({ textObjects: newObjects }); setMode('text');
  };
  const handleDeleteText = () => {
      if (!selectedTextId) return;
      const newObjects = textObjects.filter(t => t.id !== selectedTextId);
      setTextObjects(newObjects); setSelectedTextId(null); addToHistory({ textObjects: newObjects });
  };
  const handleAddImageLayer = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    if (imageLayersRef.current.length >= 5) { showToast("画像レイヤーは最大5つまでです"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (imageLayersRef.current.length >= 5) { showToast("画像レイヤーは最大5つまでです"); return; }
      const img = new Image();
      img.onload = () => {
        if (imageLayersRef.current.length >= 5) { showToast("画像レイヤーは最大5つまでです"); return; }
        const maxDim = Math.min(targetWidth, targetHeight) * 0.5;
        const fitScale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const newLayer: ImageLayerObject = {
            id: 'img-' + Date.now().toString(), dataUrl: reader.result as string, originalWidth: img.width, originalHeight: img.height,
            x: targetWidth / 2, y: targetHeight / 2, scale: fitScale, rotation: 0, opacity: 1.0, zIndex: 'front',
            layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, 'front')
        };
        const newLayers = [...imageLayers, newLayer]; setImageLayers(newLayers); setSelectedImageLayerId(newLayer.id); addToHistory({ imageLayers: newLayers });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  const handleUpdateImageLayer = (id: string, updates: Partial<ImageLayerObject>) => {
    let extraUpdates = {};
    if (updates.zIndex !== undefined) {
        extraUpdates = {
            layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, updates.zIndex)
        };
    }
    setImageLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates, ...extraUpdates } : l));
  };
  const handleDeleteImageLayer = () => {
    if (!selectedImageLayerId) return;
    const newLayers = imageLayers.filter(l => l.id !== selectedImageLayerId);
    setImageLayers(newLayers); setSelectedImageLayerId(null); addToHistory({ imageLayers: newLayers });
  };
  const handleSaveAsMaterial = async () => {
    if (!selectedImageLayerId) return;
    const layer = imageLayers.find(l => l.id === selectedImageLayerId); if (!layer) return;
    const item: MaterialItem = {
      id: 'mat-' + Date.now().toString(), dataUrl: layer.dataUrl, width: layer.originalWidth, height: layer.originalHeight,
      name: '素材 ' + (materials.length + 1), createdAt: new Date().toISOString(),
    };
    await saveMaterial(item); setMaterials(prev => [...prev, item]); showToast('素材ライブラリに保存しました');
  };
  const handleAddFromMaterial = (mat: MaterialItem) => {
    if (imageLayersRef.current.length >= 5) { showToast("画像レイヤーは最大5つまでです"); return; }
    const maxDim = Math.min(targetWidth, targetHeight) * 0.5;
    const fitScale = Math.min(maxDim / mat.width, maxDim / mat.height, 1);
    const newLayer: ImageLayerObject = {
        id: 'img-' + Date.now().toString(), dataUrl: mat.dataUrl, originalWidth: mat.width, originalHeight: mat.height,
        x: targetWidth / 2, y: targetHeight / 2, scale: fitScale, rotation: 0, opacity: 1.0, zIndex: 'front',
        layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, 'front')
    };
    const newLayers = [...imageLayers, newLayer]; setImageLayers(newLayers); setSelectedImageLayerId(newLayer.id); addToHistory({ imageLayers: newLayers }); setShowMaterialLibrary(false);
  };
  const handleDeleteMaterialItem = async (id: string) => {
    try { await deleteMaterial(id); setMaterials(prev => prev.filter(m => m.id !== id)); showToast('素材を削除しました'); } 
    catch (err) { console.error('素材削除エラー:', err); }
  };
  const handleDeleteLastStroke = () => {
    if (drawingStrokes.length === 0) return;

    const targetId = selectedDrawingId || drawingStrokes[drawingStrokes.length - 1]?.id;
    const layerIndex = drawingStrokes.findIndex((s) => s.id === targetId);
    if (layerIndex === -1) return;

    const layer = { ...drawingStrokes[layerIndex] };
    const items = getStrokeItems(layer);
    const updatedItems = items.slice(0, -1);

    let newStrokes = [...drawingStrokes];

    if (updatedItems.length > 0) {
      const last = updatedItems[updatedItems.length - 1];
      layer.strokes = updatedItems;
      layer.points = last.points;
      layer.color = last.color;
      layer.width = last.width;
      layer.opacity = last.opacity;
      layer.outlineColor = last.outlineColor;
      layer.outlineWidth = last.outlineWidth;
      newStrokes[layerIndex] = layer;
    } else {
      newStrokes.splice(layerIndex, 1);
      setSelectedDrawingId(newStrokes.length > 0 ? newStrokes[newStrokes.length - 1].id : null);
    }

    setDrawingStrokes(newStrokes);
    addToHistory({ drawingStrokes: newStrokes });
  };
  const handleClearAllStrokes = () => {
    if (drawingStrokes.length === 0) return;
    setDrawingStrokes([]);
    setSelectedDrawingId(null);
    addToHistory({ drawingStrokes: [] });
    showToast('手書きを全て消しました');
  };

  // Layer ordering handlers
  const handleLayerMoveUp = (type: string, id: string) => {
    const result = moveLayerUp(
      type as any, id,
      textObjects, imageLayers, drawingStrokes, mainImageLayerOrder
    );
    setTextObjects(result.textObjects);
    setImageLayers(result.imageLayers);
    setDrawingStrokes(result.drawingStrokes);
    setMainImageLayerOrder(result.mainImageLayerOrder);
    addToHistory({
      textObjects: result.textObjects,
      imageLayers: result.imageLayers,
      drawingStrokes: result.drawingStrokes,
      mainImageLayerOrder: result.mainImageLayerOrder,
    });
  };

  const handleLayerMoveDown = (type: string, id: string) => {
    const result = moveLayerDown(
      type as any, id,
      textObjects, imageLayers, drawingStrokes, mainImageLayerOrder
    );
    setTextObjects(result.textObjects);
    setImageLayers(result.imageLayers);
    setDrawingStrokes(result.drawingStrokes);
    setMainImageLayerOrder(result.mainImageLayerOrder);
    addToHistory({
      textObjects: result.textObjects,
      imageLayers: result.imageLayers,
      drawingStrokes: result.drawingStrokes,
      mainImageLayerOrder: result.mainImageLayerOrder,
    });
  };

  const handleLayerSelect = (type: string, id: string) => {
    // レイヤーをタップしたら該当モードに切り替え＆選択
    if (type === 'text') {
      setMode('text');
      setSelectedTextId(id);
    } else if (type === 'imageLayer') {
      setMode('image');
      setSelectedImageLayerId(id);
    } else if (type === 'mainImage') {
      setMode('move');
    } else if (type === 'drawing') {
      setMode('draw');
      setSelectedDrawingId(id);
    }
  };

  const handleModeChange = (newMode: 'move' | 'eraser' | 'wand' | 'restore' | 'text' | 'image' | 'draw') => {
    setMode(newMode);
    if (newMode === 'draw') {
      if (drawingStrokes.length === 0) {
        const firstId = 'stroke-' + Date.now().toString();
        const firstStroke: DrawingStroke = {
          id: firstId,
          points: [],
          strokes: [],
          color: penColor,
          width: penWidth,
          opacity: penOpacity,
          zIndex: penZIndex,
          layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, penZIndex),
          outlineColor: penOutlineColor,
          outlineWidth: penOutlineWidth
        };
        const newStrokes = [firstStroke];
        setDrawingStrokes(newStrokes);
        setSelectedDrawingId(firstId);
        addToHistory({ drawingStrokes: newStrokes });
      } else {
        if (!selectedDrawingId) {
          setSelectedDrawingId(drawingStrokes[drawingStrokes.length - 1].id);
        }
      }
    }
  };

  const handleAddDrawingLayer = () => {
    const newId = 'stroke-' + Date.now().toString();
    const newStroke: DrawingStroke = {
      id: newId,
      points: [],
      strokes: [],
      color: penColor,
      width: penWidth,
      opacity: penOpacity,
      zIndex: penZIndex,
      layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, penZIndex),
      outlineColor: penOutlineColor,
      outlineWidth: penOutlineWidth
    };
    const newStrokes = [...drawingStrokes, newStroke];
    setDrawingStrokes(newStrokes);
    setSelectedDrawingId(newId);
    setMode('draw');
    addToHistory({ drawingStrokes: newStrokes });
    showToast('手書きレイヤーを追加しました');
  };

  // ... (Tool Implementation helpers same as before) ...
  const getClientCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
      if ('touches' in e) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; } else { return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }; }
  };
  const transformToLocal = (px: number, py: number, cx: number, cy: number, rot: number) => {
      const dx = px - cx; const dy = py - cy; const rad = -(rot * Math.PI) / 180;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad); const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
      return { x: rx, y: ry };
  }
  const getLocalImageCoords = (canvasX: number, canvasY: number) => {
      const cx = targetWidth / 2 + offset.x; const cy = targetHeight / 2 + offset.y;
      const { x: localX, y: localY } = transformToLocal(canvasX, canvasY, cx, cy, rotation);
      const drawnW = stamp.width * scale; const drawnH = stamp.height * scale;
      const adjustedLocalX = flipH ? -localX : localX; const adjustedLocalY = flipV ? -localY : localY;
      const imgX = (adjustedLocalX + drawnW / 2) / scale; const imgY = (adjustedLocalY + drawnH / 2) / scale;
      return { imgX, imgY, inside: (imgX >= 0 && imgX <= stamp.width && imgY >= 0 && imgY <= stamp.height) };
  };
  const prepareEditCanvas = async () => {
      if (!editCanvasRef.current) { editCanvasRef.current = document.createElement('canvas'); editCanvasRef.current.width = stamp.width; editCanvasRef.current.height = stamp.height; }
      const ctx = editCanvasRef.current.getContext('2d'); if (!ctx) return null;
      return new Promise<CanvasRenderingContext2D | null>((resolve) => {
          const img = new Image();
          img.onload = () => { ctx!.globalCompositeOperation = 'source-over'; ctx!.clearRect(0, 0, stamp.width, stamp.height); ctx!.drawImage(img, 0, 0); resolve(ctx); };
          img.src = workingDataUrl;
      });
  };
  const applyEraser = async (canvasX: number, canvasY: number) => {
      const { imgX, imgY, inside } = getLocalImageCoords(canvasX, canvasY);
      if (!inside && (imgX < -50 || imgX > stamp.width + 50 || imgY < -50 || imgY > stamp.height + 50)) return;
      const brushR = (eraserSize / scale) / 2; const ctx = await prepareEditCanvas(); if (!ctx) return;
      ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(imgX, imgY, brushR, 0, Math.PI * 2); ctx.fill();
      const now = Date.now();
      if (pendingBrushRef.current) cancelAnimationFrame(pendingBrushRef.current);
      if (now - lastBrushTimeRef.current > 50) {
          lastBrushTimeRef.current = now;
          setWorkingDataUrl(editCanvasRef.current!.toDataURL());
      } else {
          pendingBrushRef.current = requestAnimationFrame(() => {
              lastBrushTimeRef.current = Date.now();
              if (editCanvasRef.current) setWorkingDataUrl(editCanvasRef.current.toDataURL());
          });
      }
  };
  const applyRestore = async (canvasX: number, canvasY: number) => {
      if (!originalImage) return;
      const { imgX, imgY, inside } = getLocalImageCoords(canvasX, canvasY);
      if (!inside && (imgX < -50 || imgX > stamp.width + 50 || imgY < -50 || imgY > stamp.height + 50)) return;
      const brushR = (eraserSize / scale) / 2; const ctx = await prepareEditCanvas(); if (!ctx) return;
      ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.beginPath(); ctx.arc(imgX, imgY, brushR, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(originalImage, 0, 0, stamp.width, stamp.height); ctx.restore();
      const now = Date.now();
      if (pendingBrushRef.current) cancelAnimationFrame(pendingBrushRef.current);
      if (now - lastBrushTimeRef.current > 50) {
          lastBrushTimeRef.current = now;
          setWorkingDataUrl(editCanvasRef.current!.toDataURL());
      } else {
          pendingBrushRef.current = requestAnimationFrame(() => {
              lastBrushTimeRef.current = Date.now();
              if (editCanvasRef.current) setWorkingDataUrl(editCanvasRef.current.toDataURL());
          });
      }
  };
  const applyMagicWand = async (canvasX: number, canvasY: number) => {
      const { imgX, imgY, inside } = getLocalImageCoords(canvasX, canvasY); if (!inside) return;
      const ctx = await prepareEditCanvas(); if (!ctx) return;
      const w = stamp.width; const h = stamp.height; const imageData = ctx.getImageData(0, 0, w, h); const data = imageData.data;
      const startX = Math.floor(imgX); const startY = Math.floor(imgY);
      if (startX < 0 || startX >= w || startY < 0 || startY >= h) return;
      const startIdx = (startY * w + startX) * 4; const sa = data[startIdx + 3]; if (sa === 0) return; 
      const sr = data[startIdx]; const sg = data[startIdx + 1]; const sb = data[startIdx + 2];
      const tol = 30; const stack: [number, number][] = [[startX, startY]]; const visited = new Uint8Array(w * h);
      while (stack.length > 0) {
          const [x, y] = stack.pop()!; const idx = y * w + x; if (visited[idx]) continue;
          const pIdx = idx * 4; const r = data[pIdx]; const g = data[pIdx+1]; const b = data[pIdx+2]; const a = data[pIdx+3];
          if (a === 0) { visited[idx] = 1; continue; }
          const diff = Math.abs(r - sr) + Math.abs(g - sg) + Math.abs(b - sb);
          if (diff < tol) {
              data[pIdx + 3] = 0; visited[idx] = 1;
              if (x > 0) stack.push([x - 1, y]); if (x < w - 1) stack.push([x + 1, y]); if (y > 0) stack.push([x, y - 1]); if (y < h - 1) stack.push([x, y + 1]);
          }
      }
      ctx.putImageData(imageData, 0, 0); setWorkingDataUrl(editCanvasRef.current!.toDataURL());
  };
  const handleToleranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = Number(e.target.value); setTolerance(newVal);
      if (toleranceTimeoutRef.current) { clearTimeout(toleranceTimeoutRef.current); }
      toleranceTimeoutRef.current = window.setTimeout(async () => {
          if (stamp.originalDataUrl) {
              try { const newDataUrl = await reprocessStampWithTolerance(stamp.originalDataUrl, newVal); setWorkingDataUrl(newDataUrl); } 
              catch (err) { console.error("Failed to reprocess", err); }
          }
      }, 300);
  };
  const handleSave = () => {
      const updatedStamp: Stamp = { ...stamp, scale, rotation, flipH, flipV, offsetX: offset.x, offsetY: offset.y, dataUrl: workingDataUrl, textObjects, imageLayers, drawingStrokes, currentTolerance: tolerance, mainImageLayerOrder };
      onSave(updatedStamp); onClose();
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchstart') e.preventDefault();
    if ('touches' in e && e.touches.length === 2) {
        const t1 = e.touches[0]; const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
        setPinchStartDist(dist); setPinchStartScale(scale); setPinchStartAngle(angle); setPinchStartRotation(rotation);
        setIsDragging(false); return;
    }
    const { x: clientX, y: clientY } = getClientCoords(e);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left) / viewZoom; const y = (clientY - rect.top) / viewZoom;
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;

    if (mode === 'text') {
        if (selectedTextId) {
            const t = textObjects.find(obj => obj.id === selectedTextId);
            if (t) {
                const { x: localX, y: localY } = transformToLocal(x, y, t.x, t.y, t.rotation);
                const { w, h } = getTextBoundingBox(ctx, t);
                const hw = w/2; const hh = h/2; const handleRadius = 20;
                if (Math.hypot(localX - (-hw), localY - (-hh)) < handleRadius) { setActiveTextHandle('tl'); setIsResizingText(true); setLastPos({x, y}); return; }
                if (Math.hypot(localX - (hw), localY - (-hh)) < handleRadius) { setActiveTextHandle('tr'); setIsResizingText(true); setLastPos({x, y}); return; }
                if (Math.hypot(localX - (-hw), localY - (hh)) < handleRadius) { setActiveTextHandle('bl'); setIsResizingText(true); setLastPos({x, y}); return; }
                if (Math.hypot(localX - (hw), localY - (hh)) < handleRadius) { setActiveTextHandle('br'); setIsResizingText(true); setLastPos({x, y}); return; }
            }
        }
        for (let i = textObjects.length - 1; i >= 0; i--) {
             const t = textObjects[i];
             const { x: localX, y: localY } = transformToLocal(x, y, t.x, t.y, t.rotation);
             const { w, h } = getTextBoundingBox(ctx, t);
             if (localX >= -w/2 && localX <= w/2 && localY >= -h/2 && localY <= h/2) { setSelectedTextId(t.id); setIsDragging(true); setLastPos({ x, y }); return; }
        }
        return; 
    }
    if (mode === 'image') {
        if (selectedImageLayerId) {
            const layer = imageLayers.find(l => l.id === selectedImageLayerId);
            if (layer) {
                const { x: localX, y: localY } = transformToLocal(x, y, layer.x, layer.y, layer.rotation);
                const w = layer.originalWidth * layer.scale; const h = layer.originalHeight * layer.scale; const hw = w / 2; const hh = h / 2; const handleRadius = 20;
                if (Math.hypot(localX - (-hw), localY - (-hh)) < handleRadius) { setActiveImageLayerHandle('tl'); setIsResizingImageLayer(true); setLastPos({x, y}); return; }
                if (Math.hypot(localX - (hw), localY - (-hh)) < handleRadius) { setActiveImageLayerHandle('tr'); setIsResizingImageLayer(true); setLastPos({x, y}); return; }
                if (Math.hypot(localX - (-hw), localY - (hh)) < handleRadius) { setActiveImageLayerHandle('bl'); setIsResizingImageLayer(true); setLastPos({x, y}); return; }
                if (Math.hypot(localX - (hw), localY - (hh)) < handleRadius) { setActiveImageLayerHandle('br'); setIsResizingImageLayer(true); setLastPos({x, y}); return; }
            }
        }
        for (let i = imageLayers.length - 1; i >= 0; i--) {
             const layer = imageLayers[i];
             const { x: localX, y: localY } = transformToLocal(x, y, layer.x, layer.y, layer.rotation);
             const w = layer.originalWidth * layer.scale; const h = layer.originalHeight * layer.scale;
             if (localX >= -w/2 && localX <= w/2 && localY >= -h/2 && localY <= h/2) { setSelectedImageLayerId(layer.id); setIsDragging(true); setLastPos({ x, y }); return; }
        }
        setSelectedImageLayerId(null); return;
    }
    if (mode === 'draw') { setCurrentStroke([{ x, y }]); setIsDragging(true); return; }
    if (mode === 'move') {
        const cx = targetWidth / 2 + offset.x; const cy = targetHeight / 2 + offset.y;
        const { x: localX, y: localY } = transformToLocal(x, y, cx, cy, rotation);
        const drawnW = stamp.width * scale; const drawnH = stamp.height * scale; const hw = drawnW / 2; const hh = drawnH / 2; const handleRadius = 25; 
        if (Math.hypot(localX - (-hw), localY - (-hh)) < handleRadius) { setActiveImageHandle('tl'); setIsResizingImage(true); setLastPos({x, y}); return; }
        if (Math.hypot(localX - (hw), localY - (-hh)) < handleRadius) { setActiveImageHandle('tr'); setIsResizingImage(true); setLastPos({x, y}); return; }
        if (Math.hypot(localX - (-hw), localY - (hh)) < handleRadius) { setActiveImageHandle('bl'); setIsResizingImage(true); setLastPos({x, y}); return; }
        if (Math.hypot(localX - (hw), localY - (hh)) < handleRadius) { setActiveImageHandle('br'); setIsResizingImage(true); setLastPos({x, y}); return; }
        setIsDragging(true); setLastPos({ x, y }); return;
    }
    if (mode === 'wand' || mode === 'restore' || mode === 'eraser') {
       addToHistory({}); if (mode === 'wand') applyMagicWand(x, y); else if (mode === 'eraser') applyEraser(x, y); else if (mode === 'restore') applyRestore(x, y);
       setIsDragging(true); setLastPos({ x, y });
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchmove') e.preventDefault();
    if ('touches' in e && e.touches.length === 2 && pinchStartDist !== null) {
        const t1 = e.touches[0]; const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); const scaleFactor = dist / pinchStartDist;
        const newScale = Math.max(0.01, pinchStartScale * scaleFactor); setScale(newScale); return;
    }
    const { x: clientX, y: clientY } = getClientCoords(e);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left) / viewZoom; const y = (clientY - rect.top) / viewZoom; setCursorPos({ x, y });

    if (isResizingText && selectedTextId) {
        const t = textObjects.find(t => t.id === selectedTextId);
        if (t) {
            const dist = Math.hypot(x - t.x, y - t.y); const prevDist = Math.hypot(lastPos.x - t.x, lastPos.y - t.y); const scaleFactor = dist / prevDist;
            const newSize = Math.min(200, Math.max(10, t.fontSize * scaleFactor)); handleUpdateText(selectedTextId, { fontSize: newSize });
        }
        setLastPos({ x, y }); return;
    }
    if (isResizingImageLayer && selectedImageLayerId) {
        const layer = imageLayers.find(l => l.id === selectedImageLayerId);
        if (layer) {
            const dist = Math.hypot(x - layer.x, y - layer.y); const prevDist = Math.hypot(lastPos.x - layer.x, lastPos.y - layer.y);
            if (prevDist > 0) {
                const scaleFactor = dist / prevDist; const newScale = Math.min(3.0, Math.max(0.01, layer.scale * scaleFactor));
                handleUpdateImageLayer(selectedImageLayerId, { scale: newScale });
            }
        }
        setLastPos({ x, y }); return;
    }
    if (isResizingImage) {
        const cx = targetWidth / 2 + offset.x; const cy = targetHeight / 2 + offset.y;
        const dist = Math.hypot(x - cx, y - cy); const prevDist = Math.hypot(lastPos.x - cx, lastPos.y - cy); const scaleFactor = dist / prevDist;
        const newScale = Math.min(3.0, Math.max(0.01, scale * scaleFactor)); setScale(newScale); setLastPos({ x, y }); return;
    }
    if (mode === 'draw' && currentStroke && isDragging) { setCurrentStroke(prev => prev ? [...prev, { x, y }] : [{ x, y }]); return; }
    if (!isDragging) return;

    if (mode === 'move') { const dx = x - lastPos.x; const dy = y - lastPos.y; setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy })); }
    else if (mode === 'text' && selectedTextId) { const dx = x - lastPos.x; const dy = y - lastPos.y; handleUpdateText(selectedTextId, { x: textObjects.find(t => t.id === selectedTextId)!.x + dx, y: textObjects.find(t => t.id === selectedTextId)!.y + dy }); }
    else if (mode === 'image' && selectedImageLayerId) { const dx = x - lastPos.x; const dy = y - lastPos.y; const layer = imageLayers.find(l => l.id === selectedImageLayerId); if (layer) { handleUpdateImageLayer(selectedImageLayerId, { x: layer.x + dx, y: layer.y + dy }); } }
    else if (mode === 'eraser') { applyEraser(x, y); } else if (mode === 'restore') { applyRestore(x, y); }
    setLastPos({ x, y });
  };

  const handlePointerUp = () => {
    if (pendingBrushRef.current) {
        cancelAnimationFrame(pendingBrushRef.current);
        pendingBrushRef.current = null;
        if (editCanvasRef.current) setWorkingDataUrl(editCanvasRef.current.toDataURL());
    }
    if (isDragging && mode === 'move') addToHistory({});
    if (isResizingImage) addToHistory({ scale });
    if (isResizingText && selectedTextId) handleTextChangeComplete();
    if (isResizingImageLayer) { addToHistory({ imageLayers }); }
    if (mode === 'draw' && currentStroke && currentStroke.length >= 2) {
        const selectedId = selectedDrawingId;
        const layerIndex = drawingStrokes.findIndex((s) => s.id === selectedId);

        const strokeItem: StrokeItem = {
            points: currentStroke,
            color: penColor,
            width: penWidth,
            opacity: penOpacity,
            outlineColor: penOutlineColor,
            outlineWidth: penOutlineWidth,
        };

        let newStrokes = [...drawingStrokes];

        if (layerIndex !== -1) {
            const layer = { ...drawingStrokes[layerIndex] };
            const existingItems = getStrokeItems(layer);

            layer.strokes = [...existingItems, strokeItem];
            layer.points = currentStroke;
            layer.color = penColor;
            layer.width = penWidth;
            layer.opacity = penOpacity;
            layer.outlineColor = penOutlineColor;
            layer.outlineWidth = penOutlineWidth;

            newStrokes[layerIndex] = layer;
        } else {
            const newLayerId = 'stroke-' + Date.now().toString();
            const newLayer: DrawingStroke = {
                id: newLayerId,
                points: currentStroke,
                color: penColor,
                width: penWidth,
                opacity: penOpacity,
                zIndex: penZIndex,
                layerOrder: getNextLayerOrder(textObjects, imageLayers, drawingStrokes, mainImageLayerOrder, penZIndex),
                outlineColor: penOutlineColor,
                outlineWidth: penOutlineWidth,
                strokes: [strokeItem],
            };

            newStrokes = [...drawingStrokes, newLayer];
            setSelectedDrawingId(newLayerId);
        }

        setDrawingStrokes(newStrokes);
        setCurrentStroke(null);
        addToHistory({ drawingStrokes: newStrokes });
        setIsDragging(false);
        return;
    }
    if (mode === 'draw') setCurrentStroke(null);
    setIsDragging(false); setIsResizingText(false); setIsResizingImageLayer(false); setIsResizingImage(false);
    setActiveTextHandle(null); setActiveImageLayerHandle(null); setActiveImageHandle(null); setPinchStartDist(null); setPinchStartAngle(null);
  };
  const handlePointerLeave = () => { setCursorPos(null); handlePointerUp(); };
  
  const scrollCanvas = (direction: 'up' | 'down' | 'left' | 'right') => {
    const amount = 60;
    setCanvasPan(prev => {
      if (direction === 'up') return { ...prev, y: prev.y + amount };
      if (direction === 'down') return { ...prev, y: prev.y - amount };
      if (direction === 'left') return { ...prev, x: prev.x + amount };
      if (direction === 'right') return { ...prev, x: prev.x - amount };
      return prev;
    });
  };

  const selectedText = textObjects.find(t => t.id === selectedTextId);
  const selectedImageLayer = imageLayers.find(l => l.id === selectedImageLayerId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full flex flex-col h-[95vh] relative">
        <div className="px-3 py-2 border-b flex items-center bg-primary-50 rounded-t-xl shrink-0 gap-2">
          <h3 className="font-bold text-gray-700 text-sm mr-auto">絵文字編集 ({targetWidth}x{targetHeight})</h3>
          <EditorToolbar viewZoom={viewZoom} onViewZoomChange={setViewZoom} historyIndex={historyIndex} historyLength={history.length} onUndo={undo} onRedo={redo} />
          <div className="flex items-center gap-2">
               <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200">
                    <span className="hidden md:inline text-xs text-gray-400 font-bold px-1">背景色</span>
                    {backgroundOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setPreviewBg(opt.value)}
                            className={`w-5 h-5 rounded-full ${opt.color} ${previewBg === opt.value ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}
                            title={opt.label}
                            style={opt.value === 'checker' ? { backgroundImage: `url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAB5JREFUKFNjYCACAAAHOgD///+F8f///4X/09JvAgBwYw/57yQ+jAAAAABJRU5ErkJggg==')` } : {}}
                        />
                    ))}
                </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
            <div
                ref={panContainerRef}
                className="flex-1 overflow-hidden bg-gray-100 relative"
                style={{ minHeight: '200px' }}
            >
                <div
                    className="absolute"
                    style={{
                        left: `calc(50% + ${canvasPan.x}px)`,
                        top: `calc(50% + ${canvasPan.y}px)`,
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    <div className="relative shadow-md border border-gray-200 bg-white" style={{ width: targetWidth * viewZoom, height: targetHeight * viewZoom, flexShrink: 0 }}>
                        <canvas ref={canvasRef} width={targetWidth} height={targetHeight} className={`origin-top-left ${mode === 'move' ? 'cursor-move' : (mode === 'text' || mode === 'image' ? 'cursor-text' : 'cursor-crosshair')} touch-none`}
                        style={{ transform: `scale(${viewZoom})`, width: targetWidth, height: targetHeight }}
                        onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerLeave} onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp} />
                    </div>
                </div>
                {viewZoom > 1 && (
                    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                        <button
                            onClick={() => scrollCanvas('up')}
                            className="pointer-events-auto absolute top-2 left-1/2 -translate-x-1/2 bg-white/90 hover:bg-white active:bg-gray-200 rounded-full shadow-lg border border-gray-300 p-2 transition"
                        >
                            <ChevronUp size={22} className="text-gray-600" />
                        </button>
                        <button
                            onClick={() => scrollCanvas('down')}
                            className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 hover:bg-white active:bg-gray-200 rounded-full shadow-lg border border-gray-300 p-2 transition"
                        >
                            <ChevronDown size={22} className="text-gray-600" />
                        </button>
                        <button
                            onClick={() => scrollCanvas('left')}
                            className="pointer-events-auto absolute top-1/2 left-2 -translate-y-1/2 bg-white/90 hover:bg-white active:bg-gray-200 rounded-full shadow-lg border border-gray-300 p-2 transition"
                        >
                            <ChevronLeft size={22} className="text-gray-600" />
                        </button>
                        <button
                            onClick={() => scrollCanvas('right')}
                            className="pointer-events-auto absolute top-1/2 right-2 -translate-y-1/2 bg-white/90 hover:bg-white active:bg-gray-200 rounded-full shadow-lg border border-gray-300 p-2 transition"
                        >
                            <ChevronRight size={22} className="text-gray-600" />
                        </button>
                        {(canvasPan.x !== 0 || canvasPan.y !== 0) && (
                            <button
                                onClick={() => setCanvasPan({ x: 0, y: 0 })}
                                className="pointer-events-auto absolute bottom-2 right-2 bg-white/90 hover:bg-white active:bg-gray-200 text-gray-600 text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg border border-gray-300 transition"
                            >
                                中央に戻す
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>

        <div className="p-2 border-t bg-white shrink-0 flex flex-col gap-1 max-h-[35vh] overflow-y-auto">
             
             {mode === 'text' && selectedText && (
                 <CollapsiblePanel
                    title="テキスト編集"
                    icon={<Type size={14} className="text-blue-500" />}
                    collapsed={panelCollapsed.text}
                    onToggle={() => togglePanel('text')}
                    bgColor="bg-blue-50"
                    borderColor="border-blue-100"
                    summaryContent={
                        <span className="text-[10px] text-blue-400 truncate max-w-[150px]">
                            「{selectedText.text}」{selectedText.fontSize}px
                        </span>
                    }
                 >
                    <TextEditPanel
                        selectedText={selectedText}
                        onUpdateText={handleUpdateText}
                        onDeleteText={handleDeleteText}
                        onCommit={handleTextChangeComplete}
                    />
                 </CollapsiblePanel>
             )}

             {mode === 'image' && selectedImageLayer && (
                 <CollapsiblePanel
                    title="画像レイヤー"
                    icon={<ImageIcon size={14} className="text-purple-500" />}
                    collapsed={panelCollapsed.image}
                    onToggle={() => togglePanel('image')}
                    bgColor="bg-purple-50"
                    borderColor="border-purple-100"
                    summaryContent={
                        <span className="text-[10px] text-purple-400">
                            {Math.round(selectedImageLayer.scale * 100)}% / 透明度{Math.round(selectedImageLayer.opacity * 100)}%
                        </span>
                    }
                 >
                    <ImageLayerPanel
                        selectedLayer={selectedImageLayer}
                        onUpdateLayer={handleUpdateImageLayer}
                        onDeleteLayer={handleDeleteImageLayer}
                        onSaveAsMaterial={handleSaveAsMaterial}
                        onCommit={() => addToHistory({ imageLayers })}
                    />
                 </CollapsiblePanel>
             )}

             {mode === 'draw' && (
                 <CollapsiblePanel
                    title="手書き設定"
                    icon={<span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: penColor }} />}
                    collapsed={panelCollapsed.draw}
                    onToggle={() => togglePanel('draw')}
                    bgColor="bg-orange-50"
                    borderColor="border-orange-100"
                    summaryContent={
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded border border-gray-300" style={{ backgroundColor: penColor }} />
                            <span className="text-[10px] text-orange-400">
                                {penWidth}px / {Math.round(penOpacity * 100)}%
                                {penOutlineWidth > 0 && ' / 縁取り'}
                            </span>
                        </div>
                    }
                 >
                    <DrawingPanel 
                        penColor={penColor}
                        penWidth={penWidth}
                        penOpacity={penOpacity}
                        penZIndex={penZIndex}
                        penOutlineColor={penOutlineColor}
                        penOutlineWidth={penOutlineWidth}
                        strokes={drawingStrokes}
                        onPenColorChange={setPenColor}
                        onPenWidthChange={setPenWidth}
                        onPenOpacityChange={setPenOpacity}
                        onPenZIndexChange={setPenZIndex}
                        onPenOutlineColorChange={setPenOutlineColor}
                        onPenOutlineWidthChange={setPenOutlineWidth}
                        onClearAll={handleClearAllStrokes}
                        onDeleteLast={handleDeleteLastStroke}
                        onAddDrawingLayer={handleAddDrawingLayer}
                    />
                 </CollapsiblePanel>
             )}

             {mode === 'move' && (
                 <CollapsiblePanel
                    title="画像操作"
                    icon={<Move size={14} className="text-gray-500" />}
                    collapsed={panelCollapsed.move}
                    onToggle={() => togglePanel('move')}
                    bgColor="bg-gray-50"
                    borderColor="border-gray-200"
                    summaryContent={
                        <span className="text-[10px] text-gray-400">
                            {Math.round(scale * 100)}% / {Math.round(rotation)}°
                            {(flipH || flipV) && ' / 反転'}
                        </span>
                    }
                 >
                    <ImageControlPanel
                        scale={scale}
                        rotation={rotation}
                        flipH={flipH}
                        flipV={flipV}
                        onScaleChange={(v) => { setScale(v); }}
                        onRotationChange={(v) => { setRotation(v); }}
                        onFlipH={() => { setFlipH(prev => !prev); addToHistory({ flipH: !flipH }); }}
                        onFlipV={() => { setFlipV(prev => !prev); addToHistory({ flipV: !flipV }); }}
                        onCommit={() => addToHistory({ scale, rotation })}
                    />
                 </CollapsiblePanel>
             )}

             {mode === 'wand' && originalImage && (
                <div className="flex items-center gap-4 bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <div className="flex items-center gap-2 text-yellow-700 font-bold text-sm min-w-[80px] shrink-0">
                        <Wand2 size={16} /> 追加透過
                    </div>
                    <ControlSlider
                        label="" value={tolerance} min={1} max={100} step={1}
                        onChange={(val: number) => {
                            setTolerance(val);
                            if (toleranceTimeoutRef.current) { clearTimeout(toleranceTimeoutRef.current); }
                            toleranceTimeoutRef.current = window.setTimeout(async () => {
                                if (stamp.originalDataUrl) {
                                    try { const newDataUrl = await reprocessStampWithTolerance(stamp.originalDataUrl, val); setWorkingDataUrl(newDataUrl); } 
                                    catch (err) { console.error("Failed to reprocess", err); }
                                }
                            }, 300);
                        }}
                        showValue={true}
                    />
                </div>
             )}

             {mode === 'eraser' && (
                <div className="flex items-center gap-4 bg-red-50 p-3 rounded-lg border border-red-100">
                    <div className="flex items-center gap-2 text-red-700 font-bold text-sm min-w-[80px] shrink-0">
                        <Eraser size={16} /> 消しゴム
                    </div>
                    <ControlSlider
                        label="" value={eraserSize} min={1} max={100} step={1}
                        onChange={setEraserSize}
                        showValue={true}
                        unit="px"
                    />
                </div>
             )}

             {mode === 'restore' && originalImage && (
                <div className="flex items-center gap-4 bg-teal-50 p-3 rounded-lg border border-teal-100">
                    <div className="flex items-center gap-2 text-teal-700 font-bold text-sm min-w-[80px] shrink-0">
                        <PenTool size={16} /> 復活ペン
                    </div>
                    <ControlSlider
                        label="" value={eraserSize} min={1} max={100} step={1}
                        onChange={setEraserSize}
                        showValue={true}
                        unit="px"
                    />
                </div>
             )}

             {/* レイヤー順パネル（テキスト・画像レイヤー・手書きが1つでもある場合に表示） */}
             {mode !== 'wand' &&
              mode !== 'eraser' &&
              mode !== 'restore' &&
              (textObjects.length > 0 || imageLayers.length > 0 || drawingStrokes.length > 0) && (
                <CollapsiblePanel
                    title="レイヤー順"
                    icon={<Layers size={14} className="text-gray-500" />}
                    collapsed={panelCollapsed.layers ?? false}
                    onToggle={() => togglePanel('layers')}
                    bgColor="bg-gray-50"
                    borderColor="border-gray-200"
                    summaryContent={
                        <span className="text-[10px] text-gray-400">
                            {sortedLayers.length}レイヤー
                        </span>
                    }
                >
                    <LayerOrderPanel
                        layers={sortedLayers}
                        textObjects={textObjects}
                        imageLayers={imageLayers}
                        drawingStrokes={drawingStrokes}
                        selectedType={
                            mode === 'text' && selectedTextId ? 'text' :
                            mode === 'image' && selectedImageLayerId ? 'imageLayer' :
                            mode === 'draw' && selectedDrawingId ? 'drawing' :
                            mode === 'move' ? 'mainImage' :
                            null
                        }
                        selectedId={
                            mode === 'text' ? selectedTextId :
                            mode === 'image' ? selectedImageLayerId :
                            mode === 'draw' ? selectedDrawingId :
                            mode === 'move' ? 'main' :
                            null
                        }
                        onMoveUp={handleLayerMoveUp}
                        onMoveDown={handleLayerMoveDown}
                        onSelect={handleLayerSelect}
                        getLayerName={(item) => getLayerDisplayName(item, textObjects, imageLayers, drawingStrokes)}
                    />
                </CollapsiblePanel>
             )}

        </div>

        <div className="px-3 py-2 border-t bg-gray-50 rounded-b-xl shrink-0 flex flex-wrap items-center justify-center gap-2">
             <div className="flex flex-wrap gap-1 items-center justify-center">
                 <ModeSelector
                    mode={mode} onModeChange={handleModeChange} eraserSize={eraserSize} onEraserSizeChange={setEraserSize} hasOriginalImage={!!originalImage}
                    onAddText={handleAddText} onAddImageLayer={handleAddImageLayer}
                    onReset={() => {
                        addToHistory({}); setScale(initialScale ?? stamp.scale); setRotation(initialRotation ?? stamp.rotation ?? 0); setOffset(initialOffset ?? {x:0, y:0});
                        setFlipH(stamp.flipH ?? false); setFlipV(stamp.flipV ?? false); setTolerance(stamp.currentTolerance || 50); setWorkingDataUrl(stamp.dataUrl); 
                        setTextObjects(initialTextObjects ?? stamp.textObjects ?? []); setImageLayers(initialImageLayers ?? stamp.imageLayers ?? []); setDrawingStrokes(initialDrawingStrokes ?? stamp.drawingStrokes ?? []);
                        setMainImageLayerOrder(stamp.mainImageLayerOrder ?? 100); setSelectedDrawingId(null);
                    }}
                    onOpenMaterialLibrary={() => setShowMaterialLibrary(true)} materialsCount={materials.length}
                 />
             </div>
             <div className="flex items-center gap-2 shrink-0">
                <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition">キャンセル</button>
                <button onClick={handleSave} className="px-4 py-1.5 text-sm bg-primary-600 text-white font-bold rounded-lg shadow hover:bg-primary-700 transition flex items-center gap-1">
                    <Check size={16} /> 完了
                </button>
             </div>
        </div>

        {showMaterialLibrary && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 rounded-xl" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                <h4 className="font-bold text-gray-700 flex items-center gap-2"><Layers size={18} className="text-purple-500" />素材ライブラリ</h4>
                <button onClick={() => setShowMaterialLibrary(false)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                {materials.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">保存された素材はありません。<br/>画像レイヤーを追加した後、<br/>「素材として保存」で登録できます。</p>
                ) : (
                    <div className="grid grid-cols-3 gap-3">
                    {materials.map(mat => (
                        <div key={mat.id} className="flex flex-col items-center">
                            <div role="button" tabIndex={0} onClick={() => handleAddFromMaterial(mat)} className="w-full aspect-square rounded-lg border-2 border-gray-200 overflow-hidden hover:border-purple-400 transition bg-gray-50 p-2 cursor-pointer relative">
                                <img src={mat.dataUrl} alt={mat.name} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                            </div>
                            <div className="flex items-center justify-between w-full mt-1 px-1">
                                <p className="text-[10px] text-gray-400 truncate flex-1">{mat.name}</p>
                                <button type="button" onClick={() => handleDeleteMaterialItem(mat.id)} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="text-gray-300 hover:text-red-500 active:text-red-600 transition p-1 shrink-0 cursor-pointer rounded hover:bg-red-50 active:bg-red-100" title="素材を削除"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))}
                    </div>
                )}
                </div>
            </div>
            </div>
        )}
        {toastMessage && (<div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg pointer-events-none whitespace-nowrap animate-[fadeIn_0.3s_ease-in-out]">{toastMessage}</div>)}
      </div>
    </div>
  );
};