/**
 * app/js/dashboard.js
 * 
 * ダッシュボード画面のデータロード＆インタラクションスクリプト
 */

import { userSession } from "../../auth/user_session.js";
import { dataService } from "../../services/data_service.js";

// DOM 要素
const logoutBtn = document.getElementById("logoutBtn");
const createProblemBtn = document.getElementById("createProblemBtn");
const userAvatar = document.getElementById("userAvatar");
const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userOrg = document.getElementById("userOrg");

const dialogueCount = document.getElementById("dialogueCount");
const problemCount = document.getElementById("problemCount");
const dialoguesList = document.getElementById("dialoguesList");

const statTotalProblems = document.getElementById("statTotalProblems");
const statAvgScore = document.getElementById("statAvgScore");
const statReviewNeeded = document.getElementById("statReviewNeeded");
const problemsTableBody = document.getElementById("problemsTableBody");

const exportCodeUid = document.getElementById("exportCodeUid");
const jsonPreviewBox = document.getElementById("jsonPreviewBox");
const copyJsonBtn = document.getElementById("copyJsonBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");

const chatModal = document.getElementById("chatModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalTopic = document.getElementById("modalTopic");
const modalTimestamp = document.getElementById("modalTimestamp");
const chatThread = document.getElementById("chatThread");
const toastContainer = document.getElementById("toastContainer");

let currentLoadedData = null;

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
 * タブ切り替え制御
 */
function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");

      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => (c.style.display = "none"));

      btn.classList.add("active");
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.style.display = "block";
    });
  });
}

/**
 * タイムスタンプをミリ秒に変換（ISO文字列、Date、時刻文字列などあらゆる形式に対応）
 */
function parseTimestampToMs(raw) {
  if (!raw) return 0;
  if (typeof raw === "number") return raw;
  if (raw instanceof Date) return raw.getTime();

  // 1. ISO 8601 または標準日付形式 ("2026-10-28T03:48:04.169Z")
  const parsed = Date.parse(raw);
  if (!isNaN(parsed)) return parsed;

  // 2. "HH:mm:ss" または "HH:mm" (例: "13:18:20", "13:18")
  const match = String(raw).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    return hours * 3600000 + minutes * 60000 + seconds * 1000;
  }

  return 0;
}

/**
 * チャット時刻のフォーマット (例: 13:18)
 */
function formatChatTime(rawTime) {
  if (!rawTime) return "";
  try {
    const d = new Date(rawTime);
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    }
  } catch (e) {}
  const match = String(rawTime).match(/\d{1,2}:\d{2}/);
  return match ? match[0] : "";
}

/**
 * 対話スレッド詳細モーダルを表示
 * AIチューター: 左側からの吹き出し（白色）
 * 自身の発言: 右側からの吹き出し（青色）
 * 発言時刻が先のものが上、後のものが下に時系列昇順で表示
 */
