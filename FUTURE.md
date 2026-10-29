# 将来の機能拡張方針: Google認証（方法A）への移行ガイド (FUTURE.md)

本ドキュメントは、現在運用している「学年・組・出席番号によるDB照合ログイン（方法B）」から、将来的に「Firebase Web SDKを用いたGoogleアカウント認証（方法A）」へ切り替える際の手順および設計方針をまとめたガイドです。

---

## 1. 背景と現在の仕組み

### 現在の方式（方法B: 生徒識別照合）
- **利用ファイル**: `serviceAccountKey.json`（Google Cloud / Firebase Admin秘密鍵）
- **動作概要**: 
  1. ユーザーがログイン画面で「学年・組・出席番号」を入力。
  2. サーバー（`server.js`）が `serviceAccountKey.json` を使って直接 Firestore（プロジェクト: `rss-m1`）の `users` コレクションと照合。
  3. 一致した生徒のデータ（氏名、Googleメールアドレス、UID等）をセッションとして復元し、ダッシュボードを表示。
- **利点**: クライアント用のFirebase Web APIキーが未発行の状態でも、実DBの登録生徒情報や学習履歴を安全かつ確実に確認できます。

### 将来の方式（方法A: Google OAuth認証）
- **動作概要**:
  1. ログイン画面の「Google アカウントでログイン」ボタンを押下。
  2. Google公式の認証ポップアップが開き、自身のGoogleアカウント（Gmailや学校用Googleアカウント）を選択。
  3. 認証されたメールアドレスやUIDに基づき、Firestore内の該当ドキュメントと自動紐づけを行ってダッシュボードへ遷移。

---

## 2. 方法Aへの移行に必要な前提条件

方法Aを実施するためには、Firebaseコンソールから **Webアプリ用クライアント構成情報** を入手する必要があります。

### 手順 1: Firebase コンソールでの設定値確認
1. [Firebase Console](https://console.firebase.google.com/) にアクセスし、プロジェクト **`rss-m1`** を開きます。
2. 左上の歯車アイコン（プロジェクト設定）→ **「全般」** タブを開きます。
3. ページ下部の「マイアプリ」セクションにあるウェブアプリ（`</>`）を確認します。
   - まだ作成されていない場合は、「アプリを追加」をクリックしてウェブアプリを登録します。
4. 表示される `firebaseConfig` オブジェクトから、特に以下の値を取得します：
   - `apiKey`（例: `AIzaSy...`）
   - `authDomain`（例: `rss-m1.firebaseapp.com`）
   - `projectId`（`rss-m1`）
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### 手順 2: Authentication のプロバイダ設定確認
1. Firebase コンソールの左メニューから **「Authentication」** を開きます。
2. **「Sign-in method」** タブで **「Google」** が有効（Enabled）になっていることを確認します。
3. **「設定」** → **「承認済みドメイン」** に、ローカル開発環境である `localhost` が登録されていることを確認します。

### 手順 3: `.env` ファイルの更新
プロジェクト直下の `.env` を開き、ダミー値を本物のキーに差し替えます：

```env
# 実際のFirebase Web APIキー等に更新
FIREBASE_API_KEY=AIzaSy取得した本物のWebAPIキー
FIREBASE_AUTH_DOMAIN=rss-m1.firebaseapp.com
FIREBASE_PROJECT_ID=rss-m1
FIREBASE_STORAGE_BUCKET=rss-m1.appspot.com
FIREBASE_MESSAGING_SENDER_ID=取得したSenderID
FIREBASE_APP_ID=取得したAppID
```

---

## 3. ソースコードの切り替え手順（3ステップ）

既存のコードには、いつでも方法Aへ戻せるようにコメントアウトされたコードとガイドを配置済みです。

### ステップ 1: `app/index.html` の変更
`app/index.html` 内のフォーム部分を切り替えます：

1. `<form id="studentLoginForm"> ... </form>` 全体をコメントアウトします。
2. その直下にある `<!-- <button id="googleLoginBtn"> ... </button> -->` のコメントアウトを解除します。

### ステップ 2: `app/js/app.js` の変更
`app/js/app.js` 内のスクリプトを切り替えます：

1. `initApp()` 内の `studentLoginForm.addEventListener(...)` をコメントアウトします。
2. コメントアウトされている以下のブロックを有効化します：
   ```javascript
   import { authService } from "../../auth/auth_service.js";

   async function handleGoogleLogin() {
     try {
       setLoading(true, "Googleアカウント認証中...");
       const user = await authService.signInWithGoogle();
       showToast(`${user.displayName || "ユーザー"} さんとしてログインしました`, "success");
       setTimeout(() => {
         window.location.href = "dashboard.html";
       }, 400);
     } catch (error) {
       console.error("Google Login failed:", error);
       setLoading(false);
       showToast(`ログインに失敗しました: ${error.message || "エラー"}`, "error");
     }
   }

   // initApp内
   const googleLoginBtn = document.getElementById("googleLoginBtn");
   if (googleLoginBtn) {
     googleLoginBtn.addEventListener("click", handleGoogleLogin);
   }
   ```

### ステップ 3: サーバー再起動と動作確認
1. ターミナルでサーバーを再起動します（`node server.js`）。
2. ブラウザで `http://localhost:3000/app/index.html` を開き、「Google アカウントでログイン」ボタンを押下してポップアップ認証が正常に動作することを確認します。

---

## 4. デザイン方針の継続遵守（AGENT.md）

方法Aへ切り替えた後も、[AGENT.md](AGENT.md) に定義されている以下のデザイン方針を維持してください：

- **配色**: 白や水色（スカイブルー）を基調とした、清潔で知的なデザイン。
- **情報最小化**: 不要な長文説明やモック一覧は配置せず、視認性の高いシンプルなUIを保持する。
- **導線の単一化**: ログイン画面にはGoogleログインボタンのみを配置し、ユーザーが迷わずアクセスできるようにする。
