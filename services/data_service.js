/**
 * services/data_service.js
 * 
 * ユーザー紐づけデータ（対話ログ、問題解答データ等）取得・管理サービス
 * - serviceAccountKey.json が存在する場合はサーバー経由で Firestore (rss-m1) の実データを取得
 * - 未設定時は mock_store.js のダミーデータへフォールバック
 */

import { firebaseConfigManager } from "../auth/firebase_config.js";
import { MOCK_USER_DATA } from "./mock_store.js";

class DataService {
  /**
   * ユーザーの対話セッションおよび問題解答データを取得
   * @param {string} userId - GoogleアカウントのUID
   */
  async getUserData(userId) {
    if (!userId) {
      throw new Error("ユーザーIDが指定されていません");
    }

    // サーバーのFirestore APIから実データを取得
    try {
      const resp = await fetch(`/api/firebase/user-data?userId=${encodeURIComponent(userId)}`);
      if (resp.ok) {
        const result = await resp.json();
        if (result.sessions && result.sessions.length > 0) {
          const transformed = this._transformFirestoreSessions(result.sessions, userId);
          transformed.rawSessions = result.sessions;
          return transformed;
        }
      }
    } catch (e) {
      console.warn("[DataService] サーバーAPIからの取得に失敗したため、モックデータに切り替えます:", e);
    }

    return this._getMockUserData(userId);
  }

  /**
   * Firestoreの dialogueSessions をダッシュボード用フォーマットへマッピング
   */
  _transformFirestoreSessions(sessions, userId) {
    console.log(`[DataService] ✅ Firestoreから ${sessions.length} 件の実セッションを取得・変換しました`);

    const dialogues = [];
    const problems = [];

    sessions.forEach((s, idx) => {
      // 1. 対話データへのマッピング
      let messages = (s.messages && s.messages.length > 0)
        ? s.messages.map((m) => {
            const raw = m.timestamp || m.createdAt || null;
            const isUser = (
              m.sender === "user" ||
              m.sender === "student" ||
              m.role === "user" ||
              m.role === "student"
            );
            return {
              sender: isUser ? "student" : "ai",
              text: m.text || m.content || "",
              rawTime: raw,
              timestamp: raw
            };
          })
        : [
            {
              sender: "student",
              text: `${s.unit || "数学"}の「${s.content || "問題"}」を解きました。`,
              rawTime: s.startingAt,
              timestamp: s.startingAt
            },
            {
              sender: "ai",
              text: s.lesson || s.errorCause || "対話セッション完了",
              rawTime: s.completedAt,
              timestamp: s.completedAt
            }
          ];

      // 発言時刻順に昇順ソート（古い発言が上、新しい発言が下）
      messages.sort((a, b) => {
        const timeA = a.rawTime ? new Date(a.rawTime).getTime() : 0;
        const timeB = b.rawTime ? new Date(b.rawTime).getTime() : 0;
        return timeA - timeB;
      });

      dialogues.push({
        id: s.sessionId || `dial-${idx}`,
        timestamp: s.createdAt ? new Date(s.createdAt).toLocaleString("ja-JP") : "日時不明",
        topic: `${s.unit || "数Ⅰ"} - ${s.content || "学習問題"}`,
        messages,
        tags: [s.unit || "図形と計量", s.stateName || "完了", `教訓Lv.${s.maxQualityLevel || 5}`],
        problemImageUrl: s.problemImage ? s.problemImage.url : null,
        userAnswerImageUrl: s.userAnswerImage ? s.userAnswerImage.url : null,
        rawSession: s
      });

      // 2. 問題・原因分析データへのマッピング
      problems.push({
        id: s.sessionId || `prob-${idx}`,
        questionNumber: s.questionCounter || (idx + 1),
        title: s.content || "数学問題",
        assessmentAxis: s.unit || "図形と計量",
        status: s.hasError || s.errorCause ? "review_needed" : "passed",
        score: s.hasError ? 60 : 95,
        attempts: 1,
        causeOfMistake: s.errorCause || null,
        analysisNote: s.lesson || s.userAnswerDescription || "正答を確認しました。",
        problemImageUrl: s.problemImage ? s.problemImage.url : null
      });
    });

    const first = sessions[0] || {};
    return {
      userProfile: {
        studentId: first.uniqueId || `STU-${userId.substring(0, 6)}`,
        grade: first.studentGrade ? `高校${first.studentGrade}年` : "高校生",
        class: first.studentClass ? `${first.studentClass}組` : "普通科",
        lastLogin: first.lastActivityAt ? new Date(first.lastActivityAt).toLocaleString("ja-JP") : new Date().toLocaleString("ja-JP"),
        learningGoal: `${first.unit || "数Ⅰ"} 単元習得`
      },
      dialogues,
      problems
    };
  }

  /**
   * モックデータへのフォールバック
   */
  _getMockUserData(userId) {
    if (MOCK_USER_DATA[userId]) {
      return JSON.parse(JSON.stringify(MOCK_USER_DATA[userId]));
    }
    const defaultData = MOCK_USER_DATA["google-uid-tanaka-001"];
    return {
      userProfile: {
        ...defaultData.userProfile,
        studentId: `STU-DUMMY-${userId.substring(0, 6)}`
      },
      dialogues: defaultData.dialogues,
      problems: defaultData.problems
    };
  }
}

export const dataService = new DataService();