function openChatModal(dialogue) {
  if (!chatModal || !modalTopic || !modalTimestamp || !chatThread) return;
  modalTopic.textContent = dialogue.topic;
  modalTimestamp.textContent = dialogue.timestamp;
  chatThread.innerHTML = "";

  // メッセージを発言時刻順に昇順ソート（古い発言が上、新しい発言が下）
  const sortedMessages = [...(dialogue.messages || [])].sort((a, b) => {
    const timeA = parseTimestampToMs(a.rawTime || a.timestamp || a.createdAt);
    const timeB = parseTimestampToMs(b.rawTime || b.timestamp || b.createdAt);
    return timeA - timeB;
  });

  sortedMessages.forEach((msg) => {
    // 自身の発言（student / user）かどうかの判定
    const isSelf = (
      msg.sender === "student" ||
      msg.sender === "user" ||
      msg.role === "student" ||
      msg.role === "user"
    );

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${isSelf ? "student" : "ai"}`;

    const textDiv = document.createElement("div");
    textDiv.className = "chat-text";
    textDiv.textContent = msg.text || "";

    const timeStr = formatChatTime(msg.rawTime || msg.timestamp || msg.createdAt);
    const timeSpan = document.createElement("span");
    timeSpan.className = "chat-time";
    timeSpan.textContent = timeStr;

    bubble.appendChild(textDiv);
    if (timeStr) {
      bubble.appendChild(timeSpan);
    }

    chatThread.appendChild(bubble);
  });

  chatModal.style.display = "flex";

  // KaTeX による数式（$ ... $）の自動レンダリング
  if (typeof renderMathInElement === "function") {
    try {
      renderMathInElement(chatThread, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    } catch (ke) {
      console.warn("KaTeX render notice:", ke);
    }
  }

  // スクロールを最下部に移動
  setTimeout(() => {
    chatThread.scrollTop = chatThread.scrollHeight;
  }, 60);
}

/**
 * 対話ログ一覧の描画
 */
function renderDialogues(dialogues) {
  if (!dialogueCount || !dialoguesList) return;
  dialogueCount.textContent = dialogues.length;
  dialoguesList.innerHTML = "";

  if (dialogues.length === 0) {
    dialoguesList.innerHTML = `
      <div class="glass-card" style="padding: 2.5rem; text-align: center; color: var(--text-muted); background: #ffffff;">
        対話データはまだ登録されていません。
      </div>
    `;
    return;
  }

  dialogues.forEach((d) => {
    const item = document.createElement("div");
    item.className = "dialogue-item";

    // ヘッダー情報（トピックと日時）
    item.innerHTML = `
      <div class="dialogue-header">
        <span class="dialogue-topic">${d.topic}</span>
        <span class="dialogue-time">${d.timestamp}</span>
      </div>
    `;

    // アクションボタングループの作成
    const actionsRow = document.createElement("div");
    actionsRow.className = "dialogue-actions-row";

    // 1. 問題画像を表示ボタン
    const hasProblemImg = !!d.problemImageUrl;
    const problemBtn = document.createElement("button");
    problemBtn.type = "button";
    problemBtn.className = `dialogue-btn dialogue-btn-secondary ${!hasProblemImg ? "disabled" : ""}`;
    problemBtn.innerHTML = `<span>📷</span> 問題画像を表示`;
    if (hasProblemImg) {
      problemBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(d.problemImageUrl, "_blank");
      });
    } else {
      problemBtn.disabled = true;
      problemBtn.title = "問題画像はありません";
    }

    // 2. 解答画像を表示ボタン
    const hasAnswerImg = !!d.userAnswerImageUrl;
    const answerBtn = document.createElement("button");
    answerBtn.type = "button";
    answerBtn.className = `dialogue-btn dialogue-btn-secondary ${!hasAnswerImg ? "disabled" : ""}`;
    answerBtn.innerHTML = `<span>✍️</span> 解答画像を表示`;
    if (hasAnswerImg) {
      answerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(d.userAnswerImageUrl, "_blank");
      });
    } else {
      answerBtn.disabled = true;
      answerBtn.title = "解答画像はありません";
    }

    // 3. 会話スレッドを見るボタン (数字不要)
    const threadBtn = document.createElement("button");
    threadBtn.type = "button";
    threadBtn.className = "dialogue-btn dialogue-btn-primary";
    threadBtn.innerHTML = `<span>💬</span> 会話スレッドを見る`;
    threadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openChatModal(d);
    });

    actionsRow.appendChild(problemBtn);
    actionsRow.appendChild(answerBtn);
    actionsRow.appendChild(threadBtn);

    item.appendChild(actionsRow);

    dialoguesList.appendChild(item);
  });
}

/**
 * 問題解答データの描画
 */
function renderProblems(problems) {
  if (!problemCount || !problemsTableBody) return;
  problemCount.textContent = problems.length;
  problemsTableBody.innerHTML = "";

  const total = problems.length;
  const passed = problems.filter((p) => p.status === "passed").length;
  const reviewNeeded = problems.filter((p) => p.status === "review_needed").length;
  const avgScore = total > 0 ? Math.round(problems.reduce((acc, p) => acc + (p.score || 0), 0) / total) : 0;

  if (statTotalProblems) statTotalProblems.textContent = total;
  if (statAvgScore) statAvgScore.textContent = `${avgScore}%`;
  if (statReviewNeeded) statReviewNeeded.textContent = reviewNeeded;

  if (problems.length === 0) {
    problemsTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 2rem;">
          解答記録がありません。
        </td>
      </tr>
    `;
    return;
  }

  problems.forEach((p) => {
    const tr = document.createElement("tr");
    tr.className = "problem-row";

    const statusBadge = p.status === "passed"
      ? '<span class="status-badge passed">合格 (習得済)</span>'
      : '<span class="status-badge review_needed">要復習 (つまずき)</span>';

    const causeHtml = p.causeOfMistake
      ? `<div class="cause-note"><strong>つまずき要因:</strong> ${p.causeOfMistake}</div>`
      : "";

    tr.innerHTML = `
      <td>
        <span style="font-weight: 700; color: var(--text-main);">問 ${p.questionNumber}</span>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--text-main);">${p.title}</div>
        <div style="font-size: 0.75rem; color: var(--text-dim);">${p.assessmentAxis || "---"}</div>
      </td>
      <td>${statusBadge}</td>
      <td>
        <span style="font-weight: 700; color: var(--text-main);">${p.score}点</span>
        <span style="font-size: 0.75rem; color: var(--text-dim);">(${p.attempts}回目)</span>
      </td>
      <td>
        <div style="font-size: 0.82rem; color: var(--text-muted);">${p.analysisNote || "特記なし"}</div>
        ${causeHtml}
      </td>
    `;

    problemsTableBody.appendChild(tr);
  });
}

/**
 * JSON エクスポート描画
 */
function setupExport(userData) {
  const currentUid = (userSession.getUser() && userSession.getUser().uid) || "UID";
  if (exportCodeUid) exportCodeUid.textContent = (userData.userProfile && userData.userProfile.studentId) || currentUid;

  const exportPayload = {
    user: userSession.getUser(),
    profile: userData.userProfile,
    dialogues: userData.dialogues,
    problems: userData.problems,
    fetchedAt: new Date().toISOString()
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  if (jsonPreviewBox) jsonPreviewBox.textContent = jsonStr;

  if (copyJsonBtn) {
    copyJsonBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(jsonStr);
        showToast("JSONデータをクリップボードにコピーしました", "success");
      } catch {
        showToast("コピーに失敗しました", "error");
      }
    };
  }

  if (downloadJsonBtn) {
    downloadJsonBtn.onclick = () => {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cause_analysis_data_${currentUid}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("JSONファイルをダウンロードしました", "success");
    };
  }
}

