import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface CollapsiblePanelProps {
  title: string;
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  summaryContent?: React.ReactNode;
  bgColor?: string;
  borderColor?: string;
  children: React.ReactNode;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title, 
  icon, 
  collapsed, 
  onToggle, 
  summaryContent, 
  bgColor = 'bg-gray-50', 
  borderColor = 'border-gray-200', 
  children
}) => {
  return (
    <div className={`${bgColor} p-3 rounded-lg border ${borderColor}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="shrink-0">{icon}</div>
          <span className="text-xs font-bold text-gray-700 shrink-0">{title}</span>
          {collapsed && summaryContent && (
            <div className="flex items-center gap-2 ml-2 overflow-hidden">
              {summaryContent}
            </div>
          )}
        </div>
        {collapsed ? 
          <ChevronDown size={16} className="text-gray-400 shrink-0" /> : 
          <ChevronUp size={16} className="text-gray-400 shrink-0" />
        }
      </button>
      {!collapsed && (
        <div className="mt-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};