# Firebase Emulator 起動・停止マニュアル

対象リポジトリ:

```powershell
C:\GitHub\sinyuubuturyuu-apps3
```

## 1. エミュレーターを起動する

PowerShell を開き、リポジトリ直下へ移動します。

```powershell
cd C:\GitHub\sinyuubuturyuu-apps3
```

Firebase Emulator と launcher をまとめて起動します。

```powershell
.\launcher\start-firebase-local-stack.ps1
```

実行すると、PowerShell ウィンドウが2つ開きます。

```text
1つ目: Firebase Emulator 用
2つ目: launcher 用
```

## 2. 起動後に開く画面

Firebase Emulator の管理画面:

```text
http://127.0.0.1:4000/
```

アプリをエミュレーター接続で開くURLは、launcher 用 PowerShell ウィンドウに表示されます。

表示例:

```text
Launcher server running at http://127.0.0.1:8082
Launcher mode: Firebase Emulator mode
Open launcher: http://127.0.0.1:8082/
Open mobile app: http://127.0.0.1:8082/sinyuubuturyuu/index.html
Open PC app: http://127.0.0.1:8082/sinyuubuturyuu-pc/index.html
Firebase emulator runtime injection enabled.
Firebase Emulator target: http://127.0.0.1:8082/sinyuubuturyuu/index.html
```

この中で必ず確認する行:

```text
Firebase Emulator target:
```

この行に表示されたURLが、エミュレーター接続の対象アプリです。

例:

```text
Firebase Emulator target: http://127.0.0.1:8082/sinyuubuturyuu/index.html
```

この場合、開くURLは以下です。

```text
http://127.0.0.1:8082/sinyuubuturyuu/index.html
```

## 3. なぜ 8081 ではなく 8082 になることがあるか

通常 launcher がすでに `8081` を使っている場合、エミュレーター用 launcher は自動的に次のポートへ移動します。

例:

```text
8081: 通常 launcher
8082: エミュレーター用 launcher
```

そのため、エミュレーター接続で開くURLは固定ではありません。

必ず launcher 用 PowerShell ウィンドウに表示される次の行を確認してください。

```text
Firebase Emulator target:
```

## 4. エミュレーターを停止する

起動時に開いた2つの PowerShell ウィンドウで、それぞれ `Ctrl + C` を押します。

```powershell
Ctrl + C
```

停止する対象:

```text
1つ目: Firebase Emulator 用 PowerShell
2つ目: launcher 用 PowerShell
```

Firebase Emulator 側では、次のような表示が出れば正常に停止中です。

```text
Received SIGINT (Ctrl-C)
Starting a clean shutdown.
Shutting down emulators.
Stopping Emulator UI
Stopping Firestore Emulator
Stopping Authentication Emulator
```

PowerShell の入力待ちに戻れば停止完了です。

```powershell
PS C:\GitHub\sinyuubuturyuu-apps3>
```

## 5. 停止確認

別の PowerShell で以下を実行します。

```powershell
netstat -ano | findstr ":4000 :4400 :8080 :8081 :8082 :9099 :9150"
```

`LISTENING` が出なければ停止済みです。

停止済みでも、以下のような表示が一時的に残ることがあります。

```text
TIME_WAIT
SYN_SENT
```

これは終了待ちの通信なので、基本的に問題ありません。

## 6. 起動中の例

エミュレーターが起動中の場合、以下のように `LISTENING` が表示されます。

```text
TCP 127.0.0.1:4000  0.0.0.0:0  LISTENING  <PID>
TCP 127.0.0.1:4400  0.0.0.0:0  LISTENING  <PID>
TCP 127.0.0.1:8080  0.0.0.0:0  LISTENING  <PID>
TCP 0.0.0.0:8081    0.0.0.0:0  LISTENING  <PID>
TCP 127.0.0.1:9099  0.0.0.0:0  LISTENING  <PID>
TCP 127.0.0.1:9150  0.0.0.0:0  LISTENING  <PID>
```

`8082` で起動している場合もあります。

```text
TCP 0.0.0.0:8082    0.0.0.0:0  LISTENING  <PID>
```

## 7. 強制停止する場合

`Ctrl + C` で止まらない場合は、`LISTENING` の右端に表示されている PID を指定して停止します。

例:

```text
TCP 127.0.0.1:8080  0.0.0.0:0  LISTENING  10520
```

この場合:

```powershell
Stop-Process -Id 10520 -Force
```

複数まとめて止める場合:

```powershell
Stop-Process -Id <PID1>,<PID2>,<PID3> -Force
```

例:

```powershell
Stop-Process -Id 13208,10520,25808 -Force
```

## 8. 注意点

`svchost.exe` は止めないでください。

特に、以下のような `UDP 4500` が表示されることがあります。

```text
UDP 0.0.0.0:4500 *:* <PID>
```

この PID が `svchost.exe` の場合、それは Firebase Emulator ではありません。

確認例:

```powershell
Get-Process -Id <PID>
```

`svchost.exe` の場合は停止しないでください。

## 9. 通常ログインとの違い

通常ログインで使う場合は、VSCode の Ctrl + F5 で launcher だけを起動します。

通常起動では Firebase Emulator は使いません。

```text
通常起動:
launcher のみ

エミュレーター起動:
Firebase Emulator + emulator 用 launcher
```

エミュレーターを使う場合だけ、以下を実行します。

```powershell
.\launcher\start-firebase-local-stack.ps1
```

## 10. 重要な確認ポイント

エミュレーター接続でアプリを開くときは、必ず launcher 用 PowerShell ウィンドウの次の行を確認してください。

```text
Firebase Emulator target:
```

ここに表示されたURLを開いてください。

`8081` とは限りません。  
`8082` や別のポートになる場合があります。
