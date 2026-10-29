/**
 * services/mock_store.js
 * 
 * ダミーキー環境用の高品質モックデータ
 * - 各Googleアカウント（UID）に紐づく「対話データ」および「問題データ」
 * - プロジェクト内の「学習マップ (learning_map.json)」と連携した数学問題データ
 */

export const MOCK_USER_DATA = {
  // 田中 太郎 (生徒A)
  "google-uid-tanaka-001": {
    userProfile: {
      studentId: "STU-2024-001",
      grade: "高校1年",
      class: "A組 15番",
      lastLogin: "2026-10-29 10:15",
      learningGoal: "三角比の定義と基本定理の完全理解"
    },
    // 対話データ（AIチューターまたは指導教員との対話履歴）
    dialogues: [
      {
        id: "dial-101",
        timestamp: "2026-10-29 09:30:20",
        topic: "直角三角形における三角比の定義",
        messages: [
          {
            sender: "student",
            text: "sin, cos, tanの覚え方がこんがらがってしまいます。直角が右側にあるときはどう考えればいいですか？",
            timestamp: "09:30:20"
          },
          {
            sender: "ai",
            text: "直角三角形では、着目する鋭角θを『左下』、直角を『右下』に置くのが基本形です！\n- sinθ（正弦）: 斜辺分の対辺（筆記体のsの書き順：斜辺→高さ）\n- cosθ（余弦）: 斜辺分の底辺（筆記体のc：斜辺を挟んで底辺）\n- tanθ（正接）: 底辺分の対辺（筆記体のt：底辺→高さ）\nまずは図形の向きを揃えてイメージすると間違えにくくなりますよ。",
            timestamp: "09:31:05"
          },
          {
            sender: "student",
            text: "なるほど！筆記体の書き順でなぞると分かりやすいですね。tanは底辺から高さに行くんですね。",
            timestamp: "09:32:15"
          },
          {
            sender: "ai",
            text: "その通りです！バッチリ理解できています。では、問1の問題に挑戦してみましょう！",
            timestamp: "09:32:40"
          }
        ],
        tags: ["三角比の定義", "知識・技能", "質問解決"]
      },
      {
        id: "dial-102",
        timestamp: "2026-10-28 16:45:10",
        topic: "坂道の応用問題（問5）についての質問",
        messages: [
          {
            sender: "student",
            text: "傾斜角20°の坂を500m登るときの垂直方向の高さが、sinを使うのかcosを使うのか迷いました。",
            timestamp: "16:45:10"
          },
          {
            sender: "ai",
            text: "垂直方向（鉛直方向）は『高さ』にあたるので、斜辺(500m) × sin20° を使います！水平方向なら cos20° になります。",
            timestamp: "16:46:00"
          },
          {
            sender: "student",
            text: "三角比の表から sin20°=0.3420 を代入して 500 × 0.3420 = 171m ですね！納得できました。",
            timestamp: "16:47:30"
          }
        ],
        tags: ["実生活応用", "三角比の表", "鉛直方向"]
      }
    ],
    // 問題解答データ（学習項目ごとの解答・正誤・原因分析）
    problems: [
      {
        id: "prob-001",
        learningItemId: 1,
        questionNumber: 1,
        title: "直角三角形の正弦・余弦・正接の導出",
        assessmentAxis: "知識・技能",
        status: "passed",
        score: 100,
        attempts: 1,
        submittedAt: "2026-10-29 09:40:00",
        causeOfMistake: null,
        analysisNote: "定義通りに正弦・余弦・正接を正確に立式できている。"
      },
      {
        id: "prob-002",
        learningItemId: 2,
        questionNumber: 2,
        title: "有名角（30°, 45°, 60°）の三角比",
        assessmentAxis: "知識・技能",
        status: "passed",
        score: 95,
        attempts: 1,
        submittedAt: "2026-10-29 10:05:00",
        causeOfMistake: null,
        analysisNote: "特殊三角形（1:2:√3, 1:1:√2）の比を即座に適用できている。"
      },
      {
        id: "prob-003",
        learningItemId: 3,
        questionNumber: 3,
        title: "三角比の表を用いた値の読み取り",
        assessmentAxis: "思考力・判断力・表現力",
        status: "passed",
        score: 90,
        attempts: 1,
        submittedAt: "2026-10-28 15:20:00",
        causeOfMistake: null,
        analysisNote: "表の各列の意味を理解して適切な少数値を読み取り完了。"
      },
      {
        id: "prob-004",
        learningItemId: 4,
        questionNumber: 4,
        title: "値から角度θを特定する逆引き問題",
        assessmentAxis: "思考力・判断力・表現力",
        status: "review_needed",
        score: 70,
        attempts: 2,
        submittedAt: "2026-10-28 16:10:00",
        causeOfMistake: "三角比の表の四捨五入の境界値でtanθの近似角度を1度ズレて読み間違えた。",
        analysisNote: "数値の大小関係と角度の増加方向の対応確認が必要。"
      },
      {
        id: "prob-005",
        learningItemId: 5,
        questionNumber: 5,
        title: "傾斜角20°の坂道登坂（測量応用）",
        assessmentAxis: "知識・技能",
        status: "passed",
        score: 100,
        attempts: 2,
        submittedAt: "2026-10-28 16:50:00",
        causeOfMistake: "初回解答時にsinとcosの役割を取り違えたが、対話後に自力解決。",
        analysisNote: "対話サポート後の再解答で鉛直171m・水平470mを完答。"
      }
    ]
  },

  // 佐藤 花子 (生徒B)
  "google-uid-sato-002": {
    userProfile: {
      studentId: "STU-2024-002",
      grade: "高校1年",
      class: "B組 08番",
      lastLogin: "2026-10-29 11:40",
      learningGoal: "三角比の応用問題と空間図形への応用"
    },
    dialogues: [
      {
        id: "dial-201",
        timestamp: "2026-10-29 11:20:00",
        topic: "三角比の表の角度逆算について",
        messages: [
          {
            sender: "student",
            text: "tanθ = 4.3 のときの角度ってどう探せばいいですか？表の数値が急激に大きくなっていて見つけにくいです。",
            timestamp: "11:20:00"
          },
          {
            sender: "ai",
            text: "tanは90°に近づくほど急激に大きな値になりますね！tan76°=4.0108, tan77°=4.3315 です。4.3に一番近いのはどちらでしょうか？",
            timestamp: "11:21:10"
          },
          {
            sender: "student",
            text: "4.3315の方が4.3に近いので、およそ77°ですね！",
            timestamp: "11:22:00"
          }
        ],
        tags: ["逆引き", "tanの変化率", "近似値"]
      }
    ],
    problems: [
      {
        id: "prob-101",
        learningItemId: 1,
        questionNumber: 1,
        title: "直角三角形の正弦・余弦・正接の導出",
        assessmentAxis: "知識・技能",
        status: "passed",
        score: 100,
        attempts: 1,
        submittedAt: "2026-10-29 10:50:00",
        causeOfMistake: null,
        analysisNote: "基本事項は完璧に定着している。"
      },
      {
        id: "prob-104",
        learningItemId: 4,
        questionNumber: 4,
        title: "値から角度θを特定する逆引き問題",
        assessmentAxis: "思考力・判断力・表現力",
        status: "passed",
        score: 95,
        attempts: 1,
        submittedAt: "2026-10-29 11:25:00",
        causeOfMistake: null,
        analysisNote: "tanの増大傾向を把握し近似角度を正しく特定できた。"
      }
    ]
  },

  // 鈴木 健一 (指導教員)
  "google-uid-suzuki-999": {
    userProfile: {
      studentId: "TCH-2024-101",
      grade: "教員・管理者",
      class: "数学科指導",
      lastLogin: "2026-10-29 14:00",
      learningGoal: "生徒全体の学習状況・誤答原因の分析"
    },
    dialogues: [
      {
        id: "dial-901",
        timestamp: "2026-10-29 13:50:00",
        topic: "学年全体の三角比定着度分析",
        messages: [
          {
            sender: "teacher",
            text: "問4の三角比の表の逆引き問題で生徒がつまずきやすい原因は何でしょうか？",
            timestamp: "13:50:00"
          },
          {
            sender: "ai",
            text: "分析データによると、角度が増加した際のtanの非線形な急上昇と、四捨五入での近似値比較において差の絶対値の計算ミスが主な要因となっています。",
            timestamp: "13:51:30"
          }
        ],
        tags: ["全体分析", "つまずき傾向", "指導方針"]
      }
    ],
    problems: [
      {
        id: "prob-all-summary",
        learningItemId: 1,
        questionNumber: 1,
        title: "直角三角形の正弦・余弦・正接",
        assessmentAxis: "全体集計",
        status: "passed",
        score: 88,
        attempts: 42,
        submittedAt: "2026-10-29 14:00:00",
        causeOfMistake: null,
        analysisNote: "クラス全体の平均正答率88%。良好。"
      }
    ]
  }
};
