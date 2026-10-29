/**
 * server.js
 * 
 * 原因分析プラットフォーム ローカルWebサーバー
 * - serviceAccountKey.json による Google Cloud / Firebase (rss-m1) への認証・DB連携
 * - Firestore REST API経由で users および dialogueSessions を取得
 * - 静的アセット（HTML, CSS, JS, JSON）の配信
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const causeAnalyzer = require("./services/cause_analyzer");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const ENV_PATH = path.join(ROOT_DIR, ".env");
const SERVICE_ACCOUNT_PATH = path.join(ROOT_DIR, "serviceAccountKey.json");

/**
 * サービスアカウントの認証情報読み込み
 */
function getServiceAccount() {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
    } catch (e) {
      console.warn("[Server] serviceAccountKey.json のパースに失敗しました:", e);
    }
  }
  return null;
}

// キャッシュ用アクセストークン
let cachedToken = null;
let tokenExpiry = 0;

/**
 * サービスアカウントキーを使用して Google OAuth 2.0 アクセストークンを発行・キャッシュ
 */
async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 60) {
    return cachedToken;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  function base64url(str) {
    return Buffer.from(str)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signatureInput);
  signer.end();
  const signature = signer.sign(creds.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signatureInput}.${signature}`;

  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }).toString();

    const req = https.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.access_token) {
              cachedToken = data.access_token;
              tokenExpiry = now + (data.expires_in || 3600);
              resolve(cachedToken);
            } else {
              reject(new Error(`Token Error: ${body}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Firestoreドキュメントの値を標準JSオブジェクトへ変換
 */
function parseFirestoreFields(fields) {
  if (!fields) return {};
  const res = {};
  for (const [k, v] of Object.entries(fields)) {
    if ("stringValue" in v) res[k] = v.stringValue;
    else if ("integerValue" in v) res[k] = parseInt(v.integerValue, 10);
    else if ("doubleValue" in v) res[k] = parseFloat(v.doubleValue);
    else if ("booleanValue" in v) res[k] = v.booleanValue;
    else if ("timestampValue" in v) res[k] = v.timestampValue;
    else if ("mapValue" in v) res[k] = parseFirestoreFields(v.mapValue.fields);
    else if ("arrayValue" in v) {
      res[k] = (v.arrayValue.values || []).map((item) => {
        if ("stringValue" in item) return item.stringValue;
        if ("integerValue" in item) return parseInt(item.integerValue, 10);
        if ("mapValue" in item) return parseFirestoreFields(item.mapValue.fields);
        return item;
      });
    } else {
      res[k] = v;
    }
  }
  return res;
}

/**
 * HTTPS GETリクエスト
 */
function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // 1. API: /api/config
  if (pathname === "/api/config") {
    const sa = getServiceAccount();
    const config = {
      hasServiceAccount: !!sa,
      projectId: sa ? sa.project_id : "rss-m1",
      clientEmail: sa ? sa.client_email : "",
      useMock: !sa
    };
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(config, null, 2));
    return;
  }

  // 2. API: /api/firebase/users (Firestoreの全ユーザーを取得)
  if (pathname === "/api/firebase/users") {
    const sa = getServiceAccount();
    if (!sa) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ isMock: true, users: [] }));
      return;
    }

    try {
      const token = await getAccessToken(sa);
      const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/users?pageSize=50`;
      const resp = await httpsGet(url, token);

      const users = [];
      if (resp.data && resp.data.documents) {
        resp.data.documents.forEach((d) => {
          const fields = parseFirestoreFields(d.fields);
          const id = d.name.split("/").pop();
          users.push({ docId: id, ...fields });
        });
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ isMock: false, projectId: sa.project_id, users }, null, 2));
    } catch (err) {
      console.error("[API] /api/firebase/users error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 2.5 API: /api/auth/student-login (学年・組・番号による照合ログイン)
  if (pathname === "/api/auth/student-login" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const targetGrade = parseInt(payload.grade, 10);
        const targetClass = String(payload.className || "").trim().replace(/組$/, "");
        const targetNumber = parseInt(payload.studentNumber, 10);

        const sa = getServiceAccount();
        if (!sa) {
          // モック対応
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({
            success: true,
            user: {
              uid: "mock-student-001",
              displayName: "テスト生徒",
              email: "test.student@edu-sample.jp",
              studentId: `${targetGrade || 1}-${targetClass || "1"}-${targetNumber || 1}`,
              organization: `${targetGrade || 1}年 ${targetClass || "1"}組 ${targetNumber || 1}番`,
              role: "student",
              grade: targetGrade || 1,
              className: targetClass || "1",
              studentNumber: targetNumber || 1,
              isMock: true
            }
          }));
          return;
        }

        const token = await getAccessToken(sa);
        const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/users?pageSize=100`;
        const resp = await httpsGet(url, token);

        let matchedUser = null;
        if (resp.data && resp.data.documents) {
          for (const doc of resp.data.documents) {
            const fields = parseFirestoreFields(doc.fields);
            const userGrade = parseInt(fields.grade, 10);
            const userClass = String(fields.className || "").trim().replace(/組$/, "");
            const userNumber = parseInt(fields.studentNumber, 10);

            // 学年・組・出席番号が一致するか判定
            const isGradeMatch = !isNaN(targetGrade) ? userGrade === targetGrade : true;
            const isClassMatch = targetClass ? userClass.toLowerCase() === targetClass.toLowerCase() : true;
            const isNumberMatch = !isNaN(targetNumber) ? userNumber === targetNumber : true;

            if (isGradeMatch && isClassMatch && isNumberMatch) {
              const docId = doc.name.split("/").pop();
              matchedUser = { docId, ...fields };
              break;
            }
          }
        }

        if (matchedUser) {
          const displayName = matchedUser.displayName || `${matchedUser.lastName || ""} ${matchedUser.firstName || ""}`.trim() || matchedUser.email || "生徒";
          const studentId = matchedUser.uniqueId || `${matchedUser.grade}-${matchedUser.className}-${matchedUser.studentNumber}`;
          const organization = `${matchedUser.grade ? `${matchedUser.grade}年` : ""} ${matchedUser.className ? `${matchedUser.className}組` : ""} ${matchedUser.studentNumber ? `${matchedUser.studentNumber}番` : ""}`.trim();

          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({
            success: true,
            user: {
              uid: matchedUser.userId || matchedUser.docId,
              docId: matchedUser.docId,
              displayName,
              email: matchedUser.email || "",
              studentId,
              organization: organization || "第一高校",
              role: "student",
              grade: matchedUser.grade,
              className: matchedUser.className,
              studentNumber: matchedUser.studentNumber,
              photoURL: matchedUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0284c7&color=fff`,
              isMock: false
            }
          }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({
            success: false,
            message: `該当する生徒が見つかりませんでした (学年: ${targetGrade || "-"}年, クラス: ${targetClass || "-"}組, 番号: ${targetNumber || "-"}番)`
          }));
        }
      } catch (err) {
        console.error("[API] /api/auth/student-login error:", err);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // 3. API: /api/firebase/user-data (特定のユーザーIDに紐づく対話セッション・問題を取得)
  if (pathname === "/api/firebase/user-data") {
    const userId = parsedUrl.searchParams.get("userId");
    const sa = getServiceAccount();

    if (!sa) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "serviceAccountKey.json がありません" }));
      return;
    }

    try {
      const token = await getAccessToken(sa);
      
      // dialogueSessions から該当ユーザーのセッションを取得
      const sessionsUrl = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/dialogueSessions?pageSize=50`;
      const resp = await httpsGet(sessionsUrl, token);

      const sessions = [];
      if (resp.data && resp.data.documents) {
        for (const doc of resp.data.documents) {
          const fields = parseFirestoreFields(doc.fields);
          const docId = doc.name.split("/").pop();

          // ユーザー指定があればフィルタ、無ければ最新を返却
          if (!userId || fields.userId === userId || fields.userEmail === userId) {
            // サブコレクション messages も取得を試行
            let messages = [];
            try {
              const msgUrl = `https://firestore.googleapis.com/v1/${doc.name}/messages?pageSize=50`;
              const msgResp = await httpsGet(msgUrl, token);
              if (msgResp.data && msgResp.data.documents) {
                messages = msgResp.data.documents.map(m => parseFirestoreFields(m.fields));
                // 時系列順（古い発言が先頭、新しい発言が末尾）に昇順ソート
                messages.sort((a, b) => {
                  const tA = new Date(a.timestamp || a.createdAt || 0).getTime();
                  const tB = new Date(b.timestamp || b.createdAt || 0).getTime();
                  return tA - tB;
                });
              }
            } catch (me) {
              console.warn("Messages fetch warning:", me);
            }

            sessions.push({
              sessionId: docId,
              ...fields,
              messages
            });
          }
        }
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        projectId: sa.project_id,
        userId,
        sessionsCount: sessions.length,
        sessions
      }, null, 2));
    } catch (err) {
      console.error("[API] /api/firebase/user-data error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3.5 API: /api/cause-analysis/prompt (LLM分析用プロンプト仕様の取得)
  if (pathname === "/api/cause-analysis/prompt" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      systemPrompt: causeAnalyzer.CAUSE_ANALYSIS_SYSTEM_PROMPT,
      categories: causeAnalyzer.CAUSE_CATEGORIES
    }, null, 2));
    return;
  }

  // 3.6 API: /api/cause-analysis/analyze (つまづき箇所と4つの誤答原因の確率分配をLLMで分析)
  if (pathname === "/api/cause-analysis/analyze" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const sessionData = payload.session || payload;
        const apiKey = payload.apiKey || null;

        if (!sessionData) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "分析対象のセッションデータが指定されていません" }));
          return;
        }

        // プロンプト生成
        const userPrompt = causeAnalyzer.buildCauseAnalysisPrompt(sessionData);

        // 分析実行 (Gemini API または 高精度ルールベースフォールバック)
        const analysisResult = await causeAnalyzer.analyzeSessionCause(sessionData, apiKey);

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          success: true,
          analysis: analysisResult,
          prompts: {
            systemPrompt: causeAnalyzer.CAUSE_ANALYSIS_SYSTEM_PROMPT,
            userPrompt
          }
        }, null, 2));
      } catch (err) {
        console.error("[API] /api/cause-analysis/analyze error:", err);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. ルートパスを /app/index.html にマッピング
  if (pathname === "/" || pathname === "/app" || pathname === "/app/") {
    pathname = "/app/index.html";
  }

  // 5. 静的ファイルの配信
  let filePath = path.join(ROOT_DIR, pathname);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html lang="ja">
      <head><meta charset="utf-8"><title>404 Not Found</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2>404 Not Found</h2>
        <p>指定されたファイルが見つかりません: <code>${pathname}</code></p>
        <p><a href="/app/index.html">ログイン画面へ戻る</a></p>
      </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  const sa = getServiceAccount();
  console.log(`\n======================================================`);
  console.log(`🚀 原因分析システム（cause_analysis）サーバー稼働中`);
  console.log(`------------------------------------------------------`);
  console.log(`🌐 ログイン画面URL: http://localhost:${PORT}/`);
  console.log(`🔑 サービスアカウント: ${sa ? `✅ 接続中 (${sa.project_id})` : "❌ なし (モック)"}`);
  console.log(`📂 静的フォルダ:    /app, /auth, /services`);
  console.log(`======================================================\n`);
});
