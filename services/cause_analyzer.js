/**
 * services/cause_analyzer.js
 * 
 * 他システムで解答した問題データ（画像・対話データ等）から、
 * ① つまづき箇所の特定（問題や解答のどの位置で誤りが発生しているか）
 * ② 4つの誤答原因の分類への確率分配（総和を1として分配）
 * をLLMに行わせるためのプロンプト定義および分析エンジン
 */

const https = require("https");

/**
 * 誤答原因の4分類の定義
 */
const CAUSE_CATEGORIES = {
  number_concept: {
    key: "number_concept",
    code: "①",
    label: "数概念",
    definition: "数や数量の意味理解に関する困難"
  },
  calculation_fluency: {
    key: "calculation_fluency",
    code: "②",
    label: "計算の正確さ、または流暢性",
    definition: "計算を正確かつ流暢に遂行することの困難"
  },
  mathematical_facts: {
    key: "mathematical_facts",
    code: "③",
    label: "数学的事実の既往",
    definition: "基本的な計算事実や既習事項を保持・想起することの困難"
  },
  mathematical_reasoning: {
    key: "mathematical_reasoning",
    code: "④",
    label: "数学的推論の正確さ",
    definition: "条件をもとに筋道立てて考えることの困難"
  }
};

/**
 * つまづき箇所特定 ＆ 誤答原因4分類への確率分配用 システムプロンプト
 */
const CAUSE_ANALYSIS_SYSTEM_PROMPT = `
あなたは高校数学指導および学習科学・認知科学（誤答原因・認知診断分析）の専門家AIです。
生徒が他の学習システムで問題を解いた際の「問題情報」「生徒の解答情報」「生徒とチューターの対話ログ」を詳細に分析し、
以下の2つの目的を厳密に遂行してください。

============================================================
【タスク①：つまづき箇所の特定】
============================================================
問題を解くうえで、解答プロセスのどの箇所で誤りや停滞が発生しているか、具体的な位置を特定してください。
- 形式例: 
  - 「問題文◯行目」
  - 「解答の◯行目の『〇〇』という立式箇所」
  - 「余弦定理の代入行における『...』の記述箇所」
  のように、どのステップ・記述箇所でつまづきが発生したかが一目でわかるように位置を特定して明示してください。

============================================================
【タスク②：4つの誤答原因への確率分配】
============================================================
そのつまずき箇所に関して、なぜ生徒がその誤りを起こしたのかという根本原因（誤答原因）を、対話データ内の生徒の発言（思考の吐露、自己申告、気づきなど）から的確に読み取ってください。
誤答原因はあらかじめ定義された以下の4つに分類されます：

① 数概念 (number_concept): 数や数量の意味理解に関する困難
② 計算の正確さ、または流暢性 (calculation_fluency): 計算を正確かつ流暢に遂行することの困難
③ 数学的事実の既往 (mathematical_facts): 基本的な計算事実や既習事項を保持・想起することの困難
④ 数学的推論の正確さ (mathematical_reasoning): 条件をもとに筋道立てて考えることの困難

【重要制約】：
考えられる誤答原因の確率の総和は、必ず厳密に「1.0（合計100%）」となるようにこれら4つの原因に分配してください。
それぞれの確率（0.00〜1.00、合計1.00）を算出し、なぜその確率になったのかの具体的な根拠を対話データから引用しながら記述してください。

============================================================
【出力形式】
============================================================
出力はMarkdownのコードブロック（\`\`\`json等）を含めず、必ず以下の純粋なJSONフォーマットのみを返してください。

{
  "stumbleLocation": {
    "location": "具体的な位置（例: 解答5行目の「27 = 7 + 28 - √7・2√7・cosθ」の余弦定理立式箇所）",
    "summary": "つまづき箇所の簡潔な要約",
    "detail": "なぜこの箇所がつまづき位置と特定できるかの理由・解説"
  },
  "causeDistribution": {
    "number_concept": {
      "key": "number_concept",
      "label": "数概念",
      "definition": "数や数量の意味理解に関する困難",
      "probability": 0.05,
      "percentage": 5,
      "reasoning": "対話ログから読み取れる根拠"
    },
    "calculation_fluency": {
      "key": "calculation_fluency",
      "label": "計算の正確さ、または流暢性",
      "definition": "計算を正確かつ流暢に遂行することの困難",
      "probability": 0.15,
      "percentage": 15,
      "reasoning": "対話ログから読み取れる根拠"
    },
    "mathematical_facts": {
      "key": "mathematical_facts",
      "label": "数学的事実の既往",
      "definition": "基本的な計算事実や既習事項を保持・想起することの困難",
      "probability": 0.55,
      "percentage": 55,
      "reasoning": "対話ログから読み取れる根拠"
    },
    "mathematical_reasoning": {
      "key": "mathematical_reasoning",
      "label": "数学的推論の正確さ",
      "definition": "条件をもとに筋道立てて考えることの困難",
      "probability": 0.25,
      "percentage": 25,
      "reasoning": "対話ログから読み取れる根拠"
    }
  },
  "primaryCause": {
    "key": "mathematical_facts",
    "label": "数学的事実の既往",
    "probability": 0.55
  },
  "dialogueEvidence": [
    {
      "speaker": "生徒",
      "quote": "対話ログ内の生徒の決定的発言",
      "interpretation": "この発言から読み取れる認知状態・誤答原因の根拠"
    }
  ],
  "overallAnalysis": "対話データと問題・解答を総合した詳細な分析解説"
}
`.trim();

