/**
 * auth/firebase_config.js
 * 
 * Firebase設定の読み込みと初期化モジュール
 * - .env またはサーバー (/api/config) から設定をロードします
 * - ダミーキー（未発行状態）の場合は自動的にモック（デモ）モードとして動作します
 * - 実キーが挿入された場合は本物のFirebase Web SDKを初期化します
 */

// デフォルトのダミー設定（サーバー未起動やローカル直接オープン時用フォールバック）
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDummyKey_ReplaceWithYourActualKey_1234567890",
  authDomain: "cause-analysis-demo.firebaseapp.com",
  projectId: "cause-analysis-demo",
  storageBucket: "cause-analysis-demo.appspot.com",
  messagingSenderId: "100000000000",
  appId: "1:100000000000:web:dummyappid0123456789abcdef",
  measurementId: "G-DUMMY12345",
  databaseURL: "https://cause-analysis-demo-default-rtdb.firebaseio.com",
  useMock: "auto"
};

/**
 * 現在のキーがダミーキーかどうか判定します
 * @param {string} apiKey 
 * @param {string} useMockSetting 
 * @returns {boolean}
 */
export function checkIfMockMode(apiKey, useMockSetting) {
  if (useMockSetting === "true" || useMockSetting === true) return true;
  if (useMockSetting === "false" || useMockSetting === false) return false;
  
  if (!apiKey) return true;
  const lower = apiKey.toLowerCase();
  return (
    lower.includes("dummy") ||
    lower.includes("replace") ||
    lower.includes("example") ||
    lower.includes("xxxx") ||
    apiKey === DEFAULT_FIREBASE_CONFIG.apiKey
  );
}

class FirebaseConfigManager {
  constructor() {
    this.config = { ...DEFAULT_FIREBASE_CONFIG };
    this.isLoaded = false;
    this.isMock = true;
    this.firebaseApp = null;
    this.firebaseAuth = null;
    this.firestoreDb = null;
  }

  /**
   * サーバーまたはローカルから設定を読み込みます
   */
  async loadConfig() {
    if (this.isLoaded) return this.config;

    try {
      // サーバーAPIから .env の設定を取得（server.js経由）
      const response = await fetch("/api/config", { cache: "no-store" });
      if (response.ok) {
        const serverConfig = await response.json();
        this.config = { ...this.config, ...serverConfig };
      }
    } catch {
      // 静的ファイル直接表示などでサーバーがない場合はデフォルトダミーを使用
      console.info("[Auth] サーバーから設定を取得できませんでした。デフォルトのダミー設定を使用します。");
    }

    this.isMock = checkIfMockMode(this.config.apiKey, this.config.useMock);
    this.isLoaded = true;

    if (!this.isMock) {
      await this.initRealFirebase();
    } else {
      console.log("%c[Auth] 🧪 モックモード（ダミーキー）で動作します", "color: #3b82f6; font-weight: bold;");
    }

    return this.config;
  }

  /**
   * 本物のFirebase SDKを動的インポートして初期化します
   */
  async initRealFirebase() {
    try {
      console.log("[Auth] 🚀 実際のFirebaseキーを検出しました。Firebase Web SDKを初期化します...");
      // Firebase CDNからモジュールをロード
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
      const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      this.firebaseApp = initializeApp({
        apiKey: this.config.apiKey,
        authDomain: this.config.authDomain,
        projectId: this.config.projectId,
        storageBucket: this.config.storageBucket,
        messagingSenderId: this.config.messagingSenderId,
        appId: this.config.appId,
        measurementId: this.config.measurementId
      });

      this.firebaseAuth = getAuth(this.firebaseApp);
      this.firestoreDb = getFirestore(this.firebaseApp);
      console.log("[Auth] ✅ Firebase の初期化が完了しました。");
    } catch (error) {
      console.error("[Auth] ❌ Firebaseの初期化に失敗しました。モックモードにフォールバックします:", error);
      this.isMock = true;
    }
  }

  getStatus() {
    return {
      isLoaded: this.isLoaded,
      isMock: this.isMock,
      projectId: this.config.projectId,
      apiKeyMasked: this.config.apiKey ? `${this.config.apiKey.substring(0, 8)}...` : "(未設定)"
    };
  }
}

export const firebaseConfigManager = new FirebaseConfigManager();