// ==============================================================================
// 追加問題作成（つまづき箇所特定 & 4分類誤答原因確率分配）コントローラー
// ==============================================================================

let selectedCaProblem = null;
let currentCaAnalysis = null;

// DOM要素
const causeAnalysisModal = document.getElementById("causeAnalysisModal");
const closeCaModalBtn = document.getElementById("closeCaModalBtn");
const cancelCaBtn = document.getElementById("cancelCaBtn");
const caStepIndicator1 = document.getElementById("caStepIndicator1");
const caStepIndicator2 = document.getElementById("caStepIndicator2");

const caStepSelect = document.getElementById("caStepSelect");
const caStepLoading = document.getElementById("caStepLoading");
const caStepResult = document.getElementById("caStepResult");

const caProblemCards = document.getElementById("caProblemCards");
const caPreviewContent = document.getElementById("caPreviewContent");
const startAnalysisBtn = document.getElementById("startAnalysisBtn");

const caResultUnit = document.getElementById("caResultUnit");
const caResultTitle = document.getElementById("caResultTitle");
const caViewProblemImgBtn = document.getElementById("caViewProblemImgBtn");
const caViewAnswerImgBtn = document.getElementById("caViewAnswerImgBtn");

const caStumbleLocation = document.getElementById("caStumbleLocation");
const caStumbleSummary = document.getElementById("caStumbleSummary");
const caStumbleDetail = document.getElementById("caStumbleDetail");

const caBarNumber = document.getElementById("caBarNumber");
const caBarCalc = document.getElementById("caBarCalc");
const caBarFacts = document.getElementById("caBarFacts");
const caBarReasoning = document.getElementById("caBarReasoning");

const caLegendPctNumber = document.getElementById("caLegendPctNumber");
const caLegendPctCalc = document.getElementById("caLegendPctCalc");
const caLegendPctFacts = document.getElementById("caLegendPctFacts");
const caLegendPctReasoning = document.getElementById("caLegendPctReasoning");

const caCardNumber = document.getElementById("caCardNumber");
const caCardCalc = document.getElementById("caCardCalc");
const caCardFacts = document.getElementById("caCardFacts");
const caCardReasoning = document.getElementById("caCardReasoning");

