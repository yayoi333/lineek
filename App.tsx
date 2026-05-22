// Developed by yayoi, 2026.
// X/Threads: @yayoi_threee

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Loader2, Image as ImageIcon, Grid, Languages, Settings, ExternalLink, Plus, X as XIcon, Save, GripVertical, Smartphone, Copy, Check, Wand2, Crop, Sliders, Move, ChevronDown, ChevronUp, Info, CheckCircle2, RotateCw, Layers, Minus, Plus as PlusIcon, Trash2, Type, Lock, Unlock } from 'lucide-react';
import { AppStep, Stamp, MetaData, ExportConfig, SourceImage, TARGET_WIDTH, TARGET_HEIGHT, MAIN_WIDTH, MAIN_HEIGHT, TAB_WIDTH, TAB_HEIGHT, TextObject, ImageLayerObject, DrawingStroke } from './types';
import { processUploadedImage, reprocessStampWithTolerance } from './lib/imageProcessing';
import { translateMeta } from './lib/gemini';
import { createAndDownloadZip, createFinalImageBlob, renderAllLayers, loadProjectFromZip } from './lib/zipService';
import { saveProject, loadProject, deleteProject, restoreSourceImages } from './lib/storage';
import { StampEditorModal } from './components/StampEditorModal';
import { ManualCropModal } from './components/ManualCropModal';
import { TextSetModal } from './components/TextSetModal';
import { removeGridLines, detectGridLines } from './lib/gridRemoval';


const StampPreview = React.memo<{ stamp: Stamp; previewBg: string }>(({ stamp, previewBg }) => {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset canvas only at the start of new render
    ctx.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    const img = new Image();
    img.onload = () => {
      const config: ExportConfig = {
        id: stamp.id,
        scale: stamp.scale,
        rotation: stamp.rotation,
        offsetX: stamp.offsetX,
        offsetY: stamp.offsetY,
        textObjects: stamp.textObjects,
        imageLayers: stamp.imageLayers,
        drawingStrokes: stamp.drawingStrokes,
        mainImageLayerOrder: stamp.mainImageLayerOrder ?? 100,
        flipH: stamp.flipH,
        flipV: stamp.flipV,
      };

      // 画像レイヤー用の画像をロード
      const layerImages = new Map<string, HTMLImageElement>();
      const layerPromises = (stamp.imageLayers ?? []).map(layer => {
        return new Promise<void>((resolve) => {
          const lImg = new Image();
          lImg.onload = () => { layerImages.set(layer.id, lImg); resolve(); };
          lImg.onerror = () => resolve();
          lImg.src = layer.dataUrl;
        });
      });

      Promise.all(layerPromises).then(() => {
        // 背景描画 (renderAllLayers が clearRect しなくなったため、ここで描画すれば保持される)
        if (previewBg === 'checker') {
          const size = 10;
          for (let y = 0; y < TARGET_HEIGHT; y += size) {
            for (let x = 0; x < TARGET_WIDTH; x += size) {
              ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#f3f4f6' : '#e5e7eb';
              ctx.fillRect(x, y, size, size);
            }
          }
        } else {
          ctx.fillStyle = previewBg;
          ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
        }

        renderAllLayers(ctx, img, config, TARGET_WIDTH, TARGET_HEIGHT, layerImages);
      });
    };
    img.src = stamp.dataUrl;
  }, [stamp, previewBg]);

  return (
    <canvas
      ref={previewCanvasRef}
      width={TARGET_WIDTH}
      height={TARGET_HEIGHT}
      className="w-full h-full pointer-events-none"
    />
  );
});

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSave }) => {
  const [key, setKey] = useState(localStorage.getItem('gemini_api_key') || '');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in border border-gray-100">
        <div className="p-6 pb-2 flex justify-between items-center">
          <div className="flex items-center gap-2 text-emerald-500">
             <Settings size={22} />
             <h2 className="text-xl font-bold text-gray-800">Gemini APIキー設定</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100">
            <XIcon size={24} />
          </button>
        </div>
        <div className="p-6 pt-2 space-y-5">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-blue-700 text-[13px] leading-relaxed">
            <p className="font-bold mb-0.5">AI翻訳機能を使うにはGemini APIキーが必要です</p>
            <p className="opacity-80">APIキーはブラウザに保存され、サーバーには送信されません。</p>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">APIキー</label>
            <input 
              type="password" 
              value={key} 
              onChange={(e) => setKey(e.target.value)} 
              placeholder="ここにAPIキーを入力"
              className="w-full px-4 py-3.5 bg-white border-2 border-gray-100 rounded-2xl focus:border-emerald-500 outline-none transition-all placeholder:text-gray-300 text-sm"
            />
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
             <p className="text-xs font-bold text-gray-500 mb-2">APIキーの取得方法:</p>
             <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                <li><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline font-bold">Google AI Studio</a> にアクセス</li>
                <li>「APIキーを作成」をクリック</li>
                <li>作成されたキーをコピーして上に貼り付け</li>
             </ol>
             <p className="text-[10px] text-gray-400 mt-3 leading-tight italic">※ Gemini APIは無料枠があります。翻訳程度なら無料で使えます。</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button 
              onClick={() => { localStorage.removeItem('gemini_api_key'); setKey(''); onSave(''); onClose(); }}
              className="flex-1 px-4 py-3.5 border-2 border-red-50 text-red-400 font-bold rounded-2xl hover:bg-red-50 hover:border-red-100 transition-all text-sm"
            >
              キーを削除
            </button>
            <button 
              onClick={() => { localStorage.setItem('gemini_api_key', key); onSave(key); onClose(); }}
              className="flex-1 px-4 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all text-sm"
            >
              保存する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const REQUIRED_ACCESS_KEY = 'e3mo8-ji4e1';

function hasValidAccessKey(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  return params.get('access') === REQUIRED_ACCESS_KEY;
}

const AccessDeniedScreen = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div className="max-w-md w-full bg-white rounded-[32px] shadow-2xl p-10 text-center animate-fade-in border border-gray-50">
      <div className="bg-primary-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 text-primary-500 shadow-inner">
        <Lock size={40} />
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4 tracking-tight">絵文字切り出しくん</h1>
      <div className="space-y-4 py-2">
        <p className="text-gray-600 font-medium leading-relaxed">
          このページは購入者専用です。<br />
          販売者から案内された専用URLからアクセスしてください。
        </p>
      </div>
      <div className="mt-10 pt-8 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">&copy; 2026 yayoi</p>
      </div>
    </div>
  </div>
);

