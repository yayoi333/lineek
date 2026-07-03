<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/05f610ff-030b-48dd-9d89-25d1357d9d7d

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## セキュリティ・データ保護に関する動作確認手順

以下は 2026-07 のセキュリティ改修（APIキー暗号化保存・削除の即時保存・データ非送信の明示・全データ削除・タブ画像編集の保持）の確認手順です。

### 1. APIキーの暗号化保存 → 復号して利用
1. ヘッダーの「APIキー設定」から Gemini APIキーを入力して保存する。
2. DevTools > Application > Local Storage を開き、`gemini_api_key`（平文）が存在せず、`gemini_api_key_enc`（暗号文）と `gemini_api_key_k`（鍵素材）が保存されていることを確認する。
3. ページをリロードし、「API設定済」表示になること（復号して読み込めていること）を確認する。
4. 旧バージョンからの移行確認: Local Storage に手動で `gemini_api_key` に平文キーをセットしてリロードすると、平文が削除され `gemini_api_key_enc` に移行されることを確認する。
- 注意: この暗号化は「簡易的な保護（難読化）」です。復号鍵も同じ端末に保存されるため、根本対策は外部CDN依存の同梱化・SRI・CSP による XSS 対策です（lib/storage.ts のコメント参照）。

### 2. 画像削除 → リロードで復活しない
1. 画像をアップロードして切り出し、編集画面に進む。
2. 絵文字の「×（完全に削除）」で削除する（最後の1個まで削除するケースも確認）。
3. ページをリロードし、「保存データが見つかりました」から復元しても、削除した絵文字が復活しないことを確認する。

### 3. 全データ削除
1. 編集画面右カラム下部の「データをすべて削除する」を押し、確認ダイアログで「削除する」を選ぶ。
2. アップロード画面に戻り、リロードしても復元ダイアログが表示されないことを確認する。
3. 「APIキー設定も削除する」にチェックした場合は、APIキーが未設定に戻ることを確認する。

### 4. タブ画像編集の保持
1. タブ画像を選択し、プレビューをクリックして編集画面を開く。
2. 消しゴムで一部を消して「完了」を押す。
3. もう一度編集画面を開き、消した部分が消えたまま（編集前に戻っていない）ことを確認する。

### 5. AI生成（翻訳）
1. タイトル・説明文を入力し「英語に翻訳」を押す。
2. 保存済み（暗号化された）APIキーが復号されて翻訳が成功することを確認する。
