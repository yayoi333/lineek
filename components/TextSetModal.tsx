import React, { useState } from 'react';
import { TextObject, Stamp, TARGET_WIDTH, TARGET_HEIGHT } from '../types';
import { X, Check, Layers, AlignVerticalJustifyCenter, AlignHorizontalJustifyCenter, Type } from 'lucide-react';
import { ControlSlider } from './editor/ControlSlider';

interface TextSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  stamps: Stamp[];
  onApply: (updatedStamps: Stamp[]) => void;
}

export const TextSetModal: React.FC<TextSetModalProps> = ({ isOpen, onClose, stamps, onApply }) => {
  const [rawText, setRawText] = useState('');
  const [fontSize, setFontSize] = useState(40);
  const [fontFamily, setFontFamily] = useState('M PLUS Rounded 1c');
  const [color, setColor] = useState('#000000');
  const [outlineColor, setOutlineColor] = useState('#FFFFFF');
  const [outlineWidth, setOutlineWidth] = useState(4);
  const [isVertical, setIsVertical] = useState(false);
  const [zIndex, setZIndex] = useState<'front' | 'back'>('front');
  const [position, setPosition] = useState<'top' | 'center' | 'bottom'>('bottom');

  if (!isOpen) return null;

  const validStamps = stamps.filter(s => !s.isExcluded);
  const lines = rawText.split('\n');
  const filledLinesCount = lines.filter(l => l.trim()).length;

  const fontOptions = [
      { value: 'M PLUS Rounded 1c', label: '丸ゴシック' },
      { value: 'Noto Sans JP', label: 'ゴシック' },
      { value: 'Noto Serif JP', label: '明朝' },
  ];
  const textColorOptions = ['#000000', '#FFFFFF', '#ef4444', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#4b3621'];

  const presets = [
      { label: '日常', texts: 'おはよう\nこんにちは\nこんばんは\nおやすみ\nありがとう\nごめんね\nOK!\nよろしく' },
      { label: '感情', texts: 'うれしい！\nかなしい…\nたのしい♪\nびっくり！\nおこ！\nてれてれ\nすき♡\nわーい！' },
      { label: '返事', texts: 'OK!\nNG!\nYes!\nNo!\n了解！\nりょ\nおけ！\nむり〜' },
  ];

  const handleApply = () => {
    const updatedStamps = stamps.map(stamp => {
      if (stamp.isExcluded) return stamp;
      
      const validIndex = validStamps.findIndex(s => s.id === stamp.id);
      if (validIndex === -1 || validIndex >= lines.length) return stamp;
      
      const text = lines[validIndex].trim();
      if (!text) return stamp;
      
      let posX: number;
      let posY: number;

      if (isVertical) {
        // 縦書き：Y は常に中央、X を左右で調整
        posY = TARGET_HEIGHT * 0.5;
        if (position === 'top') posX = TARGET_WIDTH * 0.85;       // 右寄せ
        else if (position === 'center') posX = TARGET_WIDTH * 0.5; // 中央
        else posX = TARGET_WIDTH * 0.15;                           // 左寄せ
      } else {
        // 横書き：X は常に中央、Y を上中下で調整
        posX = TARGET_WIDTH / 2;
        if (position === 'top') posY = TARGET_HEIGHT * 0.15;
        else if (position === 'center') posY = TARGET_HEIGHT * 0.5;
        else posY = TARGET_HEIGHT * 0.85;
      }
      
      const newTextObj: TextObject = {
        id: 'txt-set-' + Date.now().toString() + '-' + validIndex,
        text: text,
        x: posX,
        y: posY,
        fontSize: fontSize,
        fontFamily: fontFamily,
        color: color,
        isVertical: isVertical,
        outlineColor: outlineColor,
        outlineWidth: outlineWidth,
        zIndex: zIndex,
        rotation: 0,
        curvature: 0,
        // Default layer order for bulk added text (always front relative to each other)
        layerOrder: 150 + validIndex,
      };
      
      const existingTexts = stamp.textObjects ?? [];
      if (existingTexts.length >= 3) return stamp;
      
      return {
        ...stamp,
        textObjects: [...existingTexts, newTextObj],
      };
    });
    
    onApply(updatedStamps);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex justify-between items-center bg-blue-50 rounded-t-xl shrink-0">
          <h3 className="font-bold text-gray-700 flex items-center gap-2">
            <Type className="text-blue-600" />
            テキスト一括追加
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={20} /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* Input Section */}
            <div>
                <div className="flex flex-wrap gap-2 mb-2 items-center">
                    <span className="text-xs font-bold text-gray-500">プリセット:</span>
                    {presets.map(p => (
                        <button key={p.label} onClick={() => setRawText(p.texts)} className="text-xs bg-gray-100 hover:bg-blue-100 px-2 py-1 rounded border hover:text-blue-700 transition">
                            {p.label}
                        </button>
                    ))}
                </div>
                <textarea 
                    className="w-full border-gray-300 rounded-lg text-sm p-3 focus:ring-blue-500 focus:border-blue-500"
                    rows={6}
                    placeholder="1行に1つずつテキストを入力&#13;&#10;例:&#13;&#10;おはよう&#13;&#10;こんにちは"
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                    有効なスタンプ {validStamps.length}個 に対して、上から順に1つずつ割り当てます。
                    空行はスキップされます。
                </p>
            </div>

            {/* Style Settings */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col gap-3">
                <div className="flex gap-2">
                    <select 
                        value={fontFamily} 
                        onChange={(e) => setFontFamily(e.target.value)}
                        className="text-sm border-gray-300 rounded flex-1"
                    >
                        {fontOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="text-xs text-gray-500 shrink-0">文字色</span>
                    {textColorOptions.map(c => (
                        <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border shrink-0 ${color === c ? 'ring-2 ring-blue-500' : 'border-gray-300'}`} style={{ backgroundColor: c }} />
                    ))}
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 rounded overflow-hidden cursor-pointer border-0 p-0" />
                </div>

                <div className="flex flex-col gap-3">
                    <ControlSlider label="サイズ" value={fontSize} min={10} max={120} onChange={setFontSize} />
                    <div className="flex items-center gap-2 w-full">
                        <div className="flex-1 min-w-0">
                            <ControlSlider label="縁取り" value={outlineWidth} min={0} max={20} onChange={setOutlineWidth} />
                        </div>
                        <input type="color" value={outlineColor} onChange={e => setOutlineColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0" />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-blue-200/50 justify-center items-center">
                    <button onClick={() => setIsVertical(!isVertical)} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded border transition ${isVertical ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                        {isVertical ? <AlignVerticalJustifyCenter size={14}/> : <AlignHorizontalJustifyCenter size={14}/>} {isVertical ? '縦書き' : '横書き'}
                    </button>
                    <button onClick={() => setZIndex(zIndex === 'front' ? 'back' : 'front')} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded border transition ${zIndex === 'front' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                        <Layers size={14}/> {zIndex === 'front' ? '前面' : '背面'}
                    </button>
                    
                    <div className="flex gap-1">
                        {isVertical ? (
                            <>
                            <button type="button" onClick={() => setPosition('bottom')} className={`px-3 py-1.5 rounded border text-xs ${position === 'bottom' ? 'bg-blue-200 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-600'}`} title="左寄せ">左</button>
                            <button type="button" onClick={() => setPosition('center')} className={`px-3 py-1.5 rounded border text-xs ${position === 'center' ? 'bg-blue-200 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-600'}`} title="中央">中</button>
                            <button type="button" onClick={() => setPosition('top')} className={`px-3 py-1.5 rounded border text-xs ${position === 'top' ? 'bg-blue-200 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-600'}`} title="右寄せ">右</button>
                            </>
                        ) : (
                            <>
                            <button type="button" onClick={() => setPosition('top')} className={`px-3 py-1.5 rounded border text-xs ${position === 'top' ? 'bg-blue-200 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-600'}`} title="上部">上</button>
                            <button type="button" onClick={() => setPosition('center')} className={`px-3 py-1.5 rounded border text-xs ${position === 'center' ? 'bg-blue-200 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-600'}`} title="中央">中</button>
                            <button type="button" onClick={() => setPosition('bottom')} className={`px-3 py-1.5 rounded border text-xs ${position === 'bottom' ? 'bg-blue-200 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-600'}`} title="下部">下</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">キャンセル</button>
            <button onClick={handleApply} disabled={filledLinesCount === 0} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm">
                <Check size={16} /> 一括追加
            </button>
        </div>
      </div>
    </div>
  );
};
