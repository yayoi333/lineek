import React from 'react';
import { Trash2, Layers, Minus } from 'lucide-react';
import { DrawingStroke } from '../../types';
import { ControlSlider } from './ControlSlider';

interface DrawingPanelProps {
  penColor: string;
  penWidth: number;
  penOpacity: number;
  penZIndex: 'front' | 'back';
  penOutlineColor: string;
  penOutlineWidth: number;
  strokes: DrawingStroke[];
  onPenColorChange: (color: string) => void;
  onPenWidthChange: (width: number) => void;
  onPenOpacityChange: (opacity: number) => void;
  onPenZIndexChange: (zIndex: 'front' | 'back') => void;
  onPenOutlineColorChange: (color: string) => void;
  onPenOutlineWidthChange: (width: number) => void;
  onClearAll: () => void;
  onDeleteLast: () => void;
}

export const DrawingPanel: React.FC<DrawingPanelProps> = ({
  penColor,
  penWidth,
  penOpacity,
  penZIndex,
  penOutlineColor,
  penOutlineWidth,
  strokes,
  onPenColorChange,
  onPenWidthChange,
  onPenOpacityChange,
  onPenZIndexChange,
  onPenOutlineColorChange,
  onPenOutlineWidthChange,
  onClearAll,
  onDeleteLast
}) => {
  const textColorOptions = ['#000000', '#FFFFFF', '#ef4444', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#4b3621'];
  const outlineColorOptions = ['#ffffff', '#000000', '#ef4444', '#3b82f6'];

  return (
     <div className="flex flex-col gap-3">
        {/* 1. Color Selection */}
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 shrink-0">色</span>
            {textColorOptions.map(c => (
                <button
                    key={c}
                    onClick={() => onPenColorChange(c)}
                    className={`w-5 h-5 rounded-full border border-gray-300 ${penColor === c ? 'ring-2 ring-orange-500' : ''}`}
                    style={{ backgroundColor: c }}
                />
            ))}
            <label className="w-5 h-5 rounded border-2 border-gray-300 overflow-hidden cursor-pointer relative"
                style={{ backgroundColor: penColor }}>
                <input 
                    type="color" 
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    value={penColor}
                    onChange={(e) => onPenColorChange(e.target.value)}
                />
            </label>
        </div>
        
        {/* 2. Width & Opacity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ControlSlider 
                label="太さ" 
                value={penWidth} 
                min={1} max={30} step={1}
                onChange={onPenWidthChange}
                unit="px"
            />
            <ControlSlider 
                label="透明度" 
                value={penOpacity} 
                min={0.1} max={1.0} step={0.05}
                onChange={onPenOpacityChange}
                unit="%"
            />
        </div>

        {/* 3. Outline Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ControlSlider
                label="縁取り"
                value={penOutlineWidth}
                min={0}
                max={20}
                step={1}
                onChange={onPenOutlineWidthChange}
                unit="px"
            />
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-12 shrink-0">縁色</span>
                {outlineColorOptions.map(c => (
                    <button
                        key={c}
                        onClick={() => onPenOutlineColorChange(c)}
                        className={`w-5 h-5 rounded-full border border-gray-300 ${penOutlineColor === c ? 'ring-2 ring-orange-500' : ''}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
                <label className="w-5 h-5 rounded border-2 border-gray-300 overflow-hidden cursor-pointer relative"
                    style={{ backgroundColor: penOutlineColor }}>
                    <input 
                        type="color" 
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        value={penOutlineColor}
                        onChange={(e) => onPenOutlineColorChange(e.target.value)}
                    />
                </label>
            </div>
        </div>

        {/* 4. Controls */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-orange-200/50">
            <button 
                onClick={() => onPenZIndexChange(penZIndex === 'front' ? 'back' : 'front')}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${penZIndex === 'front' ? 'bg-orange-200 border-orange-300' : 'bg-white border-gray-300'}`}
            >
                <Layers size={14}/>
                {penZIndex === 'front' ? '画像の上に描く' : '画像の下に描く'}
            </button>

            <button 
                onClick={onDeleteLast}
                disabled={strokes.length === 0}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border bg-white border-gray-300 hover:bg-gray-100 disabled:opacity-50 text-gray-700"
            >
                <Minus size={14}/>
                1つ消す
            </button>

            <button 
                onClick={onClearAll}
                disabled={strokes.length === 0}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border bg-white border-red-200 hover:bg-red-50 text-red-600 disabled:opacity-50"
            >
                <Trash2 size={14}/>
                全消し
            </button>
        </div>
     </div>
  );
};