const caPctNumber = document.getElementById("caPctNumber");
const caPctCalc = document.getElementById("caPctCalc");
const caPctFacts = document.getElementById("caPctFacts");
const caPctReasoning = document.getElementById("caPctReasoning");

const caMeterNumber = document.getElementById("caMeterNumber");
const caMeterCalc = document.getElementById("caMeterCalc");
const caMeterFacts = document.getElementById("caMeterFacts");
const caMeterReasoning = document.getElementById("caMeterReasoning");

// サブメニュー（対話データからの根拠）
const caEvidenceToggleBtn = document.getElementById("caEvidenceToggleBtn");
const caEvidencePanel = document.getElementById("caEvidencePanel");
const caEvidenceArrow = document.getElementById("caEvidenceArrow");
const caEvidenceList = document.getElementById("caEvidenceList");
const caOverallAnalysis = document.getElementById("caOverallAnalysis");

const caBackToSelectBtn = document.getElementById("caBackToSelectBtn");
const caProceedNextBtn = document.getElementById("caProceedNextBtn");

/**
 * モーダルイベントとハンドラーの設定
 */
function setupCauseAnalysisModal() {
  if (!causeAnalysisModal) return;

  // 閉じる処理
  const closeModal = () => {
    causeAnalysisModal.style.display = "none";
  };

  if (closeCaModalBtn) closeCaModalBtn.addEventListener("click", closeModal);
  if (cancelCaBtn) cancelCaBtn.addEventListener("click", closeModal);

  causeAnalysisModal.addEventListener("click", (e) => {
    if (e.target === causeAnalysisModal) closeModal();
  });

  // 分析開始ボタン
  if (startAnalysisBtn) {
    startAnalysisBtn.addEventListener("click", runCauseAnalysis);
  }

  // 別の問題を選択ボタン
  if (caBackToSelectBtn) {
    caBackToSelectBtn.addEventListener("click", () => {
      switchCaStep(1);
    });
  }

  // サブメニュー: 対話データからの根拠の開閉トグル
  if (caEvidenceToggleBtn && caEvidencePanel) {
    caEvidenceToggleBtn.addEventListener("click", () => {
      const isHidden = caEvidencePanel.style.display === "none";
      caEvidencePanel.style.display = isHidden ? "block" : "none";
      const toggleText = caEvidenceToggleBtn.querySelector(".ca-toggle-text");
      if (toggleText) {
        toggleText.textContent = isHidden ? "対話データからの根拠を閉じる" : "対話データからの根拠を表示";
      }
      if (caEvidenceArrow) {
        caEvidenceArrow.textContent = isHidden ? "▲" : "▼";
      }
    });
  }

  // 追加問題作成（次ステップ）ボタン
  if (caProceedNextBtn) {
    caProceedNextBtn.addEventListener("click", () => {
      showToast("特定されたつまづき箇所と誤答原因に基づき、個別最適な追加問題を生成する準備が整いました。", "success");
    });
  }
}

/**
 * モーダルのステップ切り替え
 * step: 1 (問題選択) | "loading" (分析中) | 2 (分析結果)
 */
function switchCaStep(step) {
  if (step === 1) {
    caStepSelect.style.display = "block";
    caStepLoading.style.display = "none";
    caStepResult.style.display = "none";
    if (caStepIndicator1) caStepIndicator1.classList.add("active");
    if (caStepIndicator2) caStepIndicator2.classList.remove("active");
  } else if (step === "loading") {
    caStepSelect.style.display = "none";
    caStepLoading.style.display = "block";
    caStepResult.style.display = "none";
  } else if (step === 2) {
    caStepSelect.style.display = "none";
    caStepLoading.style.display = "none";
    caStepResult.style.display = "block";
    if (caStepIndicator1) caStepIndicator1.classList.remove("active");
    if (caStepIndicator2) caStepIndicator2.classList.add("active");
  }
}

/**
 * 追加問題作成モーダルを開く
 */
function openCauseAnalysisModal() {
  if (!causeAnalysisModal) return;
  causeAnalysisModal.style.display = "flex";
  switchCaStep(1);
  renderProblemSelectionList();
}

/**
 * 問題選択リストを描画
 */