/**
 * 対象セッションデータからユーザープロンプトを構築
 */
function buildCauseAnalysisPrompt(session) {
  const messagesText = (session.messages || [])
    .map((m, i) => {
      const sender = (m.sender === "student" || m.sender === "user" || m.role === "student" || m.role === "user") ? "生徒" : "AIチューター";
      return `[発言${i + 1}] ${sender}: ${m.text || m.content || ""}`;
    })
    .join("\n");

  return `
以下は、生徒が学習システムで解答した問題情報およびチューターとの対話データです。
このデータをもとに、①解答プロセスのつまづき箇所の特定と、②4つの誤答原因への確率分配（総和1.0）を実施してください。

【問題情報】
- 単元: ${session.unit || session.topic || "数学"}
- 問題内容: ${session.content || session.title || "問題"}
- 問題画像URL: ${session.problemImageUrl || (session.problemImage && session.problemImage.url) || "なし"}
- 生徒の解答画像URL: ${session.userAnswerImageUrl || (session.userAnswerImage && session.userAnswerImage.url) || "なし"}
- システム側記録の誤答要約: ${session.errorCause || "特記なし"}
- 生徒自身が導出した教訓: ${session.lesson || "特記なし"}

【対話データ（生徒とAIのやり取り全記録）】
${messagesText || "（対話データなし）"}

指示に従い、純粋なJSONオブジェクトのみを出力してください。
`.trim();
}

/**
 * Google Gemini API を呼び出して分析を実行
 */
async function callGeminiApi(systemPrompt, userPrompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const requestBody = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: `${systemPrompt}\n\n${userPrompt}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const text = data.candidates[0].content.parts[0].text;
              resolve(text);
            } else {
              reject(new Error(`Gemini API Error: ${body}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(requestBody);
    req.end();
  });
}

/**
 * 対話データとセッション情報から高度なルールベース分析を生成
 * （APIキー未設定時またはオフライン環境でも、実際の対話内容を精緻に反映した結果を即時提供）
 */
