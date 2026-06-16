# Basket Clock PWA

iPad横画面で使う、ローカル専用のバスケット用タイマー兼スコア表示PWAです。

## ファイル

- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- `service-worker.js`
- `audio/*.mp3`

## PCでローカルサーバーを立てる

このフォルダで以下を実行します。

```powershell
python -m http.server 8000
```

Pythonが使えない場合は、同梱のNodeサーバーも使えます。

```powershell
node work/static-server.js
```

PC側でファイアウォール確認が出た場合は、同じWi-Fi内のiPadからアクセスできるよう許可してください。

## iPadからアクセスする

1. PCとiPadを同じWi-Fiに接続します。
2. PCのIPアドレスを確認します。
3. iPadのSafariで `http://PCのIPアドレス:8000/` を開きます。
4. 画面が表示されたら、数秒待ってService Workerと音声ファイルのキャッシュを完了させます。

## ホーム画面に追加する

1. iPadのSafariでアプリを開きます。
2. 共有ボタンを押します。
3. 「ホーム画面に追加」を選びます。
4. ホーム画面に追加されたアイコンから起動します。

## オフライン利用の重要チェック

体育館で使う前に、必ず以下を確認してください。

1. 初回だけPCサーバーを起動して、iPadのSafariでアプリを開きます。
2. SafariのWebインスペクタ、またはconsoleで `Service Worker ready:` と `Offline index cached: true` が出ることを確認します。
3. Safariでホーム画面に追加します。
4. iPadを機内モードにします。
5. ホーム画面アイコンからアプリを起動します。
6. そのまま動くだけでなく、アプリを完全終了してから、機内モードのまま再度ホーム画面アイコンから起動します。
7. タイマー画面が表示され、操作できることを確認します。

この確認が成功して初めて、ネット環境のない体育館で使える状態です。

## iPadで完全オフライン起動できない場合

iPadで `http://PCのIPアドレス:8000/` のようなLAN内HTTPから開いている場合、iOS SafariがService Workerを登録できないことがあります。
Service Workerが登録できない場合、ホーム画面アプリを完全終了した後のオフライン再起動はできません。

完全オフライン再起動には、初回登録時にService Workerが使える安全なoriginで開く必要があります。

- `Service Worker ready:` がconsoleに出ていること
- `Offline index cached: true` がconsoleに出ていること
- ホーム画面追加後、機内モードで完全終了から再起動できること

この3つが揃っている状態で使ってください。

## オフライン利用の注意

- 初回読み込み前はオフラインでは起動できません。
- Service Workerは `index.html`、CSS、JavaScript、manifest、音声mp3をキャッシュします。
- 音声を鳴らすには、iPad本体の音量と消音スイッチ設定も確認してください。
- ファイルを更新した後は、PCサーバーを起動した状態でiPadから一度開き直し、新しいキャッシュを取得してください。

## HTTPS公開する理由

iPadでホーム画面PWAを完全オフライン再起動するには、Service Workerが確実に登録されている必要があります。
LAN内の `http://PCのIPアドレス:8000/` では、iOS SafariがService Workerを登録できない場合があります。

GitHub PagesまたはCloudflare PagesでHTTPS公開してからiPadにインストールしてください。

## GitHub Pagesで公開する

1. このフォルダの内容をGitHubリポジトリにpushします。
2. GitHubのリポジトリ画面で `Settings` を開きます。
3. `Pages` を開きます。
4. `Build and deployment` のSourceを `Deploy from a branch` にします。
5. Branchを `main`、Folderを `/root` にします。
6. 表示された `https://ユーザー名.github.io/リポジトリ名/` をSafariで開きます。

GitHub Pagesのサブディレクトリ公開でも動くように、パスは相対パスだけを使っています。

## Cloudflare Pagesで公開する

1. Cloudflare Pagesで新しいProjectを作ります。
2. GitHubリポジトリを接続します。
3. Framework presetは指定なし、または `None` にします。
4. Build commandは空欄にします。
5. Build output directoryは `/` または空欄にします。
6. 発行された `https://プロジェクト名.pages.dev/` をSafariで開きます。

`_headers` により、`service-worker.js` や `index.html` は更新確認しやすいキャッシュ設定にしています。

## HTTPS公開後のiPadインストール手順

1. iPadのSafariでHTTPSの公開URLを開きます。
2. 画面が表示されたら、10秒ほど待ちます。
3. 可能ならWebインスペクタで `Service Worker ready:` と `Offline index cached: true` を確認します。
4. Safariの共有ボタンから「ホーム画面に追加」を選びます。
5. ホーム画面アイコンから起動します。
6. iPadを機内モードにします。
7. アプリを完全終了します。
8. 機内モードのまま、ホーム画面アイコンから再起動します。
9. タイマー画面が表示されれば、体育館で使える状態です。