function renderProblemSelectionList() {
  if (!caProblemCards) return;
  caProblemCards.innerHTML = "";

  const dialogues = (currentLoadedData && currentLoadedData.dialogues) || [];
  if (dialogues.length === 0) {
    caProblemCards.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--text-dim);">
        分析可能な対話・問題データがありません。
      </div>
    `;
    if (startAnalysisBtn) startAnalysisBtn.disabled = true;
    return;
  }

  dialogues.forEach((d, idx) => {
    const card = document.createElement("div");
    card.className = "ca-problem-card";
    if (idx === 0) {
      card.classList.add("selected");
      selectedCaProblem = d;
      renderSelectedPreview(d);
      if (startAnalysisBtn) startAnalysisBtn.disabled = false;
    }

    const unitTag = (d.tags && d.tags[0]) || "数学";
    const msgCount = (d.messages && d.messages.length) || 0;
    const hasProbImg = !!d.problemImageUrl;
    const hasAnsImg = !!d.userAnswerImageUrl;

    card.innerHTML = `
      <div class="ca-card-top">
        <span class="ca-card-unit">${unitTag}</span>
        <span class="ca-card-time">${d.timestamp || ""}</span>
      </div>
      <div class="ca-card-title">${d.topic || "数学問題"}</div>
      <div class="ca-card-meta">
        <span>対話 ${msgCount} 件</span>
        ${hasProbImg ? "<span>問題画像あり</span>" : ""}
        ${hasAnsImg ? "<span>解答画像あり</span>" : ""}
      </div>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".ca-problem-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedCaProblem = d;
      renderSelectedPreview(d);
      if (startAnalysisBtn) startAnalysisBtn.disabled = false;
    });

    caProblemCards.appendChild(card);
  });
}

/**
 * 選択した問題のプレビューを表示
 */
function renderSelectedPreview(item) {
  if (!caPreviewContent) return;

  const raw = item.rawSession || {};
  const probImg = item.problemImageUrl;
  const ansImg = item.userAnswerImageUrl;
  const messages = item.messages || [];

  let thumbHtml = "";
  if (probImg || ansImg) {
    thumbHtml = `
      <div class="ca-preview-thumb-row">
        ${probImg ? `
          <div class="ca-thumb-wrap">
            <div class="ca-thumb-title">問題画像</div>
            <img src="${probImg}" class="ca-thumb-img" alt="問題画像" onclick="window.open('${probImg}', '_blank')">
          </div>
        ` : ""}
        ${ansImg ? `
          <div class="ca-thumb-wrap">
            <div class="ca-thumb-title">解答画像</div>
            <img src="${ansImg}" class="ca-thumb-img" alt="解答画像" onclick="window.open('${ansImg}', '_blank')">
          </div>
        ` : ""}
      </div>
    `;
  }

  // 対話ログの抜粋
  const lastUserMsg = [...messages].reverse().find(m => m.sender === "student" || m.sender === "user") || messages[messages.length - 1];

  caPreviewContent.innerHTML = `
    <div class="ca-preview-box">
      <div>
        <span class="ca-card-unit">${(item.tags && item.tags[0]) || "数学"}</span>
        <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin-top: 0.35rem;">${item.topic}</h4>
      </div>
      
      ${thumbHtml}

      ${raw.errorCause ? `
        <div style="font-size: 0.82rem; background: #fef2f2; border-left: 3px solid #ef4444; padding: 0.5rem 0.75rem; border-radius: 4px; color: #991b1b;">
          <strong>記録された誤答要約:</strong> ${raw.errorCause}
        </div>
      ` : ""}

      ${lastUserMsg ? `
        <div style="font-size: 0.82rem; background: #f8fafc; border: 1px solid var(--border-subtle); padding: 0.6rem 0.8rem; border-radius: 6px;">
          <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 0.2rem;">対話ログの抜粋（直近の生徒発言）:</div>
          <div style="color: var(--text-main); font-style: italic;">「${lastUserMsg.text}」</div>
        </div>
      ` : ""}
    </div>
  `;
}

/**
 * LLMによる原因分析を実行
 */
