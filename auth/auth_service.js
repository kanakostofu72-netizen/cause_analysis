/**
 * auth/auth_service.js
 * 
 * Googleアカウント認証サービス
 * - ダミーキー環境: モック認証（アカウント選択・シミュレーション）
 * - 実キー環境: Firebase Authentication (GoogleAuthProvider + signInWithPopup)
 * 統一されたインターフェースを提供し、画面側（app）は切り替えを意識せず使えます。
 */

import { firebaseConfigManager } from "./firebase_config.js";
import { userSession } from "./user_session.js";

// モック用のサンプルGoogleユーザー定義
export const MOCK_USERS = [
  {
    uid: "google-uid-tanaka-001",
    displayName: "田中 太郎",
    email: "tanaka.taro@edu-sample.jp",
    photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
    role: "student",
    studentId: "STU-2024-001",
    organization: "第一高校 数学科"
  },
  {
    uid: "google-uid-sato-002",
    displayName: "佐藤 花子",
    email: "sato.hanako@edu-sample.jp",
    photoURL: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    role: "student",
    studentId: "STU-2024-002",
    organization: "第一高校 数学科"
  },
  {
    uid: "google-uid-suzuki-999",
    displayName: "鈴木 健一 (指導教員)",
    email: "suzuki.teacher@edu-sample.jp",
    photoURL: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
    role: "teacher",
    studentId: "TCH-2024-101",
    organization: "教育支援センター"
  }
];

class AuthService {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      await firebaseConfigManager.loadConfig();
      this.initialized = true;
    }
  }

  /**
   * Googleログインを実行します
   * @param {Object} [mockUserOverride] モック時に指定のアカウントでログインしたい場合
   * @returns {Promise<Object>} 認証されたユーザーオブジェクト
   */
  async signInWithGoogle(mockUserOverride = null) {
    await this.init();

    if (firebaseConfigManager.isMock) {
      return this._mockSignIn(mockUserOverride);
    } else {
      return this._realFirebaseSignIn();
    }
  }

  /**
   * モック環境でのGoogleログインシミュレーション
   */
  async _mockSignIn(selectedUser) {
    console.log("[Auth] 🧪 モックGoogle認証を開始します...");
    
    // 少しのディレイを入れてネットワーク認証を再現
    await new Promise((resolve) => setTimeout(resolve, 500));

    const user = selectedUser || MOCK_USERS[0];
    const authenticatedUser = {
      ...user,
      provider: "google.com",
      authTime: new Date().toISOString(),
      isMock: true
    };

    userSession.setUser(authenticatedUser, true);
    console.log("[Auth] ✅ モック認証に成功しました:", authenticatedUser.displayName);
    return authenticatedUser;
  }

  /**
   * 実際のFirebase SDKを使ったGoogle OAuthポップアップ認証
   */
  async _realFirebaseSignIn() {
    console.log("[Auth] 🚀 実際のFirebase AuthenticationでGoogleログインを開始します...");
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import(
        "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"
      );

      const provider = new GoogleAuthProvider();
      provider.addScope("profile");
      provider.addScope("email");

      const result = await signInWithPopup(firebaseConfigManager.firebaseAuth, provider);
      const fbUser = result.user;

      const user = {
        uid: fbUser.uid,
        displayName: fbUser.displayName || "Googleユーザー",
        email: fbUser.email,
        photoURL: fbUser.photoURL || "",
        provider: "google.com",
        authTime: new Date().toISOString(),
        isMock: false
      };

      userSession.setUser(user, true);
      console.log("[Auth] ✅ Firebase Google認証に成功しました:", user.displayName);
      return user;
    } catch (error) {
      console.error("[Auth] ❌ Google認証エラー:", error);
      throw error;
    }
  }

  /**
   * ログアウト
   */
  async signOut() {
    await this.init();
    if (!firebaseConfigManager.isMock && firebaseConfigManager.firebaseAuth) {
      try {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        await signOut(firebaseConfigManager.firebaseAuth);
      } catch (e) {
        console.warn("[Auth] Firebaseログアウト中に警告:", e);
      }
    }
    userSession.clearUser();
    console.log("[Auth] 🔒 ログアウトしました。");
  }

  /**
   * 現在のユーザーを取得
   */
  getCurrentUser() {
    return userSession.getUser();
  }

  /**
   * 認証状態の監視
   */
  onAuthStateChanged(callback) {
    return userSession.onAuthStateChange(callback);
  }
}

export const authService = new AuthService();
