/**
 * auth/user_session.js
 * 
 * ユーザーセッション管理モジュール
 * - ログイン中のユーザー情報をブラウザストレージに安全に保管・復元
 * - 認証ステートリスナーの登録と通知
 */

const STORAGE_KEY = "cause_analysis_user_session";

class UserSession {
  constructor() {
    this.currentUser = this.loadStoredUser();
    this.listeners = new Set();
  }

  /**
   * ストレージから保存されているユーザーを復元
   */
  loadStoredUser() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[Session] 保存されたセッションの読み込みに失敗しました:", e);
    }
    return null;
  }

  /**
   * ユーザー情報を設定
   * @param {Object} user 
   * @param {boolean} rememberMe 
   */
  setUser(user, rememberMe = true) {
    this.currentUser = user;
    try {
      const serialized = JSON.stringify(user);
      if (rememberMe) {
        localStorage.setItem(STORAGE_KEY, serialized);
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, serialized);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn("[Session] セッションの書き込みに失敗しました:", e);
    }
    this.notifyListeners();
  }

  /**
   * ログアウト・セッションクリア
   */
  clearUser() {
    this.currentUser = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("[Session] セッションの消去に失敗しました:", e);
    }
    this.notifyListeners();
  }

  /**
   * 現在のユーザーを取得
   */
  getUser() {
    return this.currentUser;
  }

  /**
   * 認証状態の変化を監視
   * @param {Function} callback 
   * @returns {Function} 解除関数
   */
  onAuthStateChange(callback) {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentUser);
      } catch (err) {
        console.error("[Session] リスナー実行エラー:", err);
      }
    }
  }
}

export const userSession = new UserSession();
