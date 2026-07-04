# CLAUDE.md — 絵文字切り出しくん (lineek)

AIアシスタント（Claude / Codex 等）向けの引き継ぎメモ。作業前に必ず読むこと。

## このアプリについて

- 1枚の画像からLINE絵文字を切り出す静的Webアプリ。**販売中の製品**
- Vite + React 19 + TypeScript。画像データはすべてブラウザ内（IndexedDB / localStorage）で処理・保存し、外部送信しない設計（AI翻訳のみユーザー自身の Gemini API キーを使用）
- 姉妹アプリ「スタンプ切り出しくん」（ https://github.com/yayoi333/linesk ）とコードベースがほぼ同じ。**バグ修正はたいてい両方のリポジトリに必要**
- linesk との主な差分: メイン画像が `mainEmojiIds`（選択IDの配列。linesk の mainConfig に相当する編集設定はない）。タブ画像の `tabConfig` は共通

## オーナーとの作業ルール（必読）

- オーナー（yayoi / あきるさん）は非エンジニア。説明は専門用語を噛み砕いた日本語で
- **指示された箇所以外のコードを変更しない**。気づいた改善点は実装せず提案として列挙する
- **main への push = 即・本番公開**（GitHub Pages が自動デプロイ）。push は必ず本人のOKを得てから
- 基本フロー: ローカル修正 → 型チェック/build/ブラウザ検証 → localhost で本人確認 → OK → push

## このリポジトリ固有の罠（重要）

### ルート直下の残骸ファイル
- ルート直下にある `StampEditorModal.tsx`・`gemini.ts`・`download`・`prompt_*.json` など多数のファイルは **Google AI Studio 時代の未使用の残骸**
- 実際に使われるのは `index.tsx` → `App.tsx` → `lib/` と `components/` のみ（App.tsx の import を見れば分かる）
- 残骸のせいで `npm run lint`（tsc）は**元から失敗する**。自分の変更を型チェックするには include を絞った一時設定を使う:
  ```json
  { "extends": "./tsconfig.json",
    "include": ["index.tsx", "App.tsx", "types.ts", "lib/**/*.ts", "components/**/*.tsx"] }
  ```
  （`npx tsc --noEmit -p tsconfig.check.json` で実行し、終わったら消す）
- 残骸の掃除は残タスク（オーナー了承済み・未着手）

### フック順序（過去に画面全体がクラッシュしたバグ）
- App.tsx のアクセス判定（hasAccess）による早期 return は、**必ず全フック宣言の後（コンポーネント末尾、メインJSXの直前）で行う**
- 以前はフック宣言の途中に early return があり、キーを後から付けると Rules of Hooks 違反で白画面になった（2026-07 修正済み）。上に戻すと再発する

### 同一オリジン問題
- linesk と lineek は同じ yayoi333.github.io に同居し、**localStorage / IndexedDB を共有する**
- IndexedDB: lineek = `emoji-cutter-db` / linesk = `stamp-cutter-db`（2026-07 に分離。以前は共有で上書き事故が起きていた）
- 旧共有DBからの自動移行が `lib/storage.ts` にある（絵文字くんのデータは `mainEmojiIds` を持つことで判別。フラグ `ek_db_migrated`）。**スタンプくんのデータ（mainConfig を持つ）は移動も削除もしない**こと
- アクセス認証フラグ: lineek = `auth_verified_ek` / linesk = `auth_verified`。**取り違えると片方の購入者がもう片方を使えてしまう**
- Gemini APIキー（`gemini_api_key_enc` / `gemini_api_key_k`）は意図的に共有

### アクセス制御
- URL の `#access=<キー>` を SHA-256 ハッシュで照合（App.tsx の `VALID_HASH`）。一度認証したら localStorage に記憶
- ローカル検証時のバイパス: `localStorage.setItem('auth_verified_ek', 'true')`
- **注意: 旧アクセスキーの平文が git 履歴（2026-07 以前のコミット）に残っている**。リポジトリは公開のため、履歴を掘れば見つかる状態 → 残タスク参照

### APIキーの暗号化保存
- `lib/storage.ts` の `saveApiKey` / `loadApiKey` / `removeApiKey`（Web Crypto AES-GCM）。旧平文キーは読み込み時に自動移行
- 簡易的な難読化であり、根本対策（Tailwind CDN 同梱化・SRI・CSP）は未対応

### タブ画像の編集（過去バグ）
- タブ画像の編集結果は `tabConfig` に保存される（消しゴム編集後の画像は `customDataUrl`）
- 編集モーダルを開くときは `customDataUrl` / `flipH` / `flipV` / `mainImageLayerOrder` を stamp にマージして渡す（App.tsx の CanvasPreview onClick 参照）。怠ると「編集が開き直すと消える」バグが再発する

### 削除と保存
- 絵文字削除（handleDeleteStamp）は自動保存に頼らず**即時に saveProject を呼ぶ**こと。自動保存は stamps が空のときや復元直後のスキップ期間中は動かない

### デプロイ
- `.github/workflows/deploy.yml` が main への push で GitHub Pages（ https://yayoi333.github.io/lineek/ ）へ自動デプロイ
- デプロイ最終段が「Deployment failed, try again later」で失敗することがある → `gh run rerun <run-id>`（**全体再実行**）で直る
- push 後は本番URLのバンドルに変更が入ったことまで確認するのが通例

### ローカル開発
- `npm install` → `npm run dev`。base が `/lineek/` なので URL は http://localhost:3000/lineek/ （ポートを変える場合は `npm run dev -- --port 3100`）
- オーナーのPC（OneDrive 配下）ではビルドがまれに exit -1073740791 でクラッシュする → `dist` を削除して再実行で直る

### 動作確認手順
- README.md の「セキュリティ・データ保護に関する動作確認手順」を参照

## 残タスク（2026-07-04 時点）

1. ルート直下の残骸ファイルの掃除（`npm run lint` を通る状態にする）
2. 旧アクセスキーの平文が git 履歴に残っている件（履歴書き換え or キー変更。Private 化の判断とセットで）
3. Tailwind CDN（cdn.tailwindcss.com）の同梱化＋ index.html の未使用 importmap 削除。見た目の完全一致検証が必須の大きめ作業
4. リポジトリ Private 化の判断（無料プランでは Private + Pages 不可 → GitHub Pro 月$4 か、他ホスティングへ引っ越し）— オーナー判断待ち
