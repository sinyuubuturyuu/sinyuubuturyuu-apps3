# PC用 Firebase Authentication 仕様メモ

## 目的

PC 側アプリの Firebase 設定と認証方針を、単一コードベース前提で整理する。

この資料は、今回の開発環境切替と運用整理のための補助メモとして扱う。
将来、切替方式や運用手順が別の形で確定した場合は、この資料は更新停止または削除してよい。

## この資料を参照した作業指示

「この docs を参照して、開発環境へ切り替えてください」という依頼は、次を意味する。

- `main` ではなく作業ブランチで実施する
- 実行コードを対象にして Firebase を `sinyuubuturyuu-dev` へ切り替える
- 本番 Firebase `sinyuubuturyuu-86aeb` へは書き込まない
- 切替後に `projectId` と実際の読込先・書込先を確認する
- 変更したファイルと確認結果を報告する

資料自体の更新は、依頼で明示された場合か、手順との不整合を直す必要がある場合だけ行う。

## 今回の切替対象ファイル

- `sinyuubuturyuu-pc/getujinitijyoutenkenhyou-pc/src/main.js`
- `sinyuubuturyuu-pc/getujitiretenkenhyou-pc/firebase/firebase-config.js`
- `sinyuubuturyuu-pc/driver-points-kanri/firebase-config.js`

## 確認手順

1. Firebase 設定の `projectId` が `sinyuubuturyuu-dev` になっていることを確認する
2. 起動後に実際の読込先・書込先が `sinyuubuturyuu-dev` であることを確認する
3. 本番 Firebase に書き込まれていないことを確認する

## 受け入れ条件

- 未ログインでは PC ランチャーを使えない
- ログイン後に PC ランチャーが表示される
- 再読込み後もログイン状態が維持される
- 本体コードに `dev/...` 前提の参照が残っていない
