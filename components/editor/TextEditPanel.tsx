import React from 'react';
import { Trash2, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter } from 'lucide-react';
import { TextObject } from '../../types';
import { ControlSlider } from './ControlSlider';

interface TextEditPanelProps {
  selectedText: TextObject;
  onUpdateText: (id: string, updates: Partial<TextObject>) => void;
  onDeleteText: () => void;
  onCommit: () => void;
}

export const TextEditPanel: React.FC<TextEditPanelProps> = ({
  selectedText,
  onUpdateText,
  onDeleteText,
  onCommit
}) => {
  const fontOptions = [
      { value: 'M PLUS Rounded 1c', label: '丸ゴシック' },
      { value: 'Noto Sans JP', label: 'ゴシック' },
      { value: 'Noto Serif JP', label: '明朝' },
  ];

  const textColorOptions = ['#000000', '#FFFFFF', '#ef4444', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#4b3621'];

  return (
     <div className="flex flex-col gap-3">
         <div className="flex items-center gap-2">
             <input 
                type="text" 
                value={selectedText.text}
                onChange={(e) => onUpdateText(selectedText.id, { text: e.target.value })}
                className="flex-1 border-gray-300 rounded text-sm px-2 py-1"
                placeholder="テキストを入力"
             />
             <button onClick={onDeleteText} className="text-red-500 p-1 hover:bg-red-100 rounded">
                 <Trash2 size={18} />
             </button>
         </div>
         <div className="flex flex-wrap items-center gap-4">
             <select 
                value={selectedText.fontFamily}
                onChange={(e) => onUpdateText(selectedText.id, { fontFamily: e.target.value })}
                className="text-xs border-gray-300 rounded"
             >
                 {fontOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
             </select>

             <button 
                onClick={() => onUpdateText(selectedText.id, { isVertical: !selectedText.isVertical })}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${selectedText.isVertical ? 'bg-blue-200 border-blue-300' : 'bg-white border-gray-300'}`}
             >
                 {selectedText.isVertical ? <AlignVerticalJustifyCenter size={14}/> : <AlignHorizontalJustifyCenter size={14}/>}
                 {selectedText.isVertical ? '縦' : '横'}
             </button>

             {/* Colors */}
             <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-500">色</span>
                 <div className="flex gap-1 items-center">
                     {textColorOptions.map(c => (
                         <button
                            key={c}
                            onClick={() => onUpdateText(selectedText.id, { color: c })}
                            className={`w-5 h-5 rounded-full border border-gray-300 ${selectedText.color === c ? 'ring-2 ring-blue-500' : ''}`}
                            style={{ backgroundColor: c }}
                         />
                     ))}
                     <label 
                        className="w-5 h-5 rounded border-2 border-gray-300 overflow-hidden cursor-pointer relative"
                        style={{ backgroundColor: selectedText.color }}
                     >
                         <input 
                            type="color" 
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            value={selectedText.color}
                            onChange={(e) => onUpdateText(selectedText.id, { color: e.target.value })}
                         />
                     </label>
                 </div>
             </div>
         </div>
         
         <div className="flex flex-col gap-2 pt-2 border-t border-blue-200/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ControlSlider 
                    label="サイズ" 
                    value={selectedText.fontSize} 
                    min={10} max={200} step={1}
                    onChange={(val: number) => onUpdateText(selectedText.id, { fontSize: val })}
                    onCommit={onCommit}
                  />
                  <ControlSlider 
                    label="回転" 
                    value={selectedText.rotation} 
                    min={-180} max={180} step={1}
                    onChange={(val: number) => onUpdateText(selectedText.id, { rotation: val })}
                    onCommit={onCommit}
                    unit="°"
                  />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <ControlSlider 
                    label="カーブ" 
                    value={selectedText.curvature} 
                    min={-100} max={100} step={1}
                    onChange={(val: number) => onUpdateText(selectedText.id, { curvature: val })}
                    onCommit={onCommit}
                  />
                  
                  <div className="flex items-center gap-2 w-full">
                        <span className="text-xs text-gray-500 w-12 shrink-0">縁取り</span>
                        <ControlSlider 
                            label="" 
                            value={selectedText.outlineWidth} 
                            min={0} max={30} step={1}
                            onChange={(val: number) => onUpdateText(selectedText.id, { outlineWidth: val })}
                            onCommit={onCommit}
                        />
                        <label 
                            className="w-5 h-5 shrink-0 rounded border-2 border-gray-300 overflow-hidden cursor-pointer relative ml-1"
                            style={{ backgroundColor: selectedText.outlineColor }}
                        >
                         <input 
                            type="color" 
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            value={selectedText.outlineColor}
                            onChange={(e) => onUpdateText(selectedText.id, { outlineColor: e.target.value })}
                         />
                        </label>
                  </div>
              </div>
         </div>
     </div>
  );
};