async function runCauseAnalysis() {
  if (!selectedCaProblem) return;

  switchCaStep("loading");

  try {
    const sessionPayload = selectedCaProblem.rawSession || {
      sessionId: selectedCaProblem.id,
      topic: selectedCaProblem.topic,
      unit: (selectedCaProblem.tags && selectedCaProblem.tags[0]) || "数学",
      content: selectedCaProblem.topic,
      problemImageUrl: selectedCaProblem.problemImageUrl,
      userAnswerImageUrl: selectedCaProblem.userAnswerImageUrl,
      messages: selectedCaProblem.messages
    };

    const resp = await fetch("/api/cause-analysis/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sessionPayload })
    });

    if (!resp.ok) {
      throw new Error(`HTTP error! status: ${resp.status}`);
    }

    const result = await resp.json();
    if (!result.success || !result.analysis) {
      throw new Error(result.error || "分析結果の取得に失敗しました");
    }

    currentCaAnalysis = result.analysis;
    renderAnalysisResult(result.analysis, result.prompts, selectedCaProblem);
    switchCaStep(2);
  } catch (err) {
    console.error("Cause Analysis failed:", err);
    showToast(`分析中にエラーが発生しました: ${err.message}`, "error");
    switchCaStep(1);
  }
}

/**
 * 分析結果（つまづき箇所 & 4分類の誤答原因確率分布）を描画
 */
function renderAnalysisResult(analysis, prompts, problem) {
  // メタ情報
  if (caResultUnit) caResultUnit.textContent = (problem.tags && problem.tags[0]) || "数学";
  if (caResultTitle) caResultTitle.textContent = problem.topic || "学習問題";

  if (caViewProblemImgBtn) {
    if (problem.problemImageUrl) {
      caViewProblemImgBtn.style.display = "inline-flex";
      caViewProblemImgBtn.onclick = () => window.open(problem.problemImageUrl, "_blank");
    } else {
      caViewProblemImgBtn.style.display = "none";
    }
  }

  if (caViewAnswerImgBtn) {
    if (problem.userAnswerImageUrl) {
      caViewAnswerImgBtn.style.display = "inline-flex";
      caViewAnswerImgBtn.onclick = () => window.open(problem.userAnswerImageUrl, "_blank");
    } else {
      caViewAnswerImgBtn.style.display = "none";
    }
  }

  // 1. つまづき箇所の特定 (*1)
  const stumble = analysis.stumbleLocation || {};
  if (caStumbleLocation) caStumbleLocation.textContent = stumble.location || "特定中...";
  if (caStumbleSummary) caStumbleSummary.textContent = stumble.summary || "";
  if (caStumbleDetail) caStumbleDetail.textContent = stumble.detail || "";

  // 2. 4つの誤答原因の確率分布 (*2)
  const dist = analysis.causeDistribution || {};
  const num = dist.number_concept || { percentage: 0, probability: 0, reasoning: "" };
  const calc = dist.calculation_fluency || { percentage: 0, probability: 0, reasoning: "" };
  const facts = dist.mathematical_facts || { percentage: 0, probability: 0, reasoning: "" };
  const reasoning = dist.mathematical_reasoning || { percentage: 0, probability: 0, reasoning: "" };

  // スタックバー (100%)
  if (caBarNumber) caBarNumber.style.width = `${num.percentage}%`;
  if (caBarCalc) caBarCalc.style.width = `${calc.percentage}%`;
  if (caBarFacts) caBarFacts.style.width = `${facts.percentage}%`;
  if (caBarReasoning) caBarReasoning.style.width = `${reasoning.percentage}%`;

  // 凡例パーセンテージ
  if (caLegendPctNumber) caLegendPctNumber.textContent = `${num.percentage}%`;
  if (caLegendPctCalc) caLegendPctCalc.textContent = `${calc.percentage}%`;
  if (caLegendPctFacts) caLegendPctFacts.textContent = `${facts.percentage}%`;
  if (caLegendPctReasoning) caLegendPctReasoning.textContent = `${reasoning.percentage}%`;

  // 各カード
  if (caPctNumber) caPctNumber.textContent = `${num.percentage}%`;
  if (caPctCalc) caPctCalc.textContent = `${calc.percentage}%`;
  if (caPctFacts) caPctFacts.textContent = `${facts.percentage}%`;
  if (caPctReasoning) caPctReasoning.textContent = `${reasoning.percentage}%`;

  if (caMeterNumber) caMeterNumber.style.width = `${num.percentage}%`;
  if (caMeterCalc) caMeterCalc.style.width = `${calc.percentage}%`;
  if (caMeterFacts) caMeterFacts.style.width = `${facts.percentage}%`;
  if (caMeterReasoning) caMeterReasoning.style.width = `${reasoning.percentage}%`;

  // 主要因（確率最大）カードの強調
  const primaryKey = (analysis.primaryCause && analysis.primaryCause.key) || "mathematical_facts";
  const cards = {
    number_concept: caCardNumber,
    calculation_fluency: caCardCalc,
    mathematical_facts: caCardFacts,
    mathematical_reasoning: caCardReasoning
  };

  Object.values(cards).forEach(c => c && c.classList.remove("primary-cause"));
  if (cards[primaryKey]) {
    cards[primaryKey].classList.add("primary-cause");
  }

  // 3. サブメニュー（対話データからの根拠）の初期化とデータ挿入
  if (caEvidencePanel) {
    caEvidencePanel.style.display = "none";
  }
  if (caEvidenceToggleBtn) {
    const toggleText = caEvidenceToggleBtn.querySelector(".ca-toggle-text");
    if (toggleText) toggleText.textContent = "対話データからの根拠を表示";
    if (caEvidenceArrow) caEvidenceArrow.textContent = "▼";
  }

  if (caEvidenceList) {
    caEvidenceList.innerHTML = "";
    const evidences = analysis.dialogueEvidence || [];
    if (evidences.length === 0) {
      caEvidenceList.innerHTML = `<div style="font-size: 0.82rem; color: var(--text-dim); padding: 0.5rem 0;">対話ログからの直接引用はありません</div>`;
    } else {
      evidences.forEach(ev => {
        const item = document.createElement("div");
        item.className = "ca-evidence-item";
        item.innerHTML = `
          <div class="ca-evidence-quote">${ev.speaker || "生徒"}: ${ev.quote}</div>
          <div class="ca-evidence-interp">${ev.interpretation || ev.relevance || ""}</div>
        `;
        caEvidenceList.appendChild(item);
      });
    }
  }

  if (caOverallAnalysis) {
    caOverallAnalysis.textContent = analysis.overallAnalysis || "特記なし";
  }

  // KaTeX 数式自動レンダリング
  if (typeof renderMathInElement === "function" && caStepResult) {
    try {
      renderMathInElement(caStepResult, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
      });
    } catch (ke) {
      console.warn("KaTeX render notice in result:", ke);
    }
  }
}

