import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, Smartphone, Monitor } from 'lucide-react';
import { Stamp, MetaData, ExportConfig, TARGET_WIDTH, TARGET_HEIGHT } from '../types';
import { renderAllLayers } from '../lib/zipService';

// LINE絵文字の価格帯（スタンプと異なり320円・350円はない）
const PRICE_OPTIONS = [190, 250, 370, 490, 610];

// スマホ(LINEアプリ内)はコイン表示のため、円→コインの対応表を持つ
const COIN_BY_PRICE: Record<number, number> = {
  190: 70,
  250: 100,
  370: 150,
  490: 200,
  610: 250,
};

export interface StoreInfo {
  creator: string;
  copyright: string;
  price: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  meta: MetaData;
  stamps: Stamp[];
  mainEmojiIds: string[];
  storeInfo: StoreInfo;
  onStoreInfoChange: (info: StoreInfo) => void;
}

/**
 * 絵文字1枚を透明背景で描画する（ストアの表示に合わせて背景は白のまま）
 */
const StoreSticker: React.FC<{
  imageUrl: string;
  config: ExportConfig;
  width: number;
  height: number;
}> = ({ imageUrl, config, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cancelled = false;

    ctx.clearRect(0, 0, width, height);

    const img = new Image();
    img.onload = () => {
      const layerImages = new Map<string, HTMLImageElement>();
      const layerPromises = (config.imageLayers ?? []).map(layer => (
        new Promise<void>((resolve) => {
          const lImg = new Image();
          lImg.onload = () => { layerImages.set(layer.id, lImg); resolve(); };
          lImg.onerror = () => resolve();
          lImg.src = layer.dataUrl;
        })
      ));
      Promise.all(layerPromises).then(() => {
        if (cancelled) return;
        ctx.clearRect(0, 0, width, height);
        renderAllLayers(ctx, img, config, width, height, layerImages);
      });
    };
    img.src = imageUrl;

    return () => { cancelled = true; };
  }, [imageUrl, config, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} className="w-full h-full" />;
};

/**
 * クリックすると入力欄に変わるテキスト
 */
