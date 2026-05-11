import React from 'react';
import { ControlSlider } from './ControlSlider';
import { FlipHorizontal, FlipVertical } from 'lucide-react';

interface ImageControlPanelProps {
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  onScaleChange: (value: number) => void;
  onRotationChange: (value: number) => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onCommit: () => void;
}

export const ImageControlPanel: React.FC<ImageControlPanelProps> = ({
  scale,
  rotation,
  flipH,
  flipV,
  onScaleChange,
  onRotationChange,
  onFlipH,
  onFlipV,
  onCommit
}) => {
  return (
     <div className="flex flex-col gap-2">
         <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 w-12 shrink-0">反転</span>
            <button
              onClick={onFlipH}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded border transition
                ${flipH ? 'bg-primary-100 border-primary-300 text-primary-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              <FlipHorizontal size={14} />
              左右
            </button>
            <button
              onClick={onFlipV}
              className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded border transition
                ${flipV ? 'bg-primary-100 border-primary-300 text-primary-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            >
              <FlipVertical size={14} />
              上下
            </button>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ControlSlider 
                label="サイズ" 
                value={Number(scale.toFixed(2))} 
                min={0.01} max={3.0} step={0.01}
                onChange={onScaleChange}
                onCommit={onCommit}
            />
            <ControlSlider 
                label="回転" 
                value={Math.round(rotation)} 
                min={-180} max={180} step={1}
                onChange={onRotationChange}
                onCommit={onCommit}
                unit="°"
            />
         </div>
     </div>
  );
};