/**
 * app/js/app.js
 * 
 * ログイン画面の制御スクリプト
 * 
 * 【現在稼働中の認証方式（方法B）】
 * - 学年・組・出席番号を入力して送信
 * - バックエンド（server.js）経由で Firestore (rss-m1) の users コレクションと照合
 * - 一致した生徒のアカウント情報でセッションを確立してダッシュボードへ遷移
 * 
 * 【将来 Google OAuth 認証（方法A）へ切り替える場合の手順】
 * 1. Firebase コンソールから Web API キーを取得し、.env の FIREBASE_API_KEY に設定
 * 2. index.html 内の Google ログインボタンのコメントアウトを解除
 * 3. 本ファイルの「方法A: Google認証処理」ブロックのコメントアウトを解除し、
 *    「方法B: 学年・組・出席番号認証」をコメントアウトする
 * （詳細は FUTURE.md をご参照ください）
 */

import { userSession } from "../../auth/user_session.js";

// =============================================================================
// DOM 要素の取得
// =============================================================================
const studentLoginForm = document.getElementById("studentLoginForm");
const gradeInput = document.getElementById("gradeInput");
const classInput = document.getElementById("classInput");
const numberInput = document.getElementById("numberInput");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");
const toastContainer = document.getElementById("toastContainer");

/**
 * トースト通知の表示
 */
function showToast(message, type = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ"}</span>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * ボタンのローディング状態管理
 */
function setLoading(loading, message = "照合中...") {
  if (!loginSubmitBtn) return;
  if (loading) {
    loginSubmitBtn.disabled = true;
    if (btnText) btnText.textContent = message;
    if (btnSpinner) btnSpinner.style.display = "block";
  } else {
    loginSubmitBtn.disabled = false;
    if (btnText) btnText.textContent = "ログイン";
    if (btnSpinner) btnSpinner.style.display = "none";
  }
}

// =============================================================================
// 【方法B】 学年・組・出席番号による照合ログイン（現在稼働中）
// =============================================================================
async function handleStudentLogin(e) {
  e.preventDefault();

  const grade = gradeInput.value.trim();
  const className = classInput.value.trim();
  const studentNumber = numberInput.value.trim();

  if (!grade || !className || !studentNumber) {
    showToast("学年・組・出席番号をすべて入力してください", "error");
    return;
  }

  try {
    setLoading(true, "生徒情報を照合中...");

    const response = await fetch("/api/auth/student-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade, className, studentNumber })
    });

    const result = await response.json();

    if (result.success && result.user) {
      // セッションをローカルストレージに保存
      userSession.setUser(result.user, true);
      // ログ通知を表示せず直接ダッシュボードへ遷移
      window.location.href = "dashboard.html";
    } else {
      setLoading(false);
      showToast(result.message || "該当する生徒が見つかりませんでした", "error");
    }
  } catch (err) {
    console.error("Student login error:", err);
    setLoading(false);
    showToast("ログイン通信エラーが発生しました", "error");
  }
}

// =============================================================================
// 【方法A】 Google OAuth 認証処理（将来用コードガイド）
// =============================================================================
/*
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
*/

/**
 * 初期化処理
 */
function initApp() {
  // 現在は方法B（生徒番号フォーム）のイベントを登録
  if (studentLoginForm) {
    studentLoginForm.addEventListener("submit", handleStudentLogin);
  }

  /*
  // 方法Aへ切り替える場合は以下を有効化してください
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", handleGoogleLogin);
  }
  */
}

document.addEventListener("DOMContentLoaded", initApp);