const EditableText: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  display?: (v: string) => React.ReactNode;
}> = ({ value, onChange, placeholder, className = '', display }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => { onChange(draft.trim()); setEditing(false); };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
        className={`border border-primary-400 rounded px-1 outline-none text-center ${className}`}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-text hover:bg-yellow-50 hover:outline hover:outline-1 hover:outline-yellow-300 rounded px-1 ${className}`}
      title="クリックして編集"
    >
      {value ? (display ? display(value) : value) : <span className="text-gray-400">{placeholder}</span>}
    </span>
  );
};

export const StoreViewModal: React.FC<Props> = ({
  isOpen, onClose, meta, stamps, mainEmojiIds, storeInfo, onStoreInfoChange
}) => {
  const hasEnglish = !!(meta.stampNameEn?.trim() || meta.stampDescEn?.trim());
  // 日本語・英語の両方があるときは日本語を初期表示にする
  const [lang, setLang] = useState<'ja' | 'en'>('ja');
  const [device, setDevice] = useState<'pc' | 'mobile'>('pc');
  const [favorite, setFavorite] = useState(false);
  const [previewStamp, setPreviewStamp] = useState<Stamp | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLang('ja');
    setPreviewStamp(null);
    // 開いた端末に合わせて初期表示を決める
    setDevice(window.innerWidth < 640 ? 'mobile' : 'pc');
  }, [isOpen]);

  if (!isOpen) return null;

  const title = lang === 'en' ? (meta.stampNameEn || meta.stampNameJa) : meta.stampNameJa;
  const desc = lang === 'en' ? (meta.stampDescEn || meta.stampDescJa) : meta.stampDescJa;

  const mainStamps = mainEmojiIds
    .map(id => stamps.find(stamp => stamp.id === id))
    .filter((stamp): stamp is Stamp => !!stamp)
    .slice(0, 4);

  const stampToConfig = (s: Stamp): ExportConfig => ({
    id: s.id,
    scale: s.scale,
    rotation: s.rotation,
    offsetX: s.offsetX,
    offsetY: s.offsetY,
    textObjects: s.textObjects,
    imageLayers: s.imageLayers,
    drawingStrokes: s.drawingStrokes,
    mainImageLayerOrder: s.mainImageLayerOrder ?? 100,
    flipH: s.flipH,
    flipV: s.flipV,
  });

  const isMobile = device === 'mobile';

  const mainImage = mainStamps.length > 0 ? (
    <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
      {[0, 1, 2, 3].map(index => (
        <div key={index} className="flex items-center justify-center overflow-hidden">
          {mainStamps[index] && <img src={mainStamps[index].dataUrl} className="w-full h-full object-contain" alt="" />}
        </div>
      ))}
    </div>
  ) : null;

  const priceSelect = (
    <div className="flex items-baseline gap-1">
      <span className="text-[#06C755] text-2xl font-bold">￥</span>
      <select
        value={storeInfo.price}
        onChange={(e) => onStoreInfoChange({ ...storeInfo, price: Number(e.target.value) })}
        className="text-[#06C755] text-2xl font-bold bg-transparent border border-transparent hover:border-gray-300 rounded cursor-pointer outline-none focus:border-primary-400"
        title="価格を選択"
      >
        {PRICE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );

  // スマホは表示をコインにする。選ぶときは金額（円）のまま選べるよう、
  // 透明の <select> を表示の上に重ねている
  const coinPriceSelect = (
    <div className="relative inline-flex items-center gap-1.5 rounded px-2 py-0.5 hover:bg-gray-50" title="クリックすると金額で選べます">
      <span className="w-[18px] h-[18px] rounded-full bg-[#f0b400] text-white text-[11px] font-bold flex items-center justify-center shrink-0">L</span>
      <span className="text-base font-bold text-gray-800">{COIN_BY_PRICE[storeInfo.price] ?? storeInfo.price}</span>
      <select
        value={storeInfo.price}
        onChange={(e) => onStoreInfoChange({ ...storeInfo, price: Number(e.target.value) })}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="価格を選択"
      >
        {PRICE_OPTIONS.map(p => <option key={p} value={p}>￥{p}（{COIN_BY_PRICE[p] ?? p}コイン）</option>)}
      </select>
    </div>
  );

  const favoriteButton = (
    <button
      onClick={() => setFavorite(!favorite)}
      className={`shrink-0 flex items-center justify-center border rounded transition ${
        favorite ? 'border-gray-200 text-red-500' : 'border-gray-200 text-gray-300 hover:text-red-400'
      } ${isMobile ? 'w-[54px] h-[54px] rounded' : 'w-9 h-9 rounded-full'}`}
      title={favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
    >
      <Heart size={isMobile ? 22 : 18} fill={favorite ? 'currentColor' : 'none'} />
    </button>
  );

  const noteLine = (
    <p className="text-gray-400">絵文字をクリックするとプレビューが表示されます。</p>
  );

  const stickerGrid = (
    <div className={`grid gap-3 sm:gap-4 ${isMobile ? 'grid-cols-5' : 'grid-cols-5 sm:landscape:grid-cols-8'}`}>
      {stamps.map(s => (
        <div
          key={s.id}
          className="aspect-square flex items-center justify-center cursor-pointer select-none hover:bg-gray-50 rounded transition"
          onClick={() => setPreviewStamp(s)}
          title="クリックするとプレビューが表示されます"
        >
          <StoreSticker
            imageUrl={s.dataUrl}
            config={stampToConfig(s)}
            width={TARGET_WIDTH}
            height={TARGET_HEIGHT}
          />
        </div>
      ))}
    </div>
  );

  const copyrightLine = (
    <div className="text-center text-xs text-gray-400">
      <EditableText
        value={storeInfo.copyright}
        onChange={(v) => onStoreInfoChange({ ...storeInfo, copyright: v.replace(/^©\s*/, '') })}
        placeholder="コピーライトを入力"
        display={(v) => `©${v}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full h-full sm:h-[95vh] sm:max-w-5xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* ツールバー（プレビュー用。ストアの一部ではない） */}
        <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2 shrink-0 flex-wrap">
          <span className="text-sm font-bold text-gray-700">ストアビュー</span>
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={() => setDevice('mobile')}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border transition ${isMobile ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'}`}
            ><Smartphone size={14} />ショップ</button>
            <button
              onClick={() => setDevice('pc')}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border transition ${!isMobile ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'}`}
            ><Monitor size={14} />LINEストア</button>
          </div>
          {hasEnglish && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setLang('ja')}
                className={`text-xs font-bold px-2 py-1 rounded border transition ${lang === 'ja' ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'}`}
              >日本語</button>
              <button
                onClick={() => setLang('en')}
                className={`text-xs font-bold px-2 py-1 rounded border transition ${lang === 'en' ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-100'}`}
              >English</button>
            </div>
          )}
          <button onClick={onClose} className="ml-auto p-2 hover:bg-gray-200 rounded-full transition shrink-0" title="閉じる">
            <X size={20} />
          </button>
        </div>

        {/* ストア本体（背景は真っ白） */}
        <div className="flex-1 overflow-y-auto bg-white">
          {isMobile ? (
            /* ===== スマホ表示（LINEアプリ内のストア） ===== */
            <div className="mx-auto w-full max-w-[420px] px-4 py-6 border-x border-gray-100">
              <div className="flex justify-center">
                <div className="w-[170px] h-[170px] flex items-center justify-center">
                  {mainImage ? (
                    mainImage
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">メイン画像なし</div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <span className="border border-gray-300 rounded-full px-4 py-1 text-sm text-gray-700">
                  <EditableText
                    value={storeInfo.creator}
                    onChange={(v) => onStoreInfoChange({ ...storeInfo, creator: v })}
                    placeholder="クリエイター名"
                  />
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-bold text-gray-800 text-center leading-snug break-words">
                {title || <span className="text-gray-300">絵文字名が未入力です</span>}
              </h1>

              <div className="mt-1.5 flex justify-center">{coinPriceSelect}</div>

              <div className="mt-5 flex items-stretch gap-2">
                {favoriteButton}
                <button type="button" className="flex-1 border border-gray-300 text-gray-800 text-lg font-bold py-3 rounded cursor-default">プレゼントする</button>
                <button type="button" className="flex-1 bg-[#06C755] text-white text-lg font-bold py-3 rounded cursor-default">購入する</button>
              </div>

              <p className="mt-5 text-base text-gray-500 leading-relaxed whitespace-pre-wrap break-words">
                {desc || <span className="text-gray-300">説明文が未入力です</span>}
              </p>

              <div className="mt-4 text-sm">{noteLine}</div>

              <div className="mt-6">{stickerGrid}</div>
              {stamps.length === 0 && <p className="text-center text-sm text-gray-400 py-8">表示できる絵文字がありません</p>}

              <div className="mt-8 pb-8">{copyrightLine}</div>
            </div>
          ) : (
            /* ===== パソコン表示（Webのストア） ===== */
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="shrink-0 mx-auto sm:mx-0">
                  {/* sm未満(横幅が狭く縦積みになる)ときは「ショップ」と同じ170pxに縮小 */}
                  <div className="w-[170px] h-[170px] sm:w-[240px] sm:h-[240px] flex items-center justify-center">
                    {mainImage ? (
                      mainImage
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">メイン画像なし</div>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 leading-snug break-words">
                    {title || <span className="text-gray-300">絵文字名が未入力です</span>}
                  </h1>
                  <div className="mt-2 text-xs text-[#06C755]">
                    <EditableText
                      value={storeInfo.creator}
                      onChange={(v) => onStoreInfoChange({ ...storeInfo, creator: v })}
                      placeholder="クリエイター名"
                    />
                  </div>
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
                    {desc || <span className="text-gray-300">説明文が未入力です</span>}
                  </p>

                  <div className="mt-4 flex items-center gap-3">
                    {priceSelect}
                    <div className="ml-auto">{favoriteButton}</div>
                  </div>

                  <div className="mt-4 flex gap-3">
                    <button type="button" className="flex-1 bg-[#4b5563] text-white font-bold py-3 rounded cursor-default">プレゼントする</button>
                    <button type="button" className="flex-1 bg-[#06C755] text-white font-bold py-3 rounded cursor-default">購入する</button>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-gray-200 pt-4 text-xs">{noteLine}</div>

              <div className="mt-6">{stickerGrid}</div>
              {stamps.length === 0 && <p className="text-center text-sm text-gray-400 py-8">表示できる絵文字がありません</p>}

              <div className="mt-8 border-t border-gray-200 pt-4 pb-8">{copyrightLine}</div>
            </div>
          )}
        </div>
      </div>

      {/* 絵文字のプレビュー（一覧の絵文字をクリックしたとき） */}
      {previewStamp && (
        <div
          className="absolute inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewStamp(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-4 relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewStamp(null)}
              className="absolute -top-3 -right-3 bg-white border border-gray-200 rounded-full p-1.5 shadow hover:bg-gray-100"
              title="閉じる"
            >
              <X size={18} />
            </button>
            <div className="w-[280px] h-[280px] sm:w-[360px] sm:h-[360px]">
              <StoreSticker
                imageUrl={previewStamp.dataUrl}
                config={stampToConfig(previewStamp)}
                width={TARGET_WIDTH}
                height={TARGET_HEIGHT}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
