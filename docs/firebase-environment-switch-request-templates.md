# Firebase環境切替 コピペ用依頼文

以下のコードブロック内を、そのままコピーして使用できます。ブランチ名や日付の手入力は不要です。

## 開発環境へ移行する

```text
次の2つのdocsを参照し、mainの最新状態から作業当日の日付を使った feature/dev-env-YYYY-MM-DD ブランチを作成して、Firebaseクラウド開発環境へ切り替えてください。

参照するdocs:
- docs/firebase-auth-email-password-spec.md
- docs/firebase-auth-pc-spec.md

条件:
- YYYY-MM-DDは固定値ではなく、必ず作業当日の日付へ置き換えてください。
- 本番Firebase sinyuubuturyuu-86aebへの通信・書込みを防いでください。
- 開発Firebase sinyuubuturyuu-devの現在のWebアプリ設定を信頼できる管理元で確認し、値を推測しないでください。
- projectIdだけでなく、apiKey、authDomain、storageBucket、messagingSenderId、appIdを同じ開発プロジェクトの値へ揃えてください。
- measurementIdは開発用設定に存在する場合だけ使用してください。
- Firebaseアプリ再利用時はapp.options.projectIdがsinyuubuturyuu-devと一致することを確認してください。
- Service Worker、キャッシュ名、HTMLの読込みバージョンを本番環境と分離してください。
- 開発環境であることを画面上で識別できる状態にしてください。
- docs記載のファイル一覧を固定一覧と考えず、実行コードのFirebase参照と現在の差分から影響範囲を確認してください。
- 環境切替と無関係な既存変更や未コミット変更を失わないでください。
- mainへ直接変更を入れないでください。
- Firebaseデータ変更、デプロイ、commit、push、PR作成は行わないでください。

確認:
- 実際に使われるFirebase設定のprojectIdがsinyuubuturyuu-devであること。
- 実際に使われるFirebase設定オブジェクトに本番用の値が残っていないこと。
- 環境判定用定数、docs、説明文のIDは接続設定と分けて判定すること。
- 変更JavaScriptのnode --checkとgit diff --checkが成功すること。

最後に、作成したブランチ、基点、変更ファイルと理由、確認結果、保持した既存変更、未確認事項、Firebaseデータ変更・デプロイ・commit・push・PR作成の有無を報告してください。
```

## 本番環境へ復帰する

```text
次の2つのdocsを参照し、現在チェックアウト中の作業ブランチをFirebase本番環境へ戻してください。ブランチ名は作業開始前にGitで確認し、その名前を報告してください。

参照するdocs:
- docs/firebase-auth-email-password-spec.md
- docs/firebase-auth-pc-spec.md

条件:
- 新しいブランチは作らず、現在の作業ブランチ上だけで復帰してください。
- mainへ直接変更を入れないでください。
- 本番Firebase sinyuubuturyuu-86aebの確認済みWebアプリ設定を使用し、値を推測しないでください。
- projectIdだけでなく、apiKey、authDomain、storageBucket、messagingSenderId、appId、measurementIdを同じ本番プロジェクトの値へ揃えてください。
- Service Worker、キャッシュ名、HTMLの読込みバージョンを本番用の新しい識別子へ変更してください。
- 本番設定ではDEV表示の文字だけでなく、背景・枠・余白を含む要素全体が表示されないことを、ブラウザ上で確認してください。
- docs記載のファイル一覧を固定一覧と考えず、実行コードのFirebase参照と現在の差分から影響範囲を確認してください。
- Firebaseアプリ再利用の安全対策など、環境に依存しない改善を保持してください。
- ポイント加算機能など、環境切替と無関係な既存変更や未コミット変更を失わないでください。
- Firebaseデータ変更、デプロイ、commit、push、PR作成は行わないでください。

確認:
- 実際に使われるFirebase設定のprojectIdがsinyuubuturyuu-86aebであること。
- 実際に使われるFirebase設定オブジェクトに開発用の値が残っていないこと。
- 環境判定用定数、docs、説明文のIDは接続設定と分けて判定すること。
- 開発用のService Worker、キャッシュ名、読込みバージョンが残っていないこと。
- 変更JavaScriptのnode --checkとgit diff --checkが成功すること。

最後に、使用したブランチ、基点、変更ファイルと理由、確認結果、保持した既存変更、未確認事項、Firebaseデータ変更・デプロイ・commit・push・PR作成の有無を報告してください。
```