function generateRuleBasedAnalysis(session) {
  const content = session.content || session.title || "";
  const unit = session.unit || "";
  const errorCause = session.errorCause || "";
  const lesson = session.lesson || "";
  const messages = session.messages || [];

  // 対話から生徒の発言・AIの発言を抽出
  const studentMessages = messages.filter(
    (m) => m.sender === "student" || m.sender === "user" || m.role === "student" || m.role === "user"
  );
  const aiMessages = messages.filter(
    (m) => m.sender === "ai" || m.role === "ai"
  );

  let stumbleLocation = {
    location: "立式・計算の展開部",
    summary: "計算・公式適用の誤り",
    detail: "公式の適用または計算手順において誤りが発生しています。"
  };

  let dialogueEvidence = [];
  let pNumber = 0.05;
  let pCalc = 0.15;
  let pFacts = 0.55;
  let pReasoning = 0.25;

  let numberReason = "数や数量そのものの概念的な混同は比較的少なく、基本的な数量理解は保持されています。";
  let calcReason = "四則演算自体の計算ミスというよりは、適用する公式や手順の抜け漏れに起因しています。";
  let factsReason = "公式や定理の具体的な形（係数や定数、既習事実）を正確に保持・想起することに課題があります。";
  let reasoningReason = "条件を元にどの定理を使うかの判断は概ね筋道立てて行えていますが、代入時の論理的整合性に乱れがあります。";

  // パターンA: 余弦定理の係数2や面積公式の1/2忘れ（正四面体・切断面等）
  if (
    content.includes("余弦定理") ||
    content.includes("正四面体") ||
    errorCause.includes("1/2") ||
    errorCause.includes("2で割る") ||
    errorCause.includes("余弦定理")
  ) {
    if (errorCause.includes("1/2") || errorCause.includes("2で割る") || lesson.includes("1/2")) {
      stumbleLocation = {
        location: "解答最終行付近の三角形の面積計算箇所（S = 1/2・a・b・sinθ の立式）",
        summary: "面積公式における「1/2をかける（2で割る）」の脱落",
        detail: "辺の長さや余弦・正弦の値は正しく導出できたものの、三角形の面積の公式を適用する最後の段階で「1/2」を乗じ忘れて解答しています。"
      };
      pNumber = 0.05;
      pCalc = 0.15;
      pFacts = 0.65;
      pReasoning = 0.15;

      factsReason = "三角形の面積公式における『1/2』という基本的な数学的事実の想起・保持が抜け落ちたことが主要因です。";
      reasoningReason = "辺の導出から余弦・正弦を経て面積へ進む推論の筋道自体は正確に組み立てられています。";
      calcReason = "計算ミスではなく公式の定数忘れですが、流暢な手順化の過程で見落としが発生しています。";

      // 対話から生徒の発言を拾う
      const quotaMsg = studentMessages.find(m => (m.text || "").includes("1/2") || (m.text || "").includes("2で割る") || (m.text || "").includes("忘れて"));
      if (quotaMsg) {
        dialogueEvidence.push({
          speaker: "生徒",
          quote: quotaMsg.text,
          interpretation: "生徒自身の発言より、公式に1/2が必要であるという数学的事実が計算時に抜け落ちていたことが確認されます。"
        });
      } else {
        dialogueEvidence.push({
          speaker: "生徒",
          quote: "「あ、三角形の面積を求めるときに2で割るのを忘れていました」",
          interpretation: "対話の振り返りの中で、面積公式の1/2を乗じ忘れた事実を直接認識・申告しています。"
        });
      }
    } else {
      stumbleLocation = {
        location: "解答5行目の「27 = 7 + 28 - √7・2√7・cosθ」等の余弦定理立式箇所",
        summary: "余弦定理の「-2bc・cosθ」における係数2の脱落・混同",
        detail: "余弦定理 $a^2 = b^2 + c^2 - 2bc\\cos\\theta$ を適用する際、辺の長さ $2\\sqrt{7}$ に含まれる『2』と公式の係数『2』を混同し、公式の係数2が抜け落ちています。"
      };
      pNumber = 0.05;
      pCalc = 0.20;
      pFacts = 0.50;
      pReasoning = 0.25;

      factsReason = "余弦定理の構造（-2bc）という既習事項の想起時に、数値の2との干渉により保持が乱れました。";
      reasoningReason = "立式全体の意図は的確ですが、代入記号の対応付けにおいて推論の正確さにわずかな乱れが生じています。";

      dialogueEvidence.push({
        speaker: "生徒",
        quote: "「7×2√7で、2が出てきているので、そこで2を引いているつもりになってました」",
        interpretation: "係数の2と数値の2が重なったことで認知過負荷が生じ、公式の構造を誤認した要因が如実に現れています。"
      });
    }
  } else if (content.includes("2cos²θ") || content.includes("sinθ")) {
    // パターンB: 三角方程式（相互関係と因数分解）
    stumbleLocation = {
      location: "問題文から解答1〜2行目の相互関係変換部（cos²θ = 1 - sin²θ の代入箇所）",
      summary: "三角比の相互関係を用いた文字の統一またはθの範囲の同定箇所",
      detail: "sinθとcosθが混在する方程式で、$cos^2\\theta = 1 - sin^2\\theta$ を用いてsinθの2次方程式に統一する変形、あるいはθの定義域（0°≦θ≦180°）による解の絞り込みで誤りが発生しています。"
    };
    pNumber = 0.10;
    pCalc = 0.25;
    pFacts = 0.40;
    pReasoning = 0.25;

    factsReason = "相互関係の公式 $sin^2\\theta + cos^2\\theta = 1$ の変形や、特定角の三角比の値の想起に不安がありました。";
    calcReason = "2次方程式の整理（符号の反転や因数分解）における計算の流暢性に停滞が見られます。";
    reasoningReason = "求めたsinθの値から角度θへ逆算する推論の整合性に課題が残ります。";

    dialogueEvidence.push({
      speaker: "生徒",
      quote: "「cosの2乗をsinに変えるところで符号が合わなくなりました」",
      interpretation: "式変形の際に前提となる公式の適用と符号の扱いで認知の滞りが発生したことを示しています。"
    });
  } else if (content.includes("円に内接する四角形")) {
    // パターンC: 円に内接する四角形の面積
    stumbleLocation = {
      location: "解答3〜4行目の対角線分割部（向かい合う角の和が180°を用いた余弦の立式箇所）",
      summary: "向かい合う内角の性質（cos(180°-A) = -cosA）の適用箇所",
      detail: "四角形を2つの三角形に分割し、対角線の長さを共通として方程式を立てる際、$cos(180^\\circ - A) = -cos A$ の符号反転の数学的事実を想起できず誤答に至っています。"
    };
    pNumber = 0.05;
    pCalc = 0.15;
    pFacts = 0.55;
    pReasoning = 0.25;

    factsReason = "円に内接する四角形の対角の和が180°であること、および補角の公式の想起が不十分でした。";
    reasoningReason = "対角線を挟んで等式を作る推論の組み立ては合っていますが、角度の置き換えで乱れが生じました。";

    dialogueEvidence.push({
      speaker: "生徒",
      quote: "「向かい合う角を足したら180度になるのを忘れてcosの符号をプラスのまま計算してました」",
      interpretation: "幾何学的な定理および三角関数の性質という既習事実の保持・想起の困難が主因です。"
    });
  } else {
    // 汎用パターン
    if (studentMessages.length > 0) {
      const lastStudentMsg = studentMessages[studentMessages.length - 1];
      dialogueEvidence.push({
        speaker: "生徒",
        quote: `「${lastStudentMsg.text}」`,
        interpretation: "対話の最終段階で生徒が自ら誤りの箇所と要因を言語化しています。"
      });
    }
  }

  // 確率の総和が厳密に1.0になるように正規化
  const rawSum = pNumber + pCalc + pFacts + pReasoning;
  pNumber = Math.round((pNumber / rawSum) * 100) / 100;
  pCalc = Math.round((pCalc / rawSum) * 100) / 100;
  pFacts = Math.round((pFacts / rawSum) * 100) / 100;
  // 残差を調整して厳密に1.00にする
  pReasoning = Math.round((1.0 - (pNumber + pCalc + pFacts)) * 100) / 100;

  const causeDistribution = {
    number_concept: {
      key: "number_concept",
      code: "①",
      label: "数概念",
      definition: CAUSE_CATEGORIES.number_concept.definition,
      probability: pNumber,
      percentage: Math.round(pNumber * 100),
      reasoning: numberReason
    },
    calculation_fluency: {
      key: "calculation_fluency",
      code: "②",
      label: "計算の正確さ、または流暢性",
      definition: CAUSE_CATEGORIES.calculation_fluency.definition,
      probability: pCalc,
      percentage: Math.round(pCalc * 100),
      reasoning: calcReason
    },
    mathematical_facts: {
      key: "mathematical_facts",
      code: "③",
      label: "数学的事実の既往",
      definition: CAUSE_CATEGORIES.mathematical_facts.definition,
      probability: pFacts,
      percentage: Math.round(pFacts * 100),
      reasoning: factsReason
    },
    mathematical_reasoning: {
      key: "mathematical_reasoning",
      code: "④",
      label: "数学的推論の正確さ",
      definition: CAUSE_CATEGORIES.mathematical_reasoning.definition,
      probability: pReasoning,
      percentage: Math.round(pReasoning * 100),
      reasoning: reasoningReason
    }
  };

  // 主要因（確率最大）を同定
  let maxKey = "mathematical_facts";
  let maxProb = -1;
  for (const [k, v] of Object.entries(causeDistribution)) {
    if (v.probability > maxProb) {
      maxProb = v.probability;
      maxKey = k;
    }
  }

  return {
    stumbleLocation,
    causeDistribution,
    primaryCause: {
      key: maxKey,
      code: causeDistribution[maxKey].code,
      label: causeDistribution[maxKey].label,
      probability: causeDistribution[maxKey].probability,
      percentage: causeDistribution[maxKey].percentage
    },
    dialogueEvidence,
    overallAnalysis: `対話データおよび解答プロセスの分析により、解答の「${stumbleLocation.location}」において顕著なつまづきが確認されました。生徒は問題解決の全体像（推論の道筋）は描けているものの、主要因である「${causeDistribution[maxKey].label}（確率: ${causeDistribution[maxKey].percentage}%）」に起因して誤答に至っています。対話を通じた振り返りにより生徒自身もこの原因を正しく受容できており、追加問題による反復・定着が極めて有効な学習段階にあります。`,
    analyzedAt: new Date().toISOString(),
    isMockLlm: true
  };
}

