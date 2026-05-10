import React, { useRef, useEffect } from 'react';
import { ZoomOut, ZoomIn, Undo, Redo, Crop } from 'lucide-react';

interface EditorToolbarProps {
  viewZoom: number;
  onViewZoomChange: (zoom: number) => void;
  historyIndex: number;
  historyLength: number;
  onUndo: () => void;
  onRedo: () => void;
  onReCrop?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  viewZoom,
  onViewZoomChange,
  historyIndex,
  historyLength,
  onUndo,
  onRedo,
  onReCrop
}) => {
  const zoomIntervalRef = useRef<number | null>(null);
  const currentZoomRef = useRef(viewZoom);

  useEffect(() => {
      currentZoomRef.current = viewZoom;
  }, [viewZoom]);

  const cleanupZoom = () => {
      if (zoomIntervalRef.current) {
          clearInterval(zoomIntervalRef.current);
          zoomIntervalRef.current = null;
      }
  };

  // Cleanup on unmount
  useEffect(() => {
      return () => cleanupZoom();
  }, []);

  const handleZoomPointerDown = (e: React.PointerEvent, direction: 'in' | 'out') => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      cleanupZoom();

      const step = 0.05;
      const update = () => {
         const z = currentZoomRef.current;
         const ns = direction === 'in' ? Math.min(5, z + step) : Math.max(0.3, z - step);
         onViewZoomChange(ns);
      };
      
      // Immediate
      update();
      
      // Continuous
      zoomIntervalRef.current = window.setInterval(update, 50);
  };

  const handleZoomPointerUp = (e: React.PointerEvent) => {
      cleanupZoom();
  };

  return (
    <div className="px-2 py-1 flex flex-wrap justify-center gap-2 md:gap-3 items-center">
         <div className="flex items-center gap-1 md:gap-2 bg-white px-2 py-1 rounded shadow-sm">
            <span className="text-xs text-gray-500 hidden sm:inline">表示倍率:</span>
            <button 
                onPointerDown={(e) => handleZoomPointerDown(e, 'out')} 
                onPointerUp={handleZoomPointerUp} 
                onPointerLeave={handleZoomPointerUp}
                className="p-1 hover:bg-gray-100 rounded touch-none"
                style={{ touchAction: 'none' }}
            ><ZoomOut size={16}/></button>
            <span className="text-sm font-mono w-10 text-center">{(viewZoom * 100).toFixed(0)}%</span>
            <button 
                onPointerDown={(e) => handleZoomPointerDown(e, 'in')} 
                onPointerUp={handleZoomPointerUp} 
                onPointerLeave={handleZoomPointerUp}
                className="p-1 hover:bg-gray-100 rounded touch-none"
                style={{ touchAction: 'none' }}
            ><ZoomIn size={16}/></button>
         </div>
         
         <div className="flex items-center gap-1">
             <button onClick={onUndo} disabled={historyIndex <= 0} className="p-2 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white text-gray-600"><Undo size={18} /></button>
             <button onClick={onRedo} disabled={historyIndex >= historyLength - 1} className="p-2 bg-white rounded shadow-sm hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white text-gray-600"><Redo size={18} /></button>
         </div>

         {onReCrop && (
            <button onClick={onReCrop} className="flex items-center gap-1 text-xs bg-white text-gray-700 px-3 py-1.5 rounded shadow-sm hover:bg-gray-100 border border-gray-200">
                <Crop size={14} /> <span className="hidden sm:inline">再切り出し</span>
            </button>
         )}
    </div>
  );
};