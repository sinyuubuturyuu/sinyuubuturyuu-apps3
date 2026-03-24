# 月次日常点検 Webアプリ（MVP）

## 起動方法
1. Node.js 18 以上を用意
2. プロジェクト直下で実行

```bash
npm start
```

3. ブラウザで `http://localhost:3000` を開く

## GitHub Pagesで開く
- ルートの `index.html` から `src/index.html` へ遷移します。
- 点検データ本体の保存先は Firestore の `nichijyoutenkenhyou` コレクションです。
- 車番・社員名候補は Firestore の `syainmei` コレクションを正本として読み込みます。
- Firebase の候補読込に失敗した場合のみ、この端末の `localStorage` 候補へ一時的に fallback します。

## 実装済み
- 点検セルクリックで `レ -> ☓ -> ▲ -> 空欄`
- 運行管理者印: 岸田
- 整備管理者印: 若本
- 月・車番・運転者キーで保存/読込

## ファイル
- `server/server.js`: API + 静的配信
- `src/index.html`: 画面
- `src/main.js`: 画面ロジック
- `src/styles.css`: スタイル
- `docs/roadmap-1month.md`: 1か月計画
