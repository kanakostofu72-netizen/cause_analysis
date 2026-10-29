# 原因分析プラットフォーム (cause_analysis) - Google認証 & データ連携基盤

Googleアカウント（OAuth）による認証を行い、Firebaseに管理されているユーザー情報（どのアカウントが誰に対応しているかのマッピング）およびGoogleアカウントに紐づいた**対話データ**や**問題データ**を取得してシステム内で利活用するためのWebフロントエンド＆サービス連携基盤です。

APIキーが未発行の状態でも、**モック（ダミーキー）モード**により画面動作・データ取得・分析を即座にお試しいただけます。実キー発行後は、`.env` ファイルを書き換えるだけで本番のFirebaseにシームレスに切り替わります。

---

## 📁 ディレクトリ構成

ユーザー様のご要望に沿って、UIと認証・データ処理を適切なフォルダ構成で分離・設計しています。

```
cause_analysis/
├── .gitignore                   # 機密情報（.env, credentials等）の流出を完全に防止
├── .env.example                 # Firebase設定の雛形（Git共有用・ダミー値入り）
├── .env                         # ローカル実行環境設定（※Git対象外・安全に保管）
├── package.json                 # 起動スクリプト定義
├── server.js                    # Node標準モジュールで動くゼロ依存ローカルWebサーバー
│
├── app/                         # 【ログイン画面・UI】ユーザーインターフェース
│   ├── index.html               # Googleログインポータル画面
│   ├── dashboard.html           # 認証後ダッシュボード（対話データ・問題データ閲覧・活用）
│   ├── css/
│   │   ├── style.css            # デザインシステム（グラスモフィズム・モダンカラー）
│   │   ├── auth.css             # ログインカード・Google公式ボタンスタイル
│   │   └── dashboard.css        # チャットログ・学習問題データテーブル用スタイル
│   └── js/
│       ├── app.js               # ログイン画面のインタラクション制御
│       └── dashboard.js         # ダッシュボードのデータ描画・エクスポート制御
│
├── auth/                        # 【認証処理層】ログインにまつわる裏側処理
│   ├── firebase_config.js       # Firebase設定読み込み＆ダミーキー/実キー自動判定
│   ├── auth_service.js          # Google OAuth処理（実Firebase Auth & モック自動切り替え）
│   └── user_session.js          # ログインセッションの保持・復元・ログアウト
│
├── services/                    # 【データ連携層】対話データ・問題データ取得処理
│   ├── data_service.js          # Googleアカウントに紐づくデータ取得アダプター (JS)
│   ├── mock_store.js            # ダミー環境用高品質データ（学習マップと連携）
│   └── firebase_client.py       # Python分析スクリプト用クライアント (Python)
│
└── 学習マップ/                   # 既存の学習マップ・問題分析資産
    ├── learning_map.json        # 学習項目のグラフデータ
    ├── view_map.py              # グラフ可視化スクリプト
    └── test_map.py
```

---

## 🔒 セキュリティとGit管理の安全性

- **APIキー等の機密情報はすべて `.env` で管理**し、[`.gitignore`](file:///c:/Users/oishi/github/cause_analysis/.gitignore) によりGitのコミット・プッシュ対象から確実に除外しています。
- チーム開発やリポジトリ共有用に [`.env.example`](file:///c:/Users/oishi/github/cause_analysis/.env.example) を用意しています。

```bash
# git status で .env が除外されていることを確認済み
git status
# -> .env は一覧に表示されず、外部へ流出することはありません
```

---

## 🚀 起動方法

### 方法1: Node.js による起動（推奨・最も簡単）
Node.js標準機能のみで動作するため、`npm install` なしで即起動できます。

```bash
# 起動コマンド（どちらでも可）
npm start
# または
node server.js
```

起動後、ブラウザで **[http://localhost:3000/](http://localhost:3000/)** を開いてください。

### 方法2: Pythonによる確認
Python分析スクリプトから対話データ・問題データを直接取得する場合:

```bash
python services/firebase_client.py
```

---

## 🔑 Firebase APIキーの差し替え手順（実キー入手時）

実際のFirebase APIキーを取得した際は、以下の手順で実環境に移行できます。

1. プロジェクトルートの [`.env`](file:///c:/Users/oishi/github/cause_analysis/.env) ファイルを開きます。
2. Firebase管理者から提供された実際のパラメータを貼り付けます：

```env
USE_MOCK_DATA=auto

FIREBASE_API_KEY=AIzaSy実際のAPIキー...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef123456
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

3. サーバーを再起動（`npm start`）します。
   - 実キーが検出されると、自動的に「🚀 Firebase接続中」モードとなり、本物の Google 認証ポップアップと Firestore データ取得が有効化されます。

---

## 💡 機能ハイライト

1. **Google アカウント認証（UI & ロジック分離）**
   - Google公式デザインガイドラインに準拠したログインUI。
   - ダミーキー稼働時は、ワンクリックでテストユーザー（田中太郎、佐藤花子、鈴木指導員など）を選択して即座にログイン体験が可能。
2. **アカウントに紐づくデータの取得 & 可視化**
   - **対話データ (Dialogue History)**: 学習者とAIチューターとのチャット対話ログを一覧＆タイムラインモーダルで表示。
   - **問題データ (Problem Performance & Cause Analysis)**: `learning_map.json` に連動した数学問題の合否、スコア、試行回数、および「つまずき要因（Cause of Mistake）」の詳細分析ノートを可視化。
3. **追加問題作成（つまづき箇所の特定 ＆ 4分類の誤答原因確率分配）**
   - 他システムで解答した問題データ（問題画像・解答画像・対話ログ）から、LLMがつまづき箇所（問題文/解答の行数や記述箇所）を特定。
   - 対話データにおける生徒の思考プロセス・自己申告から、4つの誤答原因（①数概念、②計算の正確さ・流暢性、③数学的事実の既往、④数学的推論の正確さ）に**総和1.0（100%）**として確率を分配。
   - 対話からの根拠引用およびLLMプロンプトの閲覧・確認機能。
4. **こちらのシステムでのデータ利用**
   - JSONコピー＆ダウンロード機能。
   - Pythonクライアント（[`services/firebase_client.py`](file:///c:/Users/oishi/github/cause_analysis/services/firebase_client.py)）を通じて、Pythonによる原因分析・可視化処理（`学習マップ`）へダイレクトにデータ受け渡しが可能。