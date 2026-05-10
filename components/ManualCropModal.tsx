import React, { useRef, useState, useEffect } from 'react';
import { X, Crop, Check, Plus, Upload } from 'lucide-react';
import { Stamp, SourceImage, TARGET_WIDTH, TARGET_HEIGHT } from '../types';
import { removeBackground } from '../lib/imageProcessing';

interface Props {
  sourceImages: SourceImage[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (stamps: Stamp | Stamp[]) => void;
  onAddSource: (file: File) => Promise<string | void>;
  initialSourceId?: string;
  bgTolerance?: number;
}

export const ManualCropModal: React.FC<Props> = ({ sourceImages, isOpen, onClose, onConfirm, onAddSource, initialSourceId, bgTolerance = 20 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [dragMode, setDragMode] = useState<'create' | 'move' | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [dragStartSelection, setDragStartSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string>(initialSourceId || sourceImages[0]?.id || '');
  const [horizontalSegments, setHorizontalSegments] = useState<number>(1);

  useEffect(() => {
    if (isOpen) {
        setSelection(null);
        setHorizontalSegments(1);
        // Use initialSourceId if provided and valid
        if (initialSourceId && sourceImages.find(img => img.id === initialSourceId)) {
            setActiveSourceId(initialSourceId);
        } 
        // Fallback if current active is invalid
        else if (!sourceImages.find(img => img.id === activeSourceId)) {
            setActiveSourceId(sourceImages[0]?.id || '');
        }
    }
  }, [isOpen, initialSourceId, sourceImages]); 

  // Don't depend on activeSourceId in the useEffect deps to avoid resetting when changing images inside modal
  // But we need to ensure valid source.

  const activeImage = sourceImages.find(img => img.id === activeSourceId);

  // --- Pointer/Touch Events ---
  const getClientCoords = (e: React.MouseEvent | React.TouchEvent) => {
      if ('touches' in e) {
          return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
          return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
      }
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!imgRef.current) return;
    if (e.type === 'touchstart') e.preventDefault(); // Prevent scrolling

    const rect = imgRef.current.getBoundingClientRect();
    const { x: clientX, y: clientY } = getClientCoords(e);
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Check if clicking inside current selection to move it
    if (selection && x >= selection.x && x <= selection.x + selection.w && y >= selection.y && y <= selection.y + selection.h) {
        setDragMode('move');
        setDragStartSelection({ ...selection });
        setStartPos({ x, y });
    } else {
        setDragMode('create');
        setStartPos({ x, y });
        setSelection({ x, y, w: 0, h: 0 });
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragMode || !imgRef.current) return;
    if (e.type === 'touchmove') e.preventDefault();

    const rect = imgRef.current.getBoundingClientRect();
    const { x: clientX, y: clientY } = getClientCoords(e);
    
    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;

    if (dragMode === 'move' && dragStartSelection) {
        const dx = currentX - startPos.x;
        const dy = currentY - startPos.y;
        
        let newX = dragStartSelection.x + dx;
        let newY = dragStartSelection.y + dy;
        
        // No clamping to image bounds - allow overflow
        setSelection({
            ...dragStartSelection,
            x: newX,
            y: newY
        });
        return;
    }

    let w = currentX - startPos.x;
    let h = currentY - startPos.y;

    // Aspect Ratio: w = h * horizontalSegments
    const ratio = horizontalSegments; 
    const absW = Math.abs(w);
    const absH = Math.abs(h);

    if (absW > absH * ratio) {
        // Width is larger than target ratio, adjust height
        const targetH = absW / ratio;
        h = (h >= 0 ? 1 : -1) * targetH;
    } else {
        // Height is larger than target ratio, adjust width
        const targetW = absH * ratio;
        w = (w >= 0 ? 1 : -1) * targetW;
    }

    // Determine basic bounds
    let selX = w > 0 ? startPos.x : startPos.x + w;
    let selY = h > 0 ? startPos.y : startPos.y + h;
    let selW = Math.abs(w);
    let selH = Math.abs(h);

    // No clamping to image bounds - allow overflow during creation too

    setSelection({
      x: selX,
      y: selY,
      w: selW,
      h: selH
    });
  };

  const handlePointerUp = () => {
    setDragMode(null);
  };

  const handleCrop = () => {
    if (!selection || !imgRef.current || selection.w < 10 || selection.h < 10 || !activeImage) {
        alert("範囲を選択してください");
        return;
    }

    // Convert display coordinates to natural image coordinates
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

    const realXTotal = Math.floor(selection.x * scaleX);
    const realY = Math.floor(selection.y * scaleY);
    const realWTotal = Math.floor(selection.w * scaleX);
    const realH = Math.floor(selection.h * scaleY);

    const segmentWidth = Math.floor(realWTotal / horizontalSegments);
    const resultStamps: Stamp[] = [];

    for (let i = 0; i < horizontalSegments; i++) {
        const currentRealX = realXTotal + (i * segmentWidth);
        const currentRealW = segmentWidth;

        // Create Canvas to extract and process
        const canvas = document.createElement('canvas');
        canvas.width = currentRealW;
        canvas.height = realH;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        // Draw the cropped area, handling potential overflow (parts outside the image will be transparent)
        const overlapX = Math.max(currentRealX, 0);
        const overlapY = Math.max(realY, 0);
        const overlapW = Math.min(currentRealX + currentRealW, imgRef.current.naturalWidth) - overlapX;
        const overlapH = Math.min(realY + realH, imgRef.current.naturalHeight) - overlapY;

        if (overlapW > 0 && overlapH > 0) {
            const targetX = overlapX - currentRealX;
            const targetY = overlapY - realY;
            ctx.drawImage(imgRef.current, overlapX, overlapY, overlapW, overlapH, targetX, targetY, overlapW, overlapH);
        }
        
        // Save the raw cropped image for restoration
        const originalDataUrl = canvas.toDataURL('image/png');

        // Auto-remove background logic...
        const imageData = ctx.getImageData(0, 0, currentRealW, realH);
        const processedData = removeBackground(imageData, bgTolerance);
        ctx.putImageData(processedData, 0, 0);

        const padding = 0;
        const availW = TARGET_WIDTH - padding;
        const availH = TARGET_HEIGHT - padding;
        let scale = Math.min(availW / currentRealW, availH / realH);
        if (scale > 1) scale = 1;

        const stampId = `stamp-manual-${Date.now()}-${i}`;
        resultStamps.push({
            id: stampId,
            sourceImageId: activeImage.id,
            originalX: currentRealX,
            originalY: realY,
            width: currentRealW,
            height: realH,
            dataUrl: canvas.toDataURL('image/png'),
            originalDataUrl: originalDataUrl,
            isExcluded: false,
            scale: scale,
            offsetX: 0,
            offsetY: 0
        });
    }

    onConfirm(resultStamps);
  };

  const handleUploadNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          const newId = await onAddSource(e.target.files[0]);
          if (newId) setActiveSourceId(newId);
          e.target.value = ''; // Reset input to allow re-selecting same file
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full flex flex-col h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center bg-primary-50 rounded-t-xl shrink-0">
            <div className="flex items-center gap-2">
                <Crop className="text-primary-600" />
                <div>
                    <h3 className="font-bold text-gray-700">手動で切り出し</h3>
                    <p className="text-xs text-gray-500">元画像から範囲を選択してください（絵文字は1:1比率固定）</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    <span className="text-xs font-bold text-gray-500">横の数:</span>
                    <input 
                        type="number" 
                        min="1" 
                        max="9" 
                        value={horizontalSegments} 
                        onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setHorizontalSegments(Math.max(1, Math.min(9, val)));
                            setSelection(null);
                        }}
                        className="w-12 text-center border rounded font-mono text-sm"
                    />
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition"><X size={20} /></button>
            </div>
        </div>
        
