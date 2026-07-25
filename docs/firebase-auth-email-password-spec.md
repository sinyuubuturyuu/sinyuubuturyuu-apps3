# Firebase Authentication 開発環境移行仕様（スマートフォン側）

## 目的

本番 Firebase `sinyuubuturyuu-86aeb` を保護し、スマートフォン側アプリをクラウド開発環境 `sinyuubuturyuu-dev` で検証するための手順です。この文書の更新だけでは、稼働中のアプリやブラウザの接続先は変わりません。

## 環境

- 本番: `sinyuubuturyuu-86aeb`
- クラウド開発環境: `sinyuubuturyuu-dev`
- ローカル Emulator: Auth `127.0.0.1:9099`、Firestore `127.0.0.1:8080`

クラウド開発環境と Emulator は別環境です。指定された方だけを使用します。

## 作業開始前

1. `upstream/main` の最新状態と作業ツリーを確認する。
2. 作業当日の日付で `feature/dev-env-YYYY-MM-DD` を作成する。
3. 既存ブランチを使う場合は、最新 `main` との差分を先に確認する。
4. Firebase Consoleなど信頼できる管理元で、現在の開発用Webアプリ設定を確認する。値を推測しない。
5. 別途指示がなければ、デプロイ、Firebaseデータ変更、commit、push、PR作成はしない。

## 主な設定候補

これは固定された完全一覧ではありません。作業時に実行コード内のFirebase参照を検索し、最新の影響範囲を確認します。

- `sinyuubuturyuu/launcher.js`
- `sinyuubuturyuu/driver-points/driver-points.js`
- `sinyuubuturyuu/getujinitijyoutenkenhyou/firebase-config.js`
- `sinyuubuturyuu/getujitiretenkenhyou/firebase/firebase-config.js`

Service Worker、キャッシュ名、HTMLのバージョン指定、Firebaseアプリ再利用処理が接続先へ影響する場合は、必要な関連ファイルも対象に含め、その理由を報告します。

## 切替要件

- `projectId`、`apiKey`、`authDomain`、`storageBucket`、`messagingSenderId`、`appId` を確認済みの開発用設定へ揃える。
- `measurementId` は開発用設定に存在するときだけ使用し、推測で追加しない。
- Firebaseアプリ再利用時は、名前だけでなく `projectId` が期待値と一致することを確認する。
- 本番と開発のService Worker・キャッシュを分離し、開発環境表示を維持する。
- コレクションや文書へ独自の `dev/` プレフィックスを追加しない。
- パスワード、サービスアカウント鍵などの資格情報を保存しない。
- 環境切替の差分を機能修正と分離し、本番復帰時に正確に取り除けるようにする。

## 確認

### 静的確認

- 実行対象ソースに本番ID `sinyuubuturyuu-86aeb` が残っていない。
- 設定の `projectId` が `sinyuubuturyuu-dev` である。
- 変更JavaScriptの構文確認と `git diff --check` が成功する。
- 差分が環境切替に必要なものだけで、本番復帰対象を一覧化できる。

ドキュメントや説明文にある本番IDは実行時接続先ではないため、分けて判定します。

### 実行時確認

実行確認を依頼された場合だけ行います。

- 古いService Workerやキャッシュの影響を除いて起動する。
- 初期化済みFirebaseアプリの `app.options.projectId` が `sinyuubuturyuu-dev` である。
- Auth・Firestoreの通信先が開発環境で、本番への通信・書込みがない。
- 資格情報を文書へ記載せず、承認済みの開発専用アカウントを使う。
- 書込みは開発環境の明示されたテストデータに限る。

## 完了報告

ブランチと基点、変更ファイルと理由、設定の確認元（秘密情報を除く）、確認結果、未確認事項、commit・push・PR・デプロイ・データ変更の有無を報告します。