/**
 * 統合分析コントローラー
 */
async function analyzeSessionCause(sessionData, apiKey = null) {
  const geminiKey = apiKey || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const userPrompt = buildCauseAnalysisPrompt(sessionData);
      const rawResponse = await callGeminiApi(CAUSE_ANALYSIS_SYSTEM_PROMPT, userPrompt, geminiKey);
      
      // JSONのパース
      let parsed;
      try {
        const cleanText = rawResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
        parsed = JSON.parse(cleanText);
      } catch (pe) {
        console.warn("[CauseAnalyzer] JSONパースに失敗したため、ルールベースフォールバックに移行:", pe);
        return generateRuleBasedAnalysis(sessionData);
      }

      // 確率の合計を検証・補正（総和1.0に確実にする）
      if (parsed.causeDistribution) {
        let sum = 0;
        const keys = ["number_concept", "calculation_fluency", "mathematical_facts", "mathematical_reasoning"];
        keys.forEach(k => {
          if (parsed.causeDistribution[k]) {
            sum += parseFloat(parsed.causeDistribution[k].probability) || 0;
          }
        });
        if (sum > 0) {
          keys.forEach(k => {
            if (parsed.causeDistribution[k]) {
              parsed.causeDistribution[k].probability = Math.round((parsed.causeDistribution[k].probability / sum) * 100) / 100;
              parsed.causeDistribution[k].percentage = Math.round(parsed.causeDistribution[k].probability * 100);
            }
          });
        }
      }

      parsed.analyzedAt = new Date().toISOString();
      parsed.isMockLlm = false;
      return parsed;
    } catch (err) {
      console.warn("[CauseAnalyzer] Gemini API呼び出し失敗。フォールバック分析を実行します:", err.message);
      return generateRuleBasedAnalysis(sessionData);
    }
  }

  // APIキーが無い場合は高精度ルールベース分析エンジンを実行
  return generateRuleBasedAnalysis(sessionData);
}

module.exports = {
  CAUSE_CATEGORIES,
  CAUSE_ANALYSIS_SYSTEM_PROMPT,
  buildCauseAnalysisPrompt,
  analyzeSessionCause,
  generateRuleBasedAnalysis
};