export default function App() {
  const [hasAccess, setHasAccess] = useState(() => hasValidAccessKey());

  useEffect(() => {
    const handleHashChange = () => {
      setHasAccess(hasValidAccessKey());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (!hasAccess) {
    return <AccessDeniedScreen />;
  }

  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  
  // Store multiple source images
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);

  // Main/Tab Configuration
    const [mainEmojiIds, setMainEmojiIds] = useState<string[]>([]);
    const [tabConfig, setTabConfig] = useState<ExportConfig | null>(null);
  
  // Meta Data
  const [meta, setMeta] = useState<MetaData>({
    stampNameJa: '', stampDescJa: '', stampNameEn: '', stampDescEn: ''
  });
  const [isTranslating, setIsTranslating] = useState(false);
  const [descriptionHintOpen, setDescriptionHintOpen] = useState(false);

  // Editor State
  const [editingStamp, setEditingStamp] = useState<Stamp | null>(null);
  const [isManualCropping, setIsManualCropping] = useState(false);
  const [manualCropInitialSourceId, setManualCropInitialSourceId] = useState<string | undefined>(undefined);
  const [targetReplaceId, setTargetReplaceId] = useState<string | null>(null);
  const [previewBg, setPreviewBg] = useState<string>('checker');
  const [cardSize, setCardSize] = useState(160);
  const deferredCardSize = React.useDeferredValue(cardSize);
  
  // Global Settings
  const [globalTolerance, setGlobalTolerance] = useState(20);
  const [gapTolerance, setGapTolerance] = useState(15); 
  const [isGapToleranceLocked, setIsGapToleranceLocked] = useState(false);
  const [isGlobalToleranceLocked, setIsGlobalToleranceLocked] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // New Image Processing State
  const [showSourceSelectModal, setShowSourceSelectModal] = useState(false);
  const [selectedSourceForNewStamp, setSelectedSourceForNewStamp] = useState<SourceImage | null>(null);
  const [showProcessSelection, setShowProcessSelection] = useState(false);
  const [selectedSourceHasGrid, setSelectedSourceHasGrid] = useState(false);
  const [isRemovingGridInFlow, setIsRemovingGridInFlow] = useState(false);
  
  // Grid Removal State
  const [isRemovingGrid, setIsRemovingGrid] = useState(false);
  const [hasGridLines, setHasGridLines] = useState(false);

  // State for Main/Tab Editor
  const [editingSpecialType, setEditingSpecialType] = useState<'main' | 'tab' | null>(null);

  // Export Settings
  const [renumber, setRenumber] = useState(true);

  // Restore & Save State
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [savedProjectDate, setSavedProjectDate] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Text Set Modal
  const [showTextSetModal, setShowTextSetModal] = useState(false);

  // API Key Settings
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, index: number} | null>(null);
  const [showUnifyScaleModal, setShowUnifyScaleModal] = useState(false);
  const [unifyScaleTarget, setUnifyScaleTarget] = useState<number>(0);

  // Drag and Drop Refs
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const stampsRef = useRef(stamps);
  useEffect(() => { stampsRef.current = stamps; }, [stamps]);

  // --- Restore Check on Mount ---
  useEffect(() => {
    const checkSavedData = async () => {
      try {
        const data = await loadProject();
        if (data && data.stamps.length > 0) {
          setSavedProjectDate(data.savedAt);
          setShowRestoreDialog(true);
        }
      } catch (err) {
        console.error('復元チェックに失敗:', err);
      }
    };
    checkSavedData();
  }, []);

  // --- Restore Action ---
  const handleRestore = async () => {
    try {
      const data = await loadProject();
      if (!data) return;

      skipAutoProcessRef.current = true;
      skipAutoSaveRef.current = true;

      const restoredSources = restoreSourceImages(data.sourceImages);
      
      const restoredStamps = data.stamps.map((s, idx) => ({
        ...s,
        isExcluded: s.isExcluded ?? false,
        flipH: s.flipH ?? false,
        flipV: s.flipV ?? false,
        rotation: s.rotation ?? 0,
        textObjects: (s.textObjects ?? []).map((t, i) => ({
            ...t,
            layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 10 + i : 150 + i),
            outlineColor: t.outlineColor ?? '#ffffff',
            outlineWidth: t.outlineWidth ?? 4,
        })),
        imageLayers: (s.imageLayers ?? []).map((l, i) => ({
            ...l,
            layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 30 + i : 170 + i),
        })),
        drawingStrokes: (s.drawingStrokes ?? []).map((d, i) => ({
            ...d,
            layerOrder: d.layerOrder ?? (d.zIndex === 'back' ? 20 + i : 160 + i),
            outlineColor: d.outlineColor ?? '#ffffff',
            outlineWidth: d.outlineWidth ?? 0,
        })),
        currentTolerance: s.currentTolerance ?? 50,
        mainImageLayerOrder: s.mainImageLayerOrder ?? 100,
      }));

      const sanitizeConfig = (config: ExportConfig | null): ExportConfig | null => {
          if (!config) return null;
          return {
            ...config,
            rotation: config.rotation ?? 0,
            textObjects: (config.textObjects ?? []).map((t, i) => ({
                ...t,
                layerOrder: t.layerOrder ?? (t.zIndex === 'back' ? 10 + i : 150 + i),
                outlineColor: t.outlineColor ?? '#ffffff',
                outlineWidth: t.outlineWidth ?? 4,
            })),
            imageLayers: (config.imageLayers ?? []).map((l, i) => ({
                ...l,
                layerOrder: l.layerOrder ?? (l.zIndex === 'back' ? 30 + i : 170 + i),
            })),
            drawingStrokes: (config.drawingStrokes ?? []).map((d, i) => ({
                ...d,
                layerOrder: d.layerOrder ?? (d.zIndex === 'back' ? 20 + i : 160 + i),
                outlineColor: d.outlineColor ?? '#ffffff',
                outlineWidth: d.outlineWidth ?? 0,
            })),
            mainImageLayerOrder: config.mainImageLayerOrder ?? 100,
            flipH: config.flipH ?? false,
            flipV: config.flipV ?? false,
          };
      };

      setSourceImages(restoredSources);
      setStamps(restoredStamps);
      setMainEmojiIds(data.mainEmojiIds || []);
      setTabConfig(sanitizeConfig(data.tabConfig));
      setMeta(data.meta);
      setGlobalTolerance(data.globalTolerance);
      setGapTolerance(data.gapTolerance);
      setPreviewBg(data.previewBg);
      setStep(AppStep.EDIT);
      setLastSavedAt(data.savedAt);

      setTimeout(() => {
        skipAutoProcessRef.current = false;
      }, 5000);
      setTimeout(() => {
        skipAutoSaveRef.current = false;
      }, 10000);

    } catch (err) {
      console.error('復元に失敗:', err);
      alert('データの復元に失敗しました');
    }
    setShowRestoreDialog(false);
  };

  const handleDiscardSave = async () => {
    await deleteProject();
    setShowRestoreDialog(false);
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    
    if (!file.name.endsWith('.zip')) {
      alert('ZIPファイルを選択してください');
      return;
    }
    
    setIsProcessing(true);
    try {
      const result = await loadProjectFromZip(file);
      if (!result) {
        setIsProcessing(false);
        alert('このZIPにはプロジェクトデータが含まれていません。\n「絵文字切り出しくん」で保存したZIPを選択してください。');
        return;
      }
      
      // 全ての自動処理を止める
      skipAutoProcessRef.current = true;
      skipAutoSaveRef.current = true;

      // globalToleranceを復元スタンプの値に合わせて再処理を防ぐ
      const firstTolerance = result.stamps[0]?.currentTolerance;
      const restoredTolerance = firstTolerance !== undefined ? firstTolerance : globalTolerance;

      // ★ 最重要 ★
      // React state にセットする前に IndexedDB に保存する。
      // これにより、この後ページがクラッシュしても
      // リロード時に「保存データが見つかりました」で復帰できる。
      try {
        await saveProject(
          result.stamps,
          [],  // sourceImages は空（ZIPには元画像がない）
          result.mainEmojiIds,
          result.tabConfig,
          result.metaData,
          restoredTolerance,
          gapTolerance,
          previewBg
        );
      } catch (saveErr) {
        console.error('IndexedDB保存エラー（続行）:', saveErr);
        // 保存に失敗しても続行する
      }

      // state を更新
      setGlobalTolerance(restoredTolerance);
      setSourceImages([]);
      setMainEmojiIds(result.mainEmojiIds || []);
      setTabConfig(result.tabConfig);
      setMeta(result.metaData);
      setStamps(result.stamps);
      
      // 画面遷移を遅らせてstate安定化
      await new Promise(resolve => setTimeout(resolve, 500));
      setStep(AppStep.EDIT);
      setIsProcessing(false);
      
      // 自動保存・自動再処理の再開を十分遅らせる
      setTimeout(() => {
        skipAutoProcessRef.current = false;
      }, 15000);
      setTimeout(() => {
        skipAutoSaveRef.current = false;
      }, 20000);
      
    } catch (err) {
      console.error('ZIP読み込みエラー:', err);
      setIsProcessing(false);
      alert('ZIPファイルの読み込みに失敗しました');
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // --- Auto Save ---
  useEffect(() => {
    if (step !== AppStep.EDIT) return;
    if (stamps.length === 0) return;
    if (skipAutoSaveRef.current) return;

    const timer = setTimeout(async () => {
      if (skipAutoSaveRef.current) return;
      try {
        await saveProject(
          stamps,
          sourceImages,
          mainEmojiIds,
          tabConfig,
          meta,
          globalTolerance,
          gapTolerance,
          previewBg
        );
        setLastSavedAt(new Date().toISOString());
      } catch (err) {
        console.error('自動保存に失敗:', err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [step, stamps, sourceImages, mainEmojiIds, tabConfig, meta, globalTolerance, gapTolerance, previewBg]);

  // --- Manual Save ---
  const handleManualSave = async () => {
    if (stamps.length === 0) return;
    setIsSaving(true);
    try {
      await saveProject(
        stamps,
        sourceImages,
        mainEmojiIds,
        tabConfig,
        meta,
        globalTolerance,
        gapTolerance,
        previewBg
      );
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      console.error('保存に失敗:', err);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Prevent Unload Warning ---
  useEffect(() => {
    if (step !== AppStep.EDIT) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [step]);

  // Debounced Bulk Processing Effect
  useEffect(() => {
      if (skipAutoProcessRef.current) return;
      const timer = setTimeout(async () => {
          if (skipAutoProcessRef.current) return;
          const currentStamps = stampsRef.current;
          if (currentStamps.length === 0) return;
          const needsUpdate = currentStamps.some(s => s.originalDataUrl && s.currentTolerance !== globalTolerance);
          if (!needsUpdate) return;
          try {
              const updates = new Map<string, Stamp>();
              await Promise.all(currentStamps.map(async (stamp) => {
                  if (stamp.originalDataUrl && stamp.currentTolerance !== globalTolerance) {
                      const newDataUrl = await reprocessStampWithTolerance(stamp.originalDataUrl, globalTolerance);
                      updates.set(stamp.id, {
                          ...stamp,
                          dataUrl: newDataUrl,
                          currentTolerance: globalTolerance
                      });
                  }
              }));
              if (updates.size > 0) {
                  setStamps(prev => prev.map(s => updates.get(s.id) || s));
              }
          } catch (err) {
              console.error("Bulk processing failed", err);
          }
      }, 100); 
      return () => clearTimeout(timer);
  }, [globalTolerance]);

  // Debounced Re-generation Effect (Gap)
  useEffect(() => {
      if (skipAutoProcessRef.current) return;
      const timer = setTimeout(async () => {
          if (skipAutoProcessRef.current) return;
          if (sourceImages.length === 0) return;
          setIsRegenerating(true);
          try {
              let newAutoStamps: Stamp[] = [];
              for (const src of sourceImages) {
                  const result = await processUploadedImage(src.file, src.id, globalTolerance, gapTolerance);
                  newAutoStamps.push(...result.stamps);
              }
              const manualStamps = stampsRef.current.filter(s => s.id.startsWith('stamp-manual-'));
              setStamps([...newAutoStamps, ...manualStamps]);
          } catch (err) {
              console.error("Regeneration failed", err);
          } finally {
              setIsRegenerating(false);
          }
      }, 500); 
      return () => clearTimeout(timer);
  }, [gapTolerance]);

  const getImageDims = (file: File): Promise<{w:number, h:number}> => {
      return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({w: img.width, h: img.height});
          img.src = URL.createObjectURL(file);
      });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    const validFiles = files.filter(f => f.type === 'image/png' || f.type === 'image/jpeg');
    if (validFiles.length === 0) return alert('PNGまたはJPEG画像を選択してください');
    const remainingSlots = 50 - sourceImages.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);
    if (filesToAdd.length < validFiles.length) {
        alert('画像は最大50枚までです');
    }
    let gridDetected = false;
    for (const file of filesToAdd) {
        if (await detectGridLines(file)) {
            gridDetected = true;
            break;
        }
    }
    if (gridDetected) setHasGridLines(true);
    const newSources: SourceImage[] = [];
    for (const file of filesToAdd) {
        const url = URL.createObjectURL(file);
        const {w, h} = await getImageDims(file);
        newSources.push({
            id: Math.random().toString(36).substring(7),
            url,
            file,
            width: w,
            height: h
        });
    }
    setSourceImages(prev => [...prev, ...newSources]);
  };

  const removeSourceImage = (id: string) => {
      setSourceImages(prev => {
          const next = prev.filter(img => img.id !== id);
          if (next.length === 0) setHasGridLines(false);
          return next;
      });
  };

  const startProcessing = async () => {
      if (sourceImages.length === 0) return;
      setIsProcessing(true);
      setStep(AppStep.PROCESSING);
      try {
          await deleteProject();
          let allStamps: Stamp[] = [];
          for (const source of sourceImages) {
             const result = await processUploadedImage(source.file, source.id, globalTolerance, gapTolerance);
             allStamps = [...allStamps, ...result.stamps];
          }
          setStamps(allStamps);
          if (allStamps.length > 0) {
              setDefaultsForStamps(allStamps);
          }
          setStep(AppStep.EDIT);
      } catch(err) {
          console.error(err);
          alert('処理に失敗しました');
          setStep(AppStep.UPLOAD);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleAddSourceFromModal = async (file: File) => {
      const url = URL.createObjectURL(file);
      const {w, h} = await getImageDims(file);
      const newSource = {
          id: Math.random().toString(36).substring(7),
          url,
          file,
          width: w,
          height: h
      };
      setSourceImages(prev => [...prev, newSource]);
      return newSource.id; 
  };

  const handleOpenNewStampFlow = () => {
      setShowSourceSelectModal(true);
  };

  const handleSelectExistingSource = async (source: SourceImage) => {
      setIsProcessing(true);
      const hasGrid = await detectGridLines(source.file);
      setIsProcessing(false);
      
      setSelectedSourceForNewStamp(source);
      setSelectedSourceHasGrid(hasGrid);
      setShowSourceSelectModal(false);
      setShowProcessSelection(true);
  };

  const handleUploadForNewStamp = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsProcessing(true);
      const hasGrid = await detectGridLines(file);
      const url = URL.createObjectURL(file);
      const {w, h} = await getImageDims(file);
      const newSource: SourceImage = {
          id: Math.random().toString(36).substring(7),
          url,
          file,
          width: w,
          height: h
      };
      
      setSourceImages(prev => [...prev, newSource]);
      if (hasGrid) setHasGridLines(true);
      
      setSelectedSourceForNewStamp(newSource);
      setSelectedSourceHasGrid(hasGrid);
      setIsProcessing(false);
      setShowSourceSelectModal(false);
      setShowProcessSelection(true);
      e.target.value = ''; 
  };

  const handleRemoveGridLinesInFlow = async () => {
    if (!selectedSourceForNewStamp) return;
    setIsRemovingGridInFlow(true);
    try {
        const cleanedFile = await removeGridLines(selectedSourceForNewStamp.file);
        const url = URL.createObjectURL(cleanedFile);
        const { w, h } = await getImageDims(cleanedFile);
        
        const updatedSource = {
            ...selectedSourceForNewStamp,
            file: cleanedFile,
            url,
            width: w,
            height: h
        };
        
        // 元のソースも更新
        setSourceImages(prev => prev.map(s => s.id === updatedSource.id ? updatedSource : s));
        setSelectedSourceForNewStamp(updatedSource);
        setSelectedSourceHasGrid(false);
        showToast('グリッド線を除去しました');
    } catch (err) {
        console.error('グリッド線除去失敗:', err);
        alert('除去に失敗しました');
    } finally {
        setIsRemovingGridInFlow(false);
    }
  };

  const handleRemoveGridLines = async () => {
    if (sourceImages.length === 0) return;
    setIsRemovingGrid(true);
    try {
      const updatedSources = await Promise.all(
        sourceImages.map(async (src) => {
          try {
            const cleanedFile = await removeGridLines(src.file);
            const url = URL.createObjectURL(cleanedFile);
            const { w, h } = await getImageDims(cleanedFile);
            URL.revokeObjectURL(src.url);
            return { ...src, file: cleanedFile, url, width: w, height: h };
          } catch (err) {
            console.error('グリッド線除去に失敗:', src.id, err);
            return src;
          }
        })
      );
      setSourceImages(updatedSources);
      setHasGridLines(false);
    } catch (err) {
      console.error('グリッド線除去エラー:', err);
    } finally {
      setIsRemovingGrid(false);
    }
  };

  const processNewImage = async (method: 'auto' | 'manual') => {
      if (!selectedSourceForNewStamp) return;
      setShowProcessSelection(false);
      setIsProcessing(true); 
      try {
        if (method === 'auto') {
            const result = await processUploadedImage(selectedSourceForNewStamp.file, selectedSourceForNewStamp.id, globalTolerance, gapTolerance);
            const timestamp = Date.now();
            const newStamps = result.stamps.map((s, i) => ({
                ...s,
                id: `stamp-${selectedSourceForNewStamp.id}-${timestamp}-${i}-${Math.random().toString(36).substring(7)}`,
                scale: s.scale,
                rotation: 0,
                offsetX: 0,
                offsetY: 0,
                textObjects: [],
                imageLayers: [],
                drawingStrokes: [],
                mainImageLayerOrder: 100,
                flipH: false,
                flipV: false
            }));
            setStamps(prev => [...prev, ...newStamps]);
        } else {
            setTimeout(() => {
                openManualCrop(undefined, selectedSourceForNewStamp.id); 
            }, 100);
        }
      } catch(e) {
          console.error(e);
          alert('処理に失敗しました');
      } finally {
          setIsProcessing(false);
          setSelectedSourceForNewStamp(null);
      }
  };

  const handleGlobalToleranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setGlobalTolerance(Number(e.target.value));
  };
  
  const handleGapToleranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setGapTolerance(Number(e.target.value));
  };

  const setDefaultsForStamps = (stampsToSet: Stamp[]) => {
      if (stampsToSet.length === 0) return;
      
      const firstStamps = stampsToSet.slice(0, 4);
      setMainEmojiIds(firstStamps.map(s => s.id));
      
      const firstStamp = stampsToSet[0];
      setTabConfig({
          id: firstStamp.id,
          scale: calculateFitScale(firstStamp.width, firstStamp.height, TAB_WIDTH, TAB_HEIGHT),
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
          flipH: false,
          flipV: false,
          textObjects: firstStamp.textObjects ? JSON.parse(JSON.stringify(firstStamp.textObjects)) : [],
          imageLayers: firstStamp.imageLayers ? JSON.parse(JSON.stringify(firstStamp.imageLayers)) : [],
          drawingStrokes: firstStamp.drawingStrokes ? JSON.parse(JSON.stringify(firstStamp.drawingStrokes)) : [],
          mainImageLayerOrder: 100
      });
  };

  const calculateFitScale = (w: number, h: number, targetW: number, targetH: number) => {
      const scaleW = targetW / w;
      const scaleH = targetH / h;
      return Math.min(scaleW, scaleH);
  };

  const updateStamp = (updatedStamp: Stamp) => {
    setStamps(prev => prev.map(s => s.id === updatedStamp.id ? updatedStamp : s));
  };
  
  const updateSpecialConfig = (updatedStamp: Stamp) => {
      if (editingSpecialType === 'tab' && tabConfig) {
          setTabConfig({
              ...tabConfig,
              scale: updatedStamp.scale,
              rotation: updatedStamp.rotation,
              offsetX: updatedStamp.offsetX,
              offsetY: updatedStamp.offsetY,
              flipH: updatedStamp.flipH,
              flipV: updatedStamp.flipV,
              customDataUrl: updatedStamp.dataUrl,
              textObjects: updatedStamp.textObjects,
              imageLayers: updatedStamp.imageLayers,
              drawingStrokes: updatedStamp.drawingStrokes,
              mainImageLayerOrder: updatedStamp.mainImageLayerOrder ?? 100
          });
      }
  };

  const validateText = () => {
      const errors = [];
      if (meta.stampNameJa.length < 2) errors.push('日本語タイトルは2文字以上必要です。');
      if (meta.stampDescJa.length < 10) errors.push('日本語説明文は10文字以上必要です。');
      return errors;
  };

  const handleTranslation = async () => {
    const errors = validateText();
    if (errors.length > 0) return alert(errors.join('\n'));
    setIsTranslating(true);
    try {
        const result = await translateMeta(meta.stampNameJa, meta.stampDescJa);
        setMeta(prev => ({ 
            ...prev, 
            stampNameEn: result.enName || prev.stampNameEn,
            stampDescEn: result.enDesc || prev.stampDescEn
        }));
    } catch (e: any) {
        alert('翻訳に失敗しました');
    } finally {
        setIsTranslating(false);
    }
  };

  const handleExport = async () => {
    if (mainEmojiIds.length === 0 || !tabConfig) return alert('代表絵文字とタブ画像を選択してください');
    await createAndDownloadZip(stamps, mainEmojiIds, tabConfig, meta, renumber);
    await saveProject(stamps, sourceImages, mainEmojiIds, tabConfig, meta, globalTolerance, gapTolerance, previewBg);
    setLastSavedAt(new Date().toISOString());
  };

  const downloadSingleStamp = async (stamp: Stamp) => {
      const config: ExportConfig = {
          id: stamp.id,
          scale: stamp.scale,
          rotation: stamp.rotation,
          offsetX: stamp.offsetX,
          offsetY: stamp.offsetY,
          flipH: stamp.flipH,
          flipV: stamp.flipV,
          textObjects: stamp.textObjects,
          imageLayers: stamp.imageLayers,
          drawingStrokes: stamp.drawingStrokes,
          mainImageLayerOrder: stamp.mainImageLayerOrder ?? 100
      };
      const blob = await createFinalImageBlob(stamp.dataUrl, config, TARGET_WIDTH, TARGET_HEIGHT);
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `stamp_${stamp.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };
  
  const downloadSpecialStamp = async (config: ExportConfig | null, width: number, height: number, filename: string) => {
      if (!config) return;
      const stamp = stamps.find(s => s.id === config.id);
      if (!stamp) return;
      const sourceUrl = config.customDataUrl || stamp.dataUrl;
      const blob = await createFinalImageBlob(sourceUrl, config, width, height);
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const downloadMainImage = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = MAIN_WIDTH;
      canvas.height = MAIN_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      for (let i = 0; i < 4; i++) {
          const id = mainEmojiIds[i];
          if (!id) continue;
          const stamp = stamps.find(s => s.id === id);
          if (!stamp) continue;
          
          await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                  const row = Math.floor(i / 2);
                  const col = i % 2;
                  const slotW = MAIN_WIDTH / 2;
                  const slotH = MAIN_HEIGHT / 2;
                  const scale = Math.min(slotW / TARGET_WIDTH, slotH / TARGET_HEIGHT);
                  const dw = TARGET_WIDTH * scale;
                  const dh = TARGET_HEIGHT * scale;
                  const dx = col * slotW + (slotW - dw) / 2;
                  const dy = row * slotH + (slotH - dh) / 2;
                  ctx.drawImage(img, dx, dy, dw, dh);
                  resolve();
              };
              img.onerror = () => resolve();
              img.src = stamp.dataUrl;
          });
      }
      
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'main.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const toggleExclude = (id: string) => {
    setStamps(prev => prev.map(s => s.id === id ? { ...s, isExcluded: !s.isExcluded } : s));
  };

  const openManualCrop = (replaceId?: string, defaultSourceId?: string) => {
    if (sourceImages.length === 0) return;
    setTargetReplaceId(replaceId || null);
    setManualCropInitialSourceId(defaultSourceId);
    setIsManualCropping(true);
  };

  const handleManualCropConfirm = (input: Stamp | Stamp[]) => {
    const newStampsInput = Array.isArray(input) ? input : [input];

    if (targetReplaceId) {
        setStamps(prev => {
            const index = prev.findIndex(s => s.id === targetReplaceId);
            if (index === -1) return [...prev, ...newStampsInput];
            
            const nextStamps = [...prev];
            // The first piece takes the original ID to preserve state (editing, main selection, etc.)
            const stampsWithPreservedId = newStampsInput.map((s, i) => 
                i === 0 ? { ...s, id: targetReplaceId } : s
            );
            
            nextStamps.splice(index, 1, ...stampsWithPreservedId);
            
            // Update editing stamp if it was the one replaced
            if (editingStamp?.id === targetReplaceId) {
                setEditingStamp(stampsWithPreservedId[0]);
            }
            
            return nextStamps;
        });
    } else {
        setStamps(prev => [...prev, ...newStampsInput]);
    }
    setIsManualCropping(false);
    setTargetReplaceId(null);
    setManualCropInitialSourceId(undefined);
  };

  const handleMainSelect = (id: string, index: number) => {
      setMainEmojiIds(prev => {
          const next = [...prev];
          if (id === "") {
              next.splice(index, 1);
          } else {
              next[index] = id;
          }
          return next;
      });
  };

  const getMainEmojiNumber = (id: string) => {
    const numberSource = renumber ? stamps.filter(stamp => !stamp.isExcluded) : stamps;
    const index = numberSource.findIndex(stamp => stamp.id === id);
    return index >= 0 ? String(index + 1).padStart(3, '0') : '';
  };

  const mainEmojiNumberText = [0, 1, 2, 3]
    .map(idx => mainEmojiIds[idx] ? getMainEmojiNumber(mainEmojiIds[idx]) : '')
    .filter(Boolean)
    .join('\t');

  const canCopyMainEmojiNumbers = [0, 1, 2, 3]
    .every(idx => Boolean(mainEmojiIds[idx] && getMainEmojiNumber(mainEmojiIds[idx])));

  const copyMainEmojiNumbers = async () => {
    if (!canCopyMainEmojiNumbers || !mainEmojiNumberText) return;
    await navigator.clipboard.writeText(mainEmojiNumberText);
    showToast('メイン画像番号をコピーしました');
  };

  const handleTabSelect = (id: string) => {
      const s = stamps.find(stamp => stamp.id === id);
      if(s) {
          setTabConfig({
              id: s.id,
              scale: calculateFitScale(s.width, s.height, TAB_WIDTH, TAB_HEIGHT),
              offsetX: 0,
              offsetY: 0,
              customDataUrl: undefined,
              rotation: 0,
              flipH: false,
              flipV: false,
              textObjects: s.textObjects ? JSON.parse(JSON.stringify(s.textObjects)) : [],
              imageLayers: s.imageLayers ? JSON.parse(JSON.stringify(s.imageLayers)) : [],
              drawingStrokes: s.drawingStrokes ? JSON.parse(JSON.stringify(s.drawingStrokes)) : [],
              mainImageLayerOrder: 100
          });
      }
  };

  const handleReCropFromEditor = (stamp: Stamp) => {
      setEditingStamp(null);
      setTimeout(() => {
          openManualCrop(stamp.id, stamp.sourceImageId);
      }, 100);
  };

  const handleDeleteStamp = () => { if (!deleteTarget) return; setStamps(prev => prev.filter(s => s.id !== deleteTarget.id)); setMainEmojiIds(prev => prev.filter(id => id !== deleteTarget.id)); if (tabConfig?.id === deleteTarget.id) setTabConfig(null); setDeleteTarget(null); };

  const handleUnifyScale = () => {
    if (stamps.length === 0) return;
    setUnifyScaleTarget(0);
    setShowUnifyScaleModal(true);
  };

  const handleUnifyScaleConfirm = () => {
    const targetScale = stamps[unifyScaleTarget].scale;
    setStamps(prev => prev.map(s => ({ ...s, scale: targetScale })));
    showToast(`No.${String(unifyScaleTarget + 1).padStart(2, '0')} のサイズ(${Math.round(targetScale * 100)}%)に揃えました`);
    setShowUnifyScaleModal(false);
  };

  const handleCenterAll = () => {
    if (stamps.length === 0) return;
    setStamps(prev => prev.map(s => ({ ...s, offsetX: 0, offsetY: 0 })));
    showToast("全絵文字を中央に揃えました");
  };

  // Ref to skip auto-processing during restore
  const skipAutoProcessRef = useRef(false);
  const skipAutoSaveRef = useRef(false);

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
    e.dataTransfer.effectAllowed = "move";
    e.currentTarget.style.opacity = "0.5";
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
    e.preventDefault();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = "1";
    if (
      dragItem.current !== null &&
      dragOverItem.current !== null &&
      dragItem.current !== dragOverItem.current
    ) {
      const newStamps = [...stamps];
      const draggedItemContent = newStamps[dragItem.current];
      newStamps.splice(dragItem.current, 1);
      newStamps.splice(dragOverItem.current, 0, draggedItemContent);
      setStamps(newStamps);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const moveItem = (from: number, to: number) => {
      if (to < 0 || to >= stamps.length) return;
      const newStamps = [...stamps];
      const item = newStamps[from];
      newStamps.splice(from, 1);
      newStamps.splice(to, 0, item);
      setStamps(newStamps);
      showToast(`No.${from + 1} を移動しました`);
  };

  const backgroundOptions = [
    { value: 'checker', label: '透明', color: 'bg-gray-200' }, 
    { value: '#ffffff', label: '白', color: 'bg-white border' },
    { value: '#ff00ff', label: 'マゼンタ', color: 'bg-[#ff00ff]' },
    { value: '#60a5fa', label: '青', color: 'bg-[#60a5fa]' },
    { value: '#000000', label: '黒', color: 'bg-black' },
    { value: '#16a34a', label: '緑', color: 'bg-[#16a34a]' },
    { value: '#f97316', label: 'オレンジ', color: 'bg-[#f97316]' },
  ];

  const TextCounter = ({ current, min, max }: { current: number, min: number, max: number }) => {
    const isError = current < min;
    const isMax = current >= max;
    return (
        <div className="flex items-center gap-1 text-xs">
            {isError && <span className="text-red-500 font-bold mr-1">あと{min - current}文字</span>}
            {isMax && <span className="text-red-500 font-bold mr-1">上限です</span>}
            <span className={isMax ? "text-red-500 font-bold" : (isError ? "text-orange-500" : "text-gray-400")}>
                {current}/{max}
            </span>
        </div>
    );
  };

  const CopyButton = ({ text }: { text: string }) => {
      const [copied, setCopied] = useState(false);
      const handleCopy = () => {
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
          });
      };
      return (
          <button 
            onClick={handleCopy} 
            className="text-gray-400 hover:text-primary-600 p-1 rounded hover:bg-primary-50 transition"
            title="コピー"
            type="button"
          >
              {copied ? <Check size={14} className="text-orange-500" /> : <Copy size={14} />}
          </button>
      );
  };

  const CanvasPreview = ({ config, width, height, onClick, previewBg }: { config: ExportConfig | null, width: number, height: number, onClick?: () => void, previewBg: string }) => {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const s = config ? stamps.find(x => x.id === config.id) : null;
      const layerCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
      useEffect(() => {
          if (!canvasRef.current || !config || !s) return;
          const ctx = canvasRef.current.getContext('2d');
          if (!ctx) return;
          if (config.imageLayers) {
            config.imageLayers.forEach(layer => {
                if (!layerCacheRef.current.has(layer.id)) {
                    const lImg = new Image();
                    lImg.onload = () => { layerCacheRef.current.set(layer.id, lImg); draw(); };
                    lImg.src = layer.dataUrl;
                }
            });
          }
          const draw = () => {
              const img = new Image();
              img.onload = () => {
                  ctx.clearRect(0, 0, width, height);
                  if (previewBg === 'checker') {
                      const size = 10;
                      for (let y = 0; y < height; y += size) {
                          for (let x = 0; x < width; x += size) {
                              ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#f3f4f6' : '#e5e7eb';
                              ctx.fillRect(x, y, size, size);
                          }
                      }
                  } else {
                      ctx.fillStyle = previewBg; ctx.fillRect(0, 0, width, height);
                  }
                  renderAllLayers(ctx, img, config, width, height, layerCacheRef.current);
              };
              img.src = config.customDataUrl || s.dataUrl;
          };
          draw();
      }, [config, s, width, height, previewBg]);
      if (!config || !s) {
          return (
             <div className="mt-2 border border-gray-200 rounded bg-gray-50 flex items-center justify-center text-xs text-gray-400" style={{ width: width / 2, height: height / 2 }}>
                 プレビュー
             </div>
          );
      }
      return (
          <div className="mt-2 flex justify-center bg-gray-100 rounded border border-gray-200 p-2 cursor-pointer hover:ring-2 hover:ring-primary-300 transition relative group" onClick={onClick}>
             <canvas ref={canvasRef} width={width} height={height} className="shadow-sm bg-white" style={{ maxWidth: '100%', height: 'auto', maxHeight: '120px' }} />
             <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors pointer-events-none">
                <span className="opacity-0 group-hover:opacity-100 bg-white/90 text-xs px-2 py-1 rounded-full font-bold shadow-sm text-gray-700">編集</span>
             </div>
          </div>
      );
  };

  const validStampsCount = stamps.filter(s => !s.isExcluded).length;
  const allowedCounts = [8, 16, 24, 32, 40];
  const nextTarget = allowedCounts.find(c => c >= validStampsCount) || 40;
  const isExactCount = validStampsCount >= 8 && validStampsCount <= 40;
  const isOverLimit = validStampsCount > 40;

  return (
    <div className="min-h-screen pb-20 flex flex-col">
      <header className="bg-white border-b border-primary-100 py-3 px-6 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto w-full">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-primary-500 p-2 rounded-lg text-white"><Grid size={24} /></div>
                        <h1 className="text-xl font-bold text-gray-800">絵文字切り出しくん</h1>
                    </div>
                    <button 
                        onClick={() => setShowApiKeyModal(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${userApiKey ? 'bg-primary-50 border-primary-200 text-primary-600' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'}`}
                    >
                        <Settings size={16} />
                        {userApiKey ? 'API設定済' : 'APIキー設定'}
                    </button>
                </div>
                {step === AppStep.EDIT && (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 animate-fade-in border-t border-primary-50 pt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-500">背景色</span>
                            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200">
                                {backgroundOptions.map(opt => (
                                    <button key={opt.value} onClick={() => setPreviewBg(opt.value)} className={`w-6 h-6 rounded-full ${opt.color} ${previewBg === opt.value ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`} style={opt.value === 'checker' ? { backgroundImage: `url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAB5JREFUKFNjYCACAAAHOgD///+F8f///4X/09JvAgBwYw/57yQ+jAAAAABJRU5ErkJggg==')`, backgroundRepeat: 'repeat', backgroundSize: '10px 10px' } : {}} />
                                ))}
                            </div>
                        </div>
                        <div className="hidden sm:block h-6 w-px bg-gray-200"></div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setIsGapToleranceLocked(!isGapToleranceLocked)}
                                className={`flex items-center gap-1 text-xs font-bold transition-colors ${isGapToleranceLocked ? 'text-primary-600' : 'text-gray-500 hover:text-primary-500'}`}
                            >
                                {isGapToleranceLocked ? <Lock size={14} /> : <Layers size={14} />}
                                <span className="hidden sm:inline">まとめる強さ</span>
                            </button>
                            <div className={`flex items-center gap-1 rounded-lg p-1 border transition-all ${isGapToleranceLocked ? 'bg-gray-100 border-gray-100 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                                <button 
                                    onClick={() => setGapTolerance(Math.max(0, gapTolerance - 1))} 
                                    disabled={isGapToleranceLocked}
                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Minus size={12} />
                                </button>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    value={gapTolerance} 
                                    onChange={handleGapToleranceChange} 
                                    disabled={isGapToleranceLocked}
                                    className="w-16 accent-primary-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed" 
                                />
                                <button 
                                    onClick={() => setGapTolerance(Math.min(50, gapTolerance + 1))} 
                                    disabled={isGapToleranceLocked}
                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <PlusIcon size={12} />
                                </button>
                                <span className="text-xs text-gray-500 font-mono w-6 text-right shrink-0">{gapTolerance}</span>
                            </div>
                            {isRegenerating && <Loader2 size={14} className="animate-spin text-primary-500" />}
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setIsGlobalToleranceLocked(!isGlobalToleranceLocked)}
                                className={`flex items-center gap-1 text-xs font-bold transition-colors ${isGlobalToleranceLocked ? 'text-primary-600' : 'text-gray-500 hover:text-primary-500'}`}
                            >
                                {isGlobalToleranceLocked ? <Lock size={14} /> : <Sliders size={14} />}
                                <span className="hidden sm:inline">一括透過</span>
                            </button>
                            <div className={`flex items-center gap-1 rounded-lg p-1 border transition-all ${isGlobalToleranceLocked ? 'bg-gray-100 border-gray-100 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                                <button 
                                    onClick={() => setGlobalTolerance(Math.max(1, globalTolerance - 1))} 
                                    disabled={isGlobalToleranceLocked}
                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Minus size={12} />
                                </button>
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="100" 
                                    value={globalTolerance} 
                                    onChange={handleGlobalToleranceChange} 
                                    disabled={isGlobalToleranceLocked}
                                    className="w-16 accent-primary-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed" 
                                />
                                <button 
                                    onClick={() => setGlobalTolerance(Math.min(100, globalTolerance + 1))} 
                                    disabled={isGlobalToleranceLocked}
                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <PlusIcon size={12} />
                                </button>
                                <span className="text-xs text-gray-500 font-mono w-6 text-right shrink-0">{globalTolerance}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="flex items-center gap-1 text-xs font-bold text-gray-500"><ImageIcon size={14} /><span className="hidden sm:inline">表示サイズ</span></div>
                             <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200">
                                <button 
                                    onClick={() => setCardSize(prev => Math.max(40, prev - 10))}
                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600 font-bold"
                                >
                                    <Minus size={12} />
                                </button>
                                <input 
                                    type="range" 
                                    min="40" 
                                    max="300" 
                                    step="10"
                                    value={cardSize} 
                                    onChange={(e) => setCardSize(Number(e.target.value))} 
                                    className="w-16 accent-primary-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <button 
                                    onClick={() => setCardSize(prev => Math.min(300, prev + 10))}
                                    className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-gray-100 text-gray-600 font-bold"
                                >
                                    <PlusIcon size={12} />
                                </button>
                                <span className="text-xs text-gray-500 font-mono w-8 text-right shrink-0">{cardSize}</span>
                            </div>
                        </div>
                        <div className="hidden sm:block h-6 w-px bg-gray-200"></div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleManualSave} disabled={isSaving || stamps.length === 0} className="flex items-center gap-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-1.5 px-3 rounded-full shadow-sm transition-all text-xs sm:text-sm disabled:opacity-50">
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                <span className="hidden sm:inline">保存</span>
                            </button>
                            {lastSavedAt && <span className="text-xs text-gray-400 hidden lg:inline">{new Date(lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 保存済</span>}
                        </div>
                        <div className="hidden sm:block h-6 w-px bg-gray-200"></div>
                        <button type="button" onClick={handleOpenNewStampFlow} className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-1.5 px-3 rounded-full shadow transition-all text-xs sm:text-sm ml-auto sm:ml-0">
                            <Plus size={16} />画像を追加
                        </button>
                    </div>
                )}
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 w-full flex-grow relative">
        {step === AppStep.EDIT && isProcessing && (
            <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm">
                <Loader2 size={48} className="text-primary-500 animate-spin mb-4" />
                <p className="font-bold text-gray-700">解析中...</p>
            </div>
        )}

        {step === AppStep.UPLOAD && (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 animate-fade-in gap-6">
            {isProcessing && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm">
                    <Loader2 size={48} className="text-primary-500 animate-spin mb-4" />
                    <p className="font-bold text-gray-700">ZIPを読み込み中...</p>
                </div>
            )}
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl text-center border-4 border-dashed border-primary-200 max-w-2xl w-full">
              <div className="relative hover:opacity-80 transition cursor-pointer mb-6">
                <input type="file" multiple accept="image/png, image/jpeg" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={sourceImages.length >= 50} />
                <div className="bg-primary-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-primary-600"><Upload size={32} /></div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-700 mb-1">画像をここにドロップ</h2>
                <p className="text-gray-500 mb-4 text-sm">またはクリックして選択 (最大50枚)</p>
                <div className="inline-block bg-primary-600 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-primary-200">画像を追加する</div>
              </div>
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-4 justify-center mb-3">
                  <div className="h-px bg-gray-300 w-12"></div>
                  <span className="text-xs text-gray-400 font-bold">または</span>
                  <div className="h-px bg-gray-300 w-12"></div>
                </div>
                <div className="relative inline-block">
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleZipUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="border-2 border-primary-300 hover:border-primary-500 text-primary-700 font-bold py-2.5 px-5 rounded-full shadow-sm transition flex items-center gap-2 cursor-pointer text-sm">
                    <Download size={18} />
                    保存したZIPから復元する
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">以前ダウンロードしたZIPを選んで続きから編集</p>
              </div>
            </div>
            {sourceImages.length > 0 && (
                <div className="w-full max-w-2xl">
                    <div className="flex justify-between items-end mb-2"><h3 className="text-gray-600 font-bold flex items-center gap-2">アップロード済み ({sourceImages.length}/50)</h3></div>
                    <div className="grid grid-cols-5 gap-4">
                        {sourceImages.map(img => (
                            <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden shadow-md border bg-white">
                                <img src={img.url} alt="source" className="w-full h-full object-cover" />
                                <button onClick={() => removeSourceImage(img.id)} className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full transition"><XIcon size={12} /></button>
                            </div>
                        ))}
                        {sourceImages.length < 50 && (
                             <div className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 relative hover:bg-white hover:border-primary-400 transition">
                                <Plus size={24} /><input type="file" multiple accept="image/png, image/jpeg" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                             </div>
                        )}
                    </div>
                    {hasGridLines && (
                        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <div className="bg-yellow-100 p-2 rounded-lg shrink-0"><Grid size={20} className="text-yellow-600" /></div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-yellow-800 mb-1">グリッド線が入っていませんか？</h4>
                                    <p className="text-xs text-yellow-700 mb-3">AI生成画像にグリッド線が入っている場合、除去すると綺麗に切り出せます。</p>
                                    <button onClick={handleRemoveGridLines} disabled={isRemovingGrid} className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg shadow transition text-sm disabled:opacity-50">{isRemovingGrid ? <><Loader2 size={16} className="animate-spin" />処理中...</> : <><Wand2 size={16} />グリッド線を除去する</>}</button>
                                </div>
                            </div>
                        </div>
                    )}
                    <button onClick={startProcessing} className="w-full mt-6 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white text-lg font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"><Crop size={24} />切り出す</button>
                </div>
            )}
          </div>
        )}

        {step === AppStep.PROCESSING && (
          <div className="flex flex-col items-center justify-center py-40">
            <Loader2 size={60} className="text-primary-500 animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-gray-700">画像を解析中...</h2>
            <p className="text-gray-500">{sourceImages.length}枚の画像から絵文字を切り出しています</p>
          </div>
        )}

        {step === AppStep.EDIT && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-col gap-4 bg-white p-4 rounded-xl shadow-sm border border-primary-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="font-bold text-lg flex items-center gap-2"><ImageIcon className="text-primary-500" />切り出し結果 (有効 {validStampsCount}個)</h2>
                        <div className="text-xs text-gray-500 mt-2 bg-blue-50 p-2 rounded border border-blue-100">
                    <div className="flex items-center gap-2">
                                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                                <div><span className="font-bold text-blue-600">申請可能個数:</span> 8〜40個<br/>{isExactCount ? <span className="text-orange-600 font-bold">現在 {validStampsCount}個 (申請可能です！)</span> : <>{isOverLimit ? <span className="text-orange-600 font-bold">40個を超えています。</span> : <span className="text-orange-600">現在 <span className="font-bold">{validStampsCount}個</span> です（8個から申請可能）</span>}</>}<br/><span className="opacity-70 text-[10px]">※8個未満は申請できません。</span></div>
                             </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setShowTextSetModal(true)} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg shadow text-xs sm:text-sm transition"><Type size={16} />テキスト一括追加</button>
                        <button onClick={() => { const updatedStamps = stamps.map(s => ({ ...s, textObjects: (s.textObjects ?? []).filter(t => !t.id.startsWith('txt-set-')), })); setStamps(updatedStamps); showToast('一括削除しました'); }} className={`flex items-center gap-1 bg-white border border-gray-300 hover:bg-red-50 hover:border-red-300 text-gray-600 hover:text-red-600 font-bold py-1.5 px-3 rounded-lg shadow-sm text-xs sm:text-sm transition ${stamps.some(s => s.textObjects?.some(t => t.id.startsWith('txt-set-'))) ? '' : 'opacity-30 pointer-events-none'}`}><Trash2 size={14} />一括テキスト削除</button>
                        <button onClick={handleUnifyScale} className="flex items-center gap-1 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-300 text-gray-600 hover:text-primary-600 font-bold py-1.5 px-3 rounded-lg shadow-sm text-xs sm:text-sm transition"><Sliders size={14} />サイズ揃え</button>
                        <button onClick={handleCenterAll} className="flex items-center gap-1 bg-white border border-gray-300 hover:bg-primary-50 hover:border-primary-300 text-gray-600 hover:text-primary-600 font-bold py-1.5 px-3 rounded-lg shadow-sm text-xs sm:text-sm transition"><Move size={14} />中央揃え</button>
                    </div>
                </div>
              </div>
              <div className="flex justify-end"><p className="text-xs text-gray-400">※ドラッグ＆ドロップで並べ替えができます</p></div>
              <div 
                className={`grid ${cardSize < 80 ? 'gap-1' : 'gap-4'}`}
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${deferredCardSize}px, 1fr))` }}
              >
                {stamps.map((stamp, index) => (
                    <div key={stamp.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnter={(e) => handleDragEnter(e, index)}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                        className={`stamp-card bg-white rounded-xl shadow border-2 transition-all overflow-hidden ${
                            stamp.isExcluded ? 'opacity-50 border-gray-200' : 'border-transparent hover:border-primary-300'
                        } group relative cursor-move`}
                    >
                        <div className="w-full aspect-square relative" onClick={() => setEditingStamp(stamp)}>
                            <StampPreview stamp={stamp} previewBg={previewBg} />
                            {cardSize >= 80 && (
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-colors pointer-events-none"><span className="opacity-0 group-hover:opacity-100 bg-white/90 text-xs px-2 py-1 rounded-full font-bold shadow-sm">編集</span></div>
                            )}
                            {cardSize >= 80 && (
                                <div className="absolute top-2 left-2 bg-white/50 p-1 rounded cursor-move opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <GripVertical size={14} className="text-gray-600" />
                                </div>
                            )}
                            {cardSize >= 80 && (
                                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pointer-events-none sm:pointer-events-auto">
                                    <button onClick={(e) => { e.stopPropagation(); downloadSingleStamp(stamp); }} className="bg-white text-gray-600 p-1.5 rounded-full shadow hover:bg-gray-100 hover:text-primary-600 cursor-pointer pointer-events-auto" title="ダウンロード"><Download size={14} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); openManualCrop(stamp.id, stamp.sourceImageId); }} className="bg-white text-gray-600 p-1.5 rounded-full shadow hover:bg-gray-100 hover:text-primary-600 cursor-pointer pointer-events-auto" title="再切り出し"><Crop size={14} /></button>
                                </div>
                            )}
                        </div>
                        {cardSize >= 80 && (
                            <div className="px-3 py-2 bg-gray-50 border-t flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={!stamp.isExcluded}
                                        onChange={(e) => { e.stopPropagation(); toggleExclude(stamp.id); }}
                                        className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer shadow-sm"
                                    />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteTarget({ id: stamp.id, index: index });
                                        }}
                                        className="w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-100 hover:text-red-500 transition"
                                        title="完全に削除"
                                    >
                                        <XIcon size={14} />
                                    </button>
                                </div>

                                <div className="font-bold text-gray-500 text-xs sm:text-sm shrink-0">
                                    {stamp.isExcluded ? '除外' : `No.${String(index + 1).padStart(2, '0')}`}
                                </div>

                                <div className="flex gap-1 h-5 shrink-0">
                                    {mainEmojiIds.includes(stamp.id) && (
                                        <span className="bg-yellow-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center">
                                            MAIN
                                        </span>
                                    )}
                                    {tabConfig?.id === stamp.id && (
                                        <span className="bg-blue-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow flex items-center">
                                            TAB
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-primary-100">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2 mb-4"><CheckCircle2 className="text-primary-500" size={20} />代表画像設定</h3>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-gray-600">メイン画像 (4個選択)</label>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={downloadMainImage}
                                        className="text-gray-400 hover:text-primary-600 p-1 transition-colors"
                                        title="2x2メイン画像をダウンロード"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button 
                                        onClick={copyMainEmojiNumbers}
                                        disabled={!canCopyMainEmojiNumbers}
                                        className="flex items-center gap-1 text-[10px] font-bold py-1 px-2 rounded bg-primary-50 text-primary-600 hover:bg-primary-100 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-primary-200"
                                        title="タブ区切りでコピー（対応サイト用）"
                                    >
                                        <Copy size={12} />番号コピー
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                {[0, 1, 2, 3].map(idx => (
                                    <select 
                                        key={idx}
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 bg-primary-50 text-[10px]" 
                                        value={mainEmojiIds[idx] || ''} 
                                        onChange={(e) => handleMainSelect(e.target.value, idx)}
                                    >
                                        <option value="">未選択</option>
                                        {stamps.map((s, i) => (
                                            <option key={s.id} value={s.id}>{s.isExcluded ? `(除外) ${i + 1}` : `No.${i + 1}`}</option>
                                        ))}
                                    </select>
                                ))}
                            </div>
                            <div className="space-y-1 mb-1">
                                <input 
                                    type="text" 
                                    readOnly 
                                    value={mainEmojiNumberText}
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                    className="w-full text-xs font-bold font-mono bg-gray-50 border border-gray-300 rounded px-2 py-2 select-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500 text-center"
                                    placeholder="選択された番号"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-1 bg-gray-100 p-2 rounded border w-[120px] h-[120px] mx-auto">
                                {[0, 1, 2, 3].map(idx => {
                                    const s = stamps.find(x => x.id === mainEmojiIds[idx]);
                                    return (
                                        <div key={idx} className="bg-white border flex items-center justify-center overflow-hidden">
                                            {s ? <img src={s.dataUrl} className="max-w-full max-h-full object-contain" /> : <div className="text-[10px] text-gray-300">{idx+1}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                             <div className="flex justify-between items-end mb-1"><label className="block text-sm font-medium text-gray-600">タブ画像 (96x74)</label><button onClick={() => downloadSpecialStamp(tabConfig, TAB_WIDTH, TAB_HEIGHT, 'tab.png')} disabled={!tabConfig} className="text-gray-400 hover:text-primary-600 disabled:opacity-30" title="ダウンロード"><Download size={18} /></button></div>
                            <select className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 mb-2 bg-primary-50 text-sm" value={tabConfig?.id || ''} onChange={(e) => handleTabSelect(e.target.value)}><option value="">選択してください</option>{stamps.map((s, i) => (<option key={s.id} value={s.id}>{s.isExcluded ? `(除外) 絵文字 ${i + 1}` : `No.${i + 1} の絵文字`}</option>))}</select>
                            <CanvasPreview config={tabConfig} width={TAB_WIDTH} height={TAB_HEIGHT} previewBg={previewBg} onClick={() => { setEditingSpecialType('tab'); const s = stamps.find(x => x.id === tabConfig?.id); if(s) setEditingStamp(s); }} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-primary-100">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                           <Languages className="text-primary-500" size={20} />絵文字名・説明文
                        </h3>
                     </div>
                    <div className="space-y-4">
                        <div><div className="flex justify-between items-center mb-1"><div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">タイトル（絵文字名）</label><CopyButton text={meta.stampNameJa} /></div><TextCounter current={meta.stampNameJa.length} min={2} max={40} /></div><input type="text" className={`w-full bg-primary-50 border rounded-md text-sm focus:ring-primary-500 focus:border-primary-500 ${meta.stampNameJa.length >= 40 ? 'border-red-300 bg-red-50' : 'border-primary-200'}`} maxLength={40} value={meta.stampNameJa} onChange={e => setMeta({...meta, stampNameJa: e.target.value})} /></div>
                        <div><div className="flex justify-between items-center mb-1"><div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">絵文字説明文</label><CopyButton text={meta.stampDescJa} /></div><TextCounter current={meta.stampDescJa.length} min={10} max={160} /></div><textarea className={`w-full bg-primary-50 border rounded-md text-sm focus:ring-primary-500 focus:border-primary-500 ${meta.stampDescJa.length >= 160 ? 'border-red-300 bg-red-50' : 'border-primary-200'}`} rows={3} maxLength={160} value={meta.stampDescJa} onChange={e => setMeta({...meta, stampDescJa: e.target.value})} /><div className="mt-2"><button onClick={() => setDescriptionHintOpen(!descriptionHintOpen)} className="flex items-center gap-1 text-xs text-primary-600 font-bold hover:text-primary-700">{descriptionHintOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}説明文ヒント</button>{descriptionHintOpen && (<div className="mt-2 p-3 bg-gray-100 rounded-lg text-[10px] border border-gray-200 animate-fade-in"><span className="font-bold text-gray-500 mb-1 block">入力例：</span>○○の絵文字。毎日よく使う言葉がたくさん。文末に使いやすい。お煎餅もあるよ。チョコ好きの方も煎餅好きの方もどうぞ！</div>)}</div></div>
                        <button onClick={handleTranslation} disabled={isTranslating} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:shadow-lg transition disabled:opacity-50">{isTranslating ? 'AI翻訳中...' : '英語に翻訳'}</button>
                        <div className="pt-2 border-t border-dashed"><div className="flex justify-between items-center mb-1"><div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">タイトル(En)</label><CopyButton text={meta.stampNameEn} /></div><TextCounter current={meta.stampNameEn.length} min={2} max={40} /></div><input type="text" className="w-full bg-primary-50 border-primary-200 rounded-md text-sm" maxLength={40} value={meta.stampNameEn} onChange={e => setMeta({...meta, stampNameEn: e.target.value})} /></div>
                        <div><div className="flex justify-between items-center mb-1"><div className="flex items-center gap-2"><label className="text-xs font-bold text-gray-500">説明文(En)</label><CopyButton text={meta.stampDescEn} /></div><TextCounter current={meta.stampDescEn.length} min={10} max={160} /></div><textarea className="w-full bg-primary-50 border-primary-200 rounded-md text-sm" rows={3} maxLength={160} value={meta.stampDescEn} onChange={e => setMeta({...meta, stampDescEn: e.target.value})} /></div>
                    </div>
                </div>
                <div className="bg-primary-50 p-6 rounded-2xl shadow-inner border border-primary-100 space-y-4">
                    <h3 className="font-bold text-primary-800 flex items-center gap-2 mb-4"><Download className="text-primary-600" size={20} />書き出し</h3>
                    <div className="flex items-center gap-2 mb-4"><input type="checkbox" id="renumber" checked={renumber} onChange={e => setRenumber(e.target.checked)} className="rounded text-primary-600" /><label htmlFor="renumber" className="text-sm text-gray-700">番号を振り直す (001.png〜)</label></div>
                    <button onClick={handleExport} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl shadow-lg transition flex items-center justify-center gap-2"><Download size={20} />ZIPをダウンロード</button>
                    <div className="pt-4 border-t border-primary-200/50 space-y-3"><a href="https://creator.line.me/ja/stickermaker/" target="_blank" rel="noopener noreferrer" className="w-full bg-white text-[#06C755] border border-[#06C755] font-bold py-3 rounded-xl flex items-center justify-center gap-2 md:hidden"><Smartphone size={18} />LINEスタンプメーカー</a><a href="https://creator.line.me/ja/" target="_blank" rel="noopener noreferrer" className="w-full bg-white text-gray-600 border border-gray-300 font-bold py-3 rounded-xl flex items-center justify-center gap-2"><ExternalLink size={18} />クリエイターズマーケット</a></div>
                </div>
            </div>
          </div>
        )}
      </main>
      
      {editingStamp && (
        <StampEditorModal
          stamp={editingStamp}
          isOpen={!!editingStamp}
          onClose={() => { setEditingStamp(null); setEditingSpecialType(null); }}
          onSave={(updated) => { if (editingSpecialType) { updateSpecialConfig(updated); } else { updateStamp(updated); } }}
          onReCrop={() => handleReCropFromEditor(editingStamp)}
          initialPreviewBg={previewBg}
          targetWidth={editingSpecialType === 'tab' ? TAB_WIDTH : TARGET_WIDTH}
          targetHeight={editingSpecialType === 'tab' ? TAB_HEIGHT : TARGET_HEIGHT}
          initialScale={editingSpecialType === 'tab' ? tabConfig?.scale : undefined}
          initialRotation={editingSpecialType === 'tab' ? tabConfig?.rotation : undefined}
          initialOffset={editingSpecialType === 'tab' ? {x: tabConfig?.offsetX || 0, y: tabConfig?.offsetY || 0} : undefined}
          initialTextObjects={editingSpecialType === 'tab' ? tabConfig?.textObjects : undefined}
          initialImageLayers={editingSpecialType === 'tab' ? tabConfig?.imageLayers : undefined}
          initialDrawingStrokes={editingSpecialType === 'tab' ? tabConfig?.drawingStrokes : undefined}
        />
      )}

      {showSourceSelectModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative">
              <button onClick={() => setShowSourceSelectModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><XIcon size={24} /></button>
              <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Plus size={24} className="text-primary-600" />画像を追加</h3>
              <div className="space-y-4">
                  <div className="relative border-2 border-dashed border-primary-200 bg-primary-50 rounded-xl p-6 hover:bg-primary-100 transition cursor-pointer text-center group"><input type="file" accept="image/png, image/jpeg" onChange={handleUploadForNewStamp} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" /><Upload className="mx-auto text-primary-500 mb-2" size={32} /><p className="font-bold text-primary-700">新しい画像をアップロード</p></div>
                  {sourceImages.length > 0 && (<div><p className="text-xs font-bold text-gray-500 mb-2">アップロード済みから選択:</p><div className="grid grid-cols-4 gap-2">{sourceImages.map(img => (<button key={img.id} onClick={() => handleSelectExistingSource(img)} className="aspect-square rounded-lg border border-gray-200 overflow-hidden hover:ring-2 hover:ring-primary-500 transition relative"><img src={img.url} className="w-full h-full object-cover" alt="source" /></button>))}</div></div>)}
              </div>
           </div>
        </div>
      )}

      {showProcessSelection && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 relative animate-fade-in">
             <button onClick={() => setShowProcessSelection(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><XIcon size={24} /></button>
             <h3 className="text-xl font-bold text-gray-800 mb-4">切り出し方法を選択</h3>
             
             {selectedSourceHasGrid && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <div className="flex items-start gap-3">
                        <Grid size={20} className="text-yellow-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-yellow-800 mb-2">グリッド線が検出されました</p>
                            <button 
                                onClick={handleRemoveGridLinesInFlow} 
                                disabled={isRemovingGridInFlow}
                                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-3 rounded-lg shadow transition text-[10px] disabled:opacity-50"
                            >
                                {isRemovingGridInFlow ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                グリッド線を除去する
                            </button>
                        </div>
                    </div>
                </div>
             )}

             <div className="space-y-3">
                <button onClick={() => processNewImage('auto')} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl shadow flex items-center justify-center gap-2"><Wand2 size={20} />自動で切り出す</button>
                <button onClick={() => processNewImage('manual')} className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl shadow-sm flex items-center justify-center gap-2"><Crop size={20} />手動で切り出す</button>
             </div>
          </div>
        </div>
      )}

      <ManualCropModal sourceImages={sourceImages} isOpen={isManualCropping} onClose={() => { setIsManualCropping(false); setTargetReplaceId(null); setManualCropInitialSourceId(undefined); }} onConfirm={handleManualCropConfirm} onAddSource={handleAddSourceFromModal} initialSourceId={manualCropInitialSourceId} bgTolerance={globalTolerance} />
      <TextSetModal isOpen={showTextSetModal} onClose={() => setShowTextSetModal(false)} stamps={stamps} onApply={(updatedStamps) => { setStamps(updatedStamps); }} />

      {showRestoreDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="bg-primary-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Save size={32} className="text-primary-600" /></div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">保存データが見つかりました</h3>
            <p className="text-sm text-gray-500 mb-6">保存日時: {new Date(savedProjectDate).toLocaleString('ja-JP')}</p>
            <div className="space-y-3"><button onClick={handleRestore} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl shadow transition flex items-center justify-center gap-2"><RotateCw size={18} />続きから再開する</button><button onClick={handleDiscardSave} className="w-full bg-white border border-gray-300 text-gray-600 font-bold py-3 rounded-xl shadow-sm transition flex items-center justify-center gap-2"><Trash2 size={18} />破棄して新しく始める</button></div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full p-6 text-center">
                <div className="text-4xl mb-3">🗑️</div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No.{String(deleteTarget.index + 1).padStart(2,'0')} を削除しますか？</h3>
                <p className="text-sm text-gray-500 mb-6">この操作は取り消せません。</p>
                <div className="flex gap-3">
                    <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-white border border-gray-300 text-gray-600 font-bold py-2.5 rounded-xl shadow-sm transition hover:bg-gray-50">キャンセル</button>
                    <button onClick={handleDeleteStamp} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl shadow transition">削除する</button>
                </div>
            </div>
        </div>
      )}
      {showUnifyScaleModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xs w-full p-6 text-center">
            <div className="text-4xl mb-3">📐</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">サイズ揃え</h3>
            <p className="text-sm text-gray-500 mb-4">基準にする絵文字を選んでください。<br/>全絵文字がそのサイズに揃います。</p>
            <select
              value={unifyScaleTarget}
              onChange={(e) => setUnifyScaleTarget(Number(e.target.value))}
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500 mb-4 bg-primary-50 text-sm"
            >
              {stamps.map((s, i) => (
                <option key={s.id} value={i}>
                  No.{String(i + 1).padStart(2, '0')} — {Math.round(s.scale * 100)}%{s.isExcluded ? ' (除外)' : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowUnifyScaleModal(false)} className="flex-1 bg-white border border-gray-300 text-gray-600 font-bold py-2.5 rounded-xl shadow-sm transition hover:bg-gray-50">キャンセル</button>
              <button onClick={handleUnifyScaleConfirm} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl shadow transition">揃える</button>
            </div>
          </div>
        </div>
      )}

      <ApiKeyModal 
        isOpen={showApiKeyModal} 
        onClose={() => setShowApiKeyModal(false)} 
        onSave={(key) => {
            setUserApiKey(key);
            showToast(key ? 'APIキーを保存しました' : 'APIキーを削除しました');
        }} 
      />
      {toastMessage && (<div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg pointer-events-none whitespace-nowrap animate-[fadeIn_0.3s_ease-in-out]">{toastMessage}</div>)}
      <footer className="text-center py-4 text-xs text-gray-400"><p>Developed by yayoi 2026</p></footer>
    </div>
  );
}