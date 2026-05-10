import React, { useRef, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface ControlSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
  unit?: string;
  showValue?: boolean;
}

export const ControlSlider: React.FC<ControlSliderProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  step = 1, 
  onChange, 
  onCommit, 
  unit = '',
  showValue = false
}) => {
    const intervalRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const localValue = useRef(value);

    useEffect(() => {
        localValue.current = value;
    }, [value]);

    const cleanup = () => {
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup();
    }, []);

    const handlePointerDown = (e: React.PointerEvent, direction: 1 | -1) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId); 
        cleanup();

        const update = () => {
           let next = localValue.current + (step * direction);
           next = Math.min(max, Math.max(min, next));
           
           if (step < 1) next = parseFloat(next.toFixed(2));
           else next = Math.round(next);
           
           localValue.current = next;
           onChange(next);
        };

        // Immediate update (single click)
        update();

        // Schedule repeat with delay (long press)
        timeoutRef.current = window.setTimeout(() => {
            intervalRef.current = window.setInterval(update, 100);
        }, 400);
    };

    const handlePointerEnd = (e: React.PointerEvent) => {
        cleanup();
        if (onCommit) onCommit();
    };

    return (
      <div className="flex items-center gap-2 w-full">
          {label && <span className="text-xs text-gray-500 w-12 shrink-0">{label}</span>}
          <button 
              onPointerDown={(e) => handlePointerDown(e, -1)}
              onPointerUp={handlePointerEnd}
              onPointerLeave={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onLostPointerCapture={handlePointerEnd}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded hover:bg-gray-200 text-gray-600 active:bg-gray-300 touch-none select-none cursor-pointer"
              style={{ touchAction: 'none' }}
          ><Minus size={14}/></button>
          <input 
              type="range" 
              min={min} 
              max={max} 
              step={step}
              value={value} 
              onChange={(e) => {
                  const v = Number(e.target.value);
                  localValue.current = v;
                  onChange(v);
              }}
              onMouseUp={onCommit}
              onTouchEnd={onCommit}
              className="flex-1 accent-primary-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <button 
              onPointerDown={(e) => handlePointerDown(e, 1)}
              onPointerUp={handlePointerEnd}
              onPointerLeave={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onLostPointerCapture={handlePointerEnd}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded hover:bg-gray-200 text-gray-600 active:bg-gray-300 touch-none select-none cursor-pointer"
              style={{ touchAction: 'none' }}
          ><Plus size={14}/></button>
          {(unit || showValue) && (
            <span className="text-xs text-gray-400 w-12 text-right font-mono shrink-0">
                {unit === '%' ? Math.round(value * 100) + '%' : (step < 1 ? value.toFixed(2) : Math.round(value))}{unit === '%' ? '' : unit}
            </span>
          )}
      </div>
    );
};