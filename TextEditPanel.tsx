import React from 'react';
import { Trash2, Save } from 'lucide-react';
import { ImageLayerObject } from '../../types';
import { ControlSlider } from './ControlSlider';

interface ImageLayerPanelProps {
  selectedLayer: ImageLayerObject;
  onUpdateLayer: (id: string, updates: Partial<ImageLayerObject>) => void;
  onDeleteLayer: () => void;
  onSaveAsMaterial: () => void;
  onCommit: () => void;
}

export const ImageLayerPanel: React.FC<ImageLayerPanelProps> = ({
  selectedLayer,
  onUpdateLayer,
  onDeleteLayer,
  onSaveAsMaterial,
  onCommit
}) => {
  return (
     <div className="flex flex-col gap-3">
         <div className="flex items-center justify-between gap-4">
             <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">ID: {selectedLayer.id.slice(-4)}</span>
             </div>

             <div className="flex items-center gap-1">
                <button 
                    onClick={onSaveAsMaterial}
                    className="flex items-center gap-1 text-purple-600 text-xs px-2 py-1 hover:bg-purple-100 rounded border border-purple-200 transition"
                    title="素材ライブラリに保存"
                >
                    <Save size={14} />
                    素材を保存
                </button>
                <button onClick={onDeleteLayer} className="text-red-500 p-1 hover:bg-red-100 rounded">
                    <Trash2 size={18} />
                </button>
             </div>
         </div>
         
         <div className="flex flex-col gap-2 pt-2 border-t border-purple-200/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ControlSlider 
                    label="サイズ" 
                    value={selectedLayer.scale} 
                    min={0.05} max={3.0} step={0.01}
                    onChange={(val: number) => onUpdateLayer(selectedLayer.id, { scale: val })}
                    onCommit={onCommit}
                  />
                  <ControlSlider 
                    label="回転" 
                    value={selectedLayer.rotation} 
                    min={-180} max={180} step={1}
                    onChange={(val: number) => onUpdateLayer(selectedLayer.id, { rotation: val })}
                    onCommit={onCommit}
                    unit="°"
                  />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <ControlSlider 
                    label="透明度" 
                    value={selectedLayer.opacity} 
                    min={0} max={1} step={0.01}
                    onChange={(val: number) => onUpdateLayer(selectedLayer.id, { opacity: val })}
                    onCommit={onCommit}
                    unit="%"
                  />
              </div>
         </div>
     </div>
  );
};