        {/* Source Image Selector */}
        <div className="bg-gray-100 p-2 flex gap-2 overflow-x-auto border-b shrink-0">
            {sourceImages.map(img => (
                <button
                    key={img.id}
                    onClick={() => { setActiveSourceId(img.id); setSelection(null); }}
                    className={`relative w-16 h-16 rounded-md overflow-hidden border-2 flex-shrink-0 transition ${activeSourceId === img.id ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-300 opacity-60 hover:opacity-100'}`}
                >
                    <img src={img.url} alt="thumb" className="w-full h-full object-cover" />
                </button>
            ))}
            {/* Always allow adding in Manual Crop mode */}
            <label className="w-16 h-16 rounded-md border-2 border-dashed border-gray-400 flex flex-col items-center justify-center text-gray-500 bg-gray-50 hover:bg-white cursor-pointer flex-shrink-0">
                <Plus size={16} />
                <span className="text-[10px]">追加</span>
                <input type="file" className="hidden" accept="image/png, image/jpeg" onChange={handleUploadNew} />
            </label>
        </div>

        {/* Change: Remove items-center justify-center from the scrollable container to prevent top/left clipping when scrolled */}
        <div 
            className="flex-1 overflow-auto p-4 bg-gray-900 relative select-none" 
            ref={containerRef}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
        >
            {/* Wrap in a flex container that grows to ensure centering only if image is smaller than container */}
            <div className="min-w-full min-h-full flex items-center justify-center">
                {activeImage ? (
                    <div className="relative inline-block touch-none">
                        <img 
                            ref={imgRef}
                            src={activeImage.url} 
                            className="max-w-none pointer-events-none" // Use max-w-none to allow natural size scrolling
                            style={{ maxWidth: '100%' }}
                            alt="Original"
                        />
                        {/* Overlay for selection - now just for visual reference, events moved to container */}
                        <div 
                            className="absolute inset-0 cursor-crosshair pointer-events-none"
                        >
                            {selection && (
                                <div 
                                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex pointer-events-none"
                                    style={{
                                        left: selection.x,
                                        top: selection.y,
                                        width: selection.w,
                                        height: selection.h
                                    }}
                                >
                                    {horizontalSegments > 1 && Array.from({ length: horizontalSegments }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            className={`h-full flex-1 ${i < horizontalSegments - 1 ? 'border-r border-white/60 border-dashed' : ''}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-white">画像を選択してください</div>
                )}
            </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-xl shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition">キャンセル</button>
          <button onClick={handleCrop} className="px-6 py-2 bg-primary-600 text-white font-bold rounded-lg shadow hover:bg-primary-700 transition flex items-center gap-2">
            <Check size={18} /> この範囲で作成
          </button>
        </div>
      </div>
    </div>
  );
};