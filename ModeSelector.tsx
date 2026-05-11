import React from 'react';
import { ChevronUp, ChevronDown, Image, Type, Pen, Star } from 'lucide-react';
import { LayerItem } from '../../lib/layerUtils';
import { TextObject, ImageLayerObject, DrawingStroke } from '../../types';

interface LayerOrderPanelProps {
  layers: LayerItem[];
  textObjects: TextObject[];
  imageLayers: ImageLayerObject[];
  drawingStrokes: DrawingStroke[];
  selectedType?: 'text' | 'imageLayer' | 'drawing' | 'mainImage' | null;
  selectedId?: string | null;
  onMoveUp: (type: string, id: string) => void;
  onMoveDown: (type: string, id: string) => void;
  onSelect: (type: string, id: string) => void;
  getLayerName: (item: LayerItem) => string;
}

export const LayerOrderPanel: React.FC<LayerOrderPanelProps> = ({
  layers, textObjects, imageLayers, drawingStrokes,
  selectedType, selectedId, onMoveUp, onMoveDown, onSelect, getLayerName
}) => {
  // 上（前面）が上に来るように逆順で表示
  const displayLayers = [...layers].reverse();

  const getIcon = (type: string) => {
    switch (type) {
      case 'mainImage': return <Star size={12} className="text-green-500" />;
      case 'text': return <Type size={12} className="text-blue-500" />;
      case 'imageLayer': return <Image size={12} className="text-purple-500" />;
      case 'drawing': return <Pen size={12} className="text-orange-500" />;
      default: return null;
    }
  };

  const isSelected = (item: LayerItem) => {
    return item.type === selectedType && item.id === selectedId;
  };

  if (layers.length <= 1) return null;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-gray-400">レイヤー順（上が前面）</span>
      </div>
      <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {displayLayers.map((item, displayIndex) => {
          const actualIndex = layers.length - 1 - displayIndex;
          const isFirst = actualIndex === layers.length - 1; // 最前面
          const isLast = actualIndex === 0; // 最背面
          const selected = isSelected(item);

          return (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => onSelect(item.type, item.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition
                ${selected ? 'bg-primary-100 border border-primary-300' : 'hover:bg-gray-100 border border-transparent'}`}
            >
              {getIcon(item.type)}
              <span className={`flex-1 truncate ${selected ? 'font-bold text-gray-700' : 'text-gray-500'}`}>
                {getLayerName(item)}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (!isFirst) onMoveUp(item.type, item.id); }}
                  disabled={isFirst}
                  className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20 disabled:hover:bg-transparent"
                  title="1つ前面へ"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (!isLast) onMoveDown(item.type, item.id); }}
                  disabled={isLast}
                  className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-20 disabled:hover:bg-transparent"
                  title="1つ背面へ"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
