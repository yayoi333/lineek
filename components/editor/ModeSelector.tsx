import React from 'react';
import { Move, Type, Wand2, Eraser, Pencil, Plus, RotateCcw, Image as ImageIcon, PenTool, Layers } from 'lucide-react';

interface ModeSelectorProps {
  mode: string;
  onModeChange: (mode: 'move' | 'eraser' | 'wand' | 'restore' | 'text' | 'image' | 'draw') => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  hasOriginalImage: boolean;
  onAddText: () => void;
  onAddImageLayer?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onOpenMaterialLibrary: () => void;
  materialsCount: number;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  mode,
  onModeChange,
  eraserSize,
  onEraserSizeChange,
  hasOriginalImage,
  onAddText,
  onAddImageLayer,
  onReset,
  onOpenMaterialLibrary,
  materialsCount
}) => {
  return (
     <div className="flex flex-wrap gap-4 justify-center items-center">
         {/* Mode Selection */}
         <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg overflow-x-auto max-w-full">
            <button 
            onClick={() => onModeChange('move')} 
            className={`p-2 rounded ${mode === 'move' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="画像移動"
            >
            <Move size={20} />
            </button>
            <button 
            onClick={() => onModeChange('text')} 
            className={`p-2 rounded ${mode === 'text' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="文字入れ"
            >
            <Type size={20} />
            </button>
            <button 
            onClick={() => onModeChange('image')} 
            className={`p-2 rounded ${mode === 'image' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="画像レイヤー"
            >
            <ImageIcon size={20} />
            </button>
            <button 
            onClick={() => onModeChange('draw')} 
            className={`p-2 rounded ${mode === 'draw' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="手書き"
            >
            <PenTool size={20} />
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            
            <button 
            onClick={() => onModeChange('wand')} 
            className={`p-2 rounded ${mode === 'wand' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="追加透過"
            >
            <Wand2 size={20} />
            </button>
            <button 
            onClick={() => onModeChange('eraser')} 
            className={`p-2 rounded ${mode === 'eraser' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            title="消しゴム"
            >
            <Eraser size={20} />
            </button>
            <button 
            onClick={() => onModeChange('restore')} 
            disabled={!hasOriginalImage}
            className={`p-2 rounded ${mode === 'restore' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'} disabled:opacity-30`}
            title="復元"
            >
            <Pencil size={20} />
            </button>
         </div>

         {/* Text Add Button */}
         {mode === 'text' && (
             <button 
                onClick={onAddText}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg shadow font-bold text-sm flex items-center gap-1 hover:bg-blue-700"
             >
                 <Plus size={16} /> 文字追加
             </button>
         )}

         {/* Image Add Button */}
         {mode === 'image' && (
             <div className="flex items-center gap-2">
                <label className="bg-purple-600 text-white px-3 py-2 rounded-lg shadow font-bold text-sm flex items-center gap-1 hover:bg-purple-700 cursor-pointer">
                    <Plus size={16} /> 画像追加
                    <input 
                        type="file" 
                        accept="image/png,image/jpeg" 
                        className="hidden" 
                        onChange={onAddImageLayer}
                    />
                </label>
                {materialsCount > 0 && (
                    <button
                    onClick={onOpenMaterialLibrary}
                    className="bg-white text-purple-600 border-2 border-purple-300 px-3 py-2 rounded-lg 
                        shadow-sm font-bold text-sm flex items-center gap-1 hover:bg-purple-50"
                    >
                    <Layers size={16} /> 素材から ({materialsCount})
                    </button>
                )}
             </div>
         )}
        
        <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
            <button 
                onClick={onReset}
                className="flex items-center gap-1 text-xs text-gray-600 px-2 py-1 hover:bg-white rounded"
            >
                <RotateCcw size={14} /> <span className="hidden sm:inline">リセット</span>
            </button>
        </div>
     </div>
  );
};