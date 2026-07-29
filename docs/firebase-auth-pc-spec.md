# Firebase Authentication 環境切替仕様（PC側）

## 目的

本番 Firebase `sinyuubuturyuu-86aeb` を保護しながら、PC側アプリをクラウド開発環境 `sinyuubuturyuu-dev` へ切り替え、検証後に本番環境へ安全に戻すための手順です。

この文書の更新だけでは、稼働中のアプリやブラウザの接続先は変わりません。

## 環境

- 本番: `sinyuubuturyuu-86aeb`
- クラウド開発環境: `sinyuubuturyuu-dev`
- ローカル Emulator: Auth `127.0.0.1:9099`、Firestore `127.0.0.1:8080`

クラウド開発環境と Emulator は別環境です。依頼で指定された環境だけを使用します。

## 作業開始前

1. 現在のブランチ、`main` の基点、作業ツリーを確認する。
2. 開発環境移行では、作業当日の日付で `feature/dev-env-YYYY-MM-DD` を作成する。
3. 本番復帰では、新しいブランチを作らず、指定された現在の作業ブランチを使用する。
4. 既存ブランチを使う場合は、`main` との差分を確認し、環境切替と機能変更を分類する。
5. Firebase Consoleなど信頼できる管理元で、対象環境のWebアプリ設定を確認する。値を推測しない。
6. 環境切替と無関係な機能変更やユーザーの未コミット変更を保持する。
7. 別途指示がなければ、デプロイ、Firebaseデータ変更、commit、push、PR作成はしない。

## 主な確認対象

### Firebase設定・初期化

- `sinyuubuturyuu-pc/getujinitijyoutenkenhyou-pc/src/main.js`
- `sinyuubuturyuu-pc/getujitiretenkenhyou-pc/firebase/firebase-config.js`
- `sinyuubuturyuu-pc/driver-points-kanri/firebase-config.js`

### 関連画面・読込みバージョン

Firebase設定、Service Worker、キャッシュ、HTMLのバージョン指定、Firebaseアプリ再利用処理が接続先へ影響する場合は、必要な関連ファイルを確認対象に含めます。

これは固定された変更一覧ではありません。作業時に実行コード内のFirebase参照と現在の差分を検索し、接続先へ影響するファイルだけを変更します。

## 開発環境移行

- `projectId`、`apiKey`、`authDomain`、`storageBucket`、`messagingSenderId`、`appId`を、確認済みの開発用設定へ揃える。
- `measurementId`は開発用設定に存在するときだけ使用し、推測で追加しない。
- Firebaseアプリ再利用時は、名前だけでなく`app.options.projectId`が`sinyuubuturyuu-dev`と一致することを確認する。
- 本番と開発のService Worker・キャッシュを分離する。
- コレクションや文書へ独自の`dev/`プレフィックスを追加しない。
- パスワード、サービスアカウント鍵などの資格情報を保存しない。

## 本番環境への復帰

- 新しいブランチを作らず、指定された作業ブランチ上で復帰する。
- Firebase設定全項目を、確認済みの本番`sinyuubuturyuu-86aeb`用設定へ揃える。
- 開発用Service Worker、キャッシュ名、HTMLの読込みバージョンがある場合は、本番用の新しい識別子へ変更する。
- 開発環境表示がある画面では、DEV表示の文字だけでなく、背景・枠・余白を含む要素全体が表示されないことをブラウザ上で確認する。
- Firebaseアプリ再利用の安全対策など、環境に依存しない改善は保持する。
- ポイント加算機能など、環境切替と無関係な機能変更を取り消さない。

## 確認

### 静的確認

- 対象環境のFirebase設定全項目が、同じFirebaseプロジェクトの値で揃っている。
- 起動時設定の`projectId`が依頼された環境と一致する。
- 反対側の環境値が、実際に使用されるFirebase設定オブジェクトに残っていない。
- 環境判定用の比較定数、docs、説明文は、実際の接続設定と分けて判定する。
- Service Worker、キャッシュ名、HTMLの読込みバージョンが対象環境と一致する。
- 変更JavaScriptの`node --check`と`git diff --check`が成功する。
- 差分が環境切替に必要な範囲だけで、既存の機能変更が保持されている。

### 実行時確認

実行確認を依頼された場合だけ行います。

- 古いService Workerやキャッシュの影響を除いて起動する。
- 初期化済みFirebaseアプリの`app.options.projectId`が対象環境と一致する。
- Auth・Firestoreの通信先が対象環境で、反対側の環境への通信・書込みがない。
- 資格情報を文書へ記載せず、承認済みの対象環境用アカウントを使う。
- 開発環境での書込みは、明示されたテストデータに限る。

## 依頼文に含める項目

そのままコピーできる依頼文は [Firebase環境切替 コピペ用依頼文](./firebase-environment-switch-request-templates.md) にあります。

- 開発環境移行か本番復帰か
- 実際に使用するブランチ名
- 新規ブランチ作成の要否
- 対象Firebaseプロジェクト
- 既存の機能変更を保持する指示
- Firebase設定、キャッシュ、Service Workerを確認する指示
- 実行時確認、デプロイ、データ変更、commit、push、PR作成の可否
- 変更ファイルと確認結果を報告する指示

## 完了報告

ブランチと基点、変更ファイルと理由、設定の確認元（秘密情報を除く）、静的確認と実行時確認の結果、保持した既存変更、未確認事項、commit・push・PR・デプロイ・Firebaseデータ変更の有無を報告します。