/**
 * 初期化とデータフェッチ
 */
async function initDashboard() {
  setupTabs();

  // モーダル閉じる
  if (closeModalBtn && chatModal) {
    closeModalBtn.addEventListener("click", () => (chatModal.style.display = "none"));
    chatModal.addEventListener("click", (e) => {
      if (e.target === chatModal) chatModal.style.display = "none";
    });
  }

  // セッション確認
  const user = userSession.getUser();
  if (!user) {
    console.warn("[Dashboard] ログインセッションがありません。ログイン画面へ移動します。");
    window.location.href = "index.html";
    return;
  }

  // プロフィール情報表示
  if (userName) userName.textContent = user.displayName || "生徒";
  if (userEmail) userEmail.textContent = user.email || "";
  if (userAvatar) userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "Student")}&background=0284c7&color=fff`;
  if (userOrg) userOrg.textContent = user.organization || `${user.grade ? `${user.grade}年` : ""} ${user.className ? `${user.className}組` : ""} ${user.studentNumber ? `${user.studentNumber}番` : ""}`.trim() || "第一高校";

  // ログアウト処理
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      userSession.clearUser();
      window.location.href = "index.html";
    });
  }

  // 追加問題作成ボタン処理
  if (createProblemBtn) {
    createProblemBtn.addEventListener("click", () => {
      openCauseAnalysisModal();
    });
  }

  // 追加問題作成モーダル初期化
  setupCauseAnalysisModal();

  // データ取得
  try {
    currentLoadedData = await dataService.getUserData(user.uid);
    renderDialogues(currentLoadedData.dialogues);
    renderProblems(currentLoadedData.problems);
    setupExport(currentLoadedData);
  } catch (err) {
    console.error("Data load failed:", err);
    showToast("データ読み込みに失敗しました", "error");
  }
}

document.addEventListener("DOMContentLoaded", initDashboard);
