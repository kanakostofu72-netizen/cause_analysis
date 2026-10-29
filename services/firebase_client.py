"""
services/firebase_client.py

Python環境からFirebase (Firestore / Auth) およびサービスアカウントキーへアクセスするクライアントモジュール
serviceAccountKey.json を直接利用して JWT アクセストークンを生成し、
プロジェクト rss-m1 の実DB（users / dialogueSessions）からデータを取得します。
"""

import os
import sys
import json
import time
import base64
import urllib.request
import urllib.parse
from pathlib import Path

# Windows環境のCP932エンコーディング対策
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_FILE = PROJECT_ROOT / "serviceAccountKey.json"

class CauseAnalysisDataClient:
    def __init__(self):
        self.service_account = self._load_service_account()
        self.project_id = self.service_account.get("project_id", "rss-m1") if self.service_account else "rss-m1"
        self._access_token = None
        self._token_expiry = 0

    def _load_service_account(self):
        # 大文字小文字両対応
        for fname in ["serviceAccountKey.json", "serviceaccountkey.json"]:
            fpath = PROJECT_ROOT / fname
            if fpath.exists():
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception as e:
                    print(f"[Python Client] [WARN] {fname} 読み込み失敗: {e}")
        return None

    def get_access_token(self):
        """
        サービスアカウントの秘密鍵から JWT を生成し、Google OAuth 2.0 アクセストークンを取得
        """
        if not self.service_account:
            return None

        now = int(time.time())
        if self._access_token and self._token_expiry > now + 60:
            return self._access_token

        # JWT の署名生成 (cryptography または PyJWT が無い場合のフォールバック付き)
        try:
            # 标准库 ssl/cryptography または Node互換署名
            import subprocess
            # Node.js を利用した安全な署名ヘルパー
            script = f"""
            const crypto = require('crypto');
            const fs = require('fs');
            const creds = JSON.parse(fs.readFileSync({json.dumps(str(SERVICE_ACCOUNT_FILE))}, 'utf8'));
            const now = Math.floor(Date.now() / 1000);
            function b64url(s) {{ return Buffer.from(s).toString('base64').replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_'); }}
            const h = b64url(JSON.stringify({{ alg: 'RS256', typ: 'JWT' }}));
            const c = b64url(JSON.stringify({{
              iss: creds.client_email,
              scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
              aud: 'https://oauth2.googleapis.com/token',
              exp: now + 3600, iat: now
            }}));
            const sign = crypto.createSign('RSA-SHA256').update(h + '.' + c);
            sign.end();
            const s = sign.sign(creds.private_key, 'base64').replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_');
            process.stdout.write(h + '.' + c + '.' + s);
            """
            res = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
            jwt = res.stdout.strip()

            # トークン取得
            data = urllib.parse.urlencode({
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt
            }).encode("utf-8")
            req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
            with urllib.request.urlopen(req, timeout=10) as response:
                token_data = json.loads(response.read().decode("utf-8"))
                self._access_token = token_data["access_token"]
                self._token_expiry = now + token_data.get("expires_in", 3600)
                return self._access_token
        except Exception as e:
            print(f"[Python Client] [WARN] アクセストークン取得エラー: {e}")
            return None

    def get_users(self):
        """Firestore の users コレクションから生徒一覧を取得"""
        token = self.get_access_token()
        if not token:
            return []
        url = f"https://firestore.googleapis.com/v1/projects/{self.project_id}/databases/(default)/documents/users?pageSize=50"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                users = []
                for doc in data.get("documents", []):
                    users.append(self._parse_firestore_doc(doc))
                return users
        except Exception as e:
            print(f"[Python Client] [ERROR] users取得エラー: {e}")
            return []

    def get_user_sessions(self, user_id=None):
        """Firestore の dialogueSessions から対話セッションおよび問題データを取得"""
        token = self.get_access_token()
        if not token:
            return []
        url = f"https://firestore.googleapis.com/v1/projects/{self.project_id}/databases/(default)/documents/dialogueSessions?pageSize=50"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                sessions = []
                for doc in data.get("documents", []):
                    parsed = self._parse_firestore_doc(doc)
                    if not user_id or parsed.get("userId") == user_id or parsed.get("userEmail") == user_id:
                        sessions.append(parsed)
                return sessions
        except Exception as e:
            print(f"[Python Client] [ERROR] sessions取得エラー: {e}")
            return []

    def _parse_firestore_doc(self, doc):
        fields = doc.get("fields", {})
        parsed = {"_docId": doc.get("name", "").split("/")[-1]}
        for k, v in fields.items():
            if "stringValue" in v: parsed[k] = v["stringValue"]
            elif "integerValue" in v: parsed[k] = int(v["integerValue"])
            elif "booleanValue" in v: parsed[k] = v["booleanValue"]
            elif "timestampValue" in v: parsed[k] = v["timestampValue"]
            elif "mapValue" in v:
                parsed[k] = self._parse_map_value(v["mapValue"].get("fields", {}))
        return parsed

    def _parse_map_value(self, fields):
        res = {}
        for k, v in fields.items():
            if "stringValue" in v: res[k] = v["stringValue"]
            elif "integerValue" in v: res[k] = int(v["integerValue"])
            elif "booleanValue" in v: res[k] = v["booleanValue"]
            elif "mapValue" in v: res[k] = self._parse_map_value(v["mapValue"].get("fields", {}))
        return res

if __name__ == "__main__":
    client = CauseAnalysisDataClient()
    print("=== [Python Client] Firestore (rss-m1) 接続テスト ===")
    users = client.get_users()
    print(f"取得できた実ユーザー数: {len(users)} 件")
    for u in users[:5]:
        print(f"- {u.get('lastName', '')} {u.get('firstName', '')} (UID: {u.get('userId')}, Email: {u.get('email')})")

    print("\n--- 実対話セッション (dialogueSessions) の取得 ---")
    sessions = client.get_user_sessions()
    print(f"取得できたセッション数: {len(sessions)} 件")
    for s in sessions[:3]:
        print(f"- [単元: {s.get('unit')}] 内容: {s.get('content')}")
        print(f"  生徒: {s.get('displayName')} (UID: {s.get('userId')})")
        print(f"  つまずき要因: {s.get('errorCause')}")
