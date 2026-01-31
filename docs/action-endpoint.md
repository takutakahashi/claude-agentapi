# /action エンドポイント使用ガイド

## 概要

`/action` エンドポイントは、Claude Agent との対話的なやり取りを実現するための統合インターフェースです。このエンドポイントを使用することで、以下の操作が可能になります：

1. **AskUserQuestion への回答** - エージェントからの質問に答える
2. **Plan の承認/却下** - エージェントが提案したプランを承認または却下する
3. **エージェントの停止** - 実行中のエージェントを即座に停止する

## エンドポイント仕様

### GET /action - 保留中のアクション一覧を取得

現在ユーザーの応答を待っているアクションの一覧を取得します。質問やプランの内容も含まれます。

- **URL**: `GET /action`
- **レスポンス**: `application/json`

#### レスポンス形式

```json
{
  "pending_actions": [
    {
      "type": "answer_question" | "approve_plan",
      "tool_use_id": "toolu_xxx",
      "content": { ... }  // 質問やプランの詳細
    }
  ]
}
```

#### 使用例

##### TypeScript/JavaScript

```typescript
async function getPendingActions() {
  const response = await fetch('http://localhost:9000/action');
  const data = await response.json();
  return data.pending_actions;
}

// 使用例
const pending = await getPendingActions();
console.log(`保留中のアクション: ${pending.length}件`);

for (const action of pending) {
  if (action.type === 'answer_question') {
    console.log('質問:', action.content.questions);
  } else if (action.type === 'approve_plan') {
    console.log('プラン:', action.content);
  }
}
```

##### Python

```python
import requests

def get_pending_actions() -> list:
    response = requests.get('http://localhost:9000/action')
    response.raise_for_status()
    return response.json()['pending_actions']

# 使用例
pending = get_pending_actions()
print(f'保留中のアクション: {len(pending)}件')

for action in pending:
    if action['type'] == 'answer_question':
        print('質問:', action['content']['questions'])
    elif action['type'] == 'approve_plan':
        print('プラン:', action['content'])
```

##### curl

```bash
curl http://localhost:9000/action | jq
```

### POST /action - アクションを送信

- **URL**: `POST /action`
- **Content-Type**: `application/json`
- **レスポンス**: `application/json`

## アクションタイプ

### 1. answer_question - 質問への回答

エージェントが `AskUserQuestion` ツールを使用して質問を投げかけた際に、その質問に対する回答を送信します。

#### リクエスト形式

```json
{
  "type": "answer_question",
  "answers": {
    "question_id_1": "answer_1",
    "question_id_2": "answer_2"
  }
}
```

#### パラメータ

- `type` (string, required): 固定値 `"answer_question"`
- `answers` (object, required): 質問IDと回答のマッピング
  - キー: 質問ID（文字列）
  - 値: 回答内容（文字列）

#### レスポンス

**成功時 (200 OK):**
```json
{
  "ok": true
}
```

**エラー時 (409 Conflict):**
```json
{
  "type": "about:blank",
  "title": "No active question",
  "status": 409,
  "detail": "There is no active question to answer. The agent must be running and waiting for user input."
}
```

#### 使用例

##### TypeScript/JavaScript

```typescript
async function answerQuestion(answers: Record<string, string>) {
  const response = await fetch('http://localhost:9000/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'answer_question',
      answers: answers,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to answer question: ${error.detail}`);
  }

  return await response.json();
}

// 使用例
await answerQuestion({
  'deployment_target': 'production',
  'confirm_changes': 'yes',
});
```

##### Python

```python
import requests

def answer_question(answers: dict[str, str]) -> dict:
    response = requests.post(
        'http://localhost:9000/action',
        json={
            'type': 'answer_question',
            'answers': answers,
        }
    )
    response.raise_for_status()
    return response.json()

# 使用例
answer_question({
    'deployment_target': 'production',
    'confirm_changes': 'yes',
})
```

##### curl

```bash
curl -X POST http://localhost:9000/action \
  -H "Content-Type: application/json" \
  -d '{
    "type": "answer_question",
    "answers": {
      "deployment_target": "production",
      "confirm_changes": "yes"
    }
  }'
```

#### ワークフロー

1. **エージェントが質問を投げる**
   - エージェントが `AskUserQuestion` ツールを呼び出す
   - サーバーは質問を `type: "question"` のメッセージとしてブロードキャスト
   - SSE 経由で接続中のクライアントに通知

2. **クライアントが質問を受け取る**
   - SSE の `message_update` イベントで質問を受信
   - `type: "question"` のメッセージを検出
   - ユーザーに質問を表示して回答を収集

3. **クライアントが回答を送信**
   - `POST /action` に `answer_question` アクションを送信
   - 質問IDと回答のマッピングを含める

4. **サーバーが回答を処理**
   - エージェントのステータスが `running` であることを確認
   - 保存されている `pendingQuestionToolUseId` を使用
   - 回答を `tool_result` としてエージェントに送信

5. **エージェントが処理を継続**
   - 回答を受け取り、次のステップに進む

---

### 2. approve_plan - プランの承認/却下

エージェントが `ExitPlanMode` ツールを使用してプランを提示した際に、そのプランを承認または却下します。

#### リクエスト形式

```json
{
  "type": "approve_plan",
  "approved": true
}
```

#### パラメータ

- `type` (string, required): 固定値 `"approve_plan"`
- `approved` (boolean, required): プランを承認する場合は `true`、却下する場合は `false`

#### レスポンス

**成功時 (200 OK):**
```json
{
  "ok": true
}
```

**エラー時 (409 Conflict):**
```json
{
  "type": "about:blank",
  "title": "No active plan",
  "status": 409,
  "detail": "There is no active plan to approve. The agent must be running and waiting for plan approval."
}
```

#### 使用例

##### TypeScript/JavaScript

```typescript
async function approvePlan(approved: boolean) {
  const response = await fetch('http://localhost:9000/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'approve_plan',
      approved: approved,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to approve plan: ${error.detail}`);
  }

  return await response.json();
}

// プランを承認
await approvePlan(true);

// プランを却下
await approvePlan(false);
```

##### Python

```python
import requests

def approve_plan(approved: bool) -> dict:
    response = requests.post(
        'http://localhost:9000/action',
        json={
            'type': 'approve_plan',
            'approved': approved,
        }
    )
    response.raise_for_status()
    return response.json()

# プランを承認
approve_plan(True)

# プランを却下
approve_plan(False)
```

##### curl

```bash
# プランを承認
curl -X POST http://localhost:9000/action \
  -H "Content-Type: application/json" \
  -d '{
    "type": "approve_plan",
    "approved": true
  }'

# プランを却下
curl -X POST http://localhost:9000/action \
  -H "Content-Type: application/json" \
  -d '{
    "type": "approve_plan",
    "approved": false
  }'
```

#### ワークフロー

1. **エージェントがプランを提示**
   - エージェントが `ExitPlanMode` ツールを呼び出す
   - サーバーはプランを `type: "plan"` のメッセージとしてブロードキャスト
   - SSE 経由で接続中のクライアントに通知

2. **クライアントがプランを受け取る**
   - SSE の `message_update` イベントでプランを受信
   - `type: "plan"` のメッセージを検出
   - ユーザーにプランを表示して承認/却下の判断を求める

3. **クライアントが承認/却下を送信**
   - `POST /action` に `approve_plan` アクションを送信
   - `approved: true` または `approved: false` を指定

4. **サーバーが承認/却下を処理**
   - エージェントのステータスが `running` であることを確認
   - 保存されている `pendingPlanToolUseId` を使用
   - 承認/却下を `tool_result` としてエージェントに送信
   - 承認の場合は "approved"、却下の場合は "rejected" を送信

5. **エージェントが処理を継続**
   - 承認された場合: プランの実行を開始
   - 却下された場合: プランを中止し、次のステップを検討

---

### 3. stop_agent - エージェントの停止

実行中のエージェントを即座に停止します。このアクションは、エージェントのステータスに関わらず、いつでも実行可能です。

#### リクエスト形式

```json
{
  "type": "stop_agent"
}
```

#### パラメータ

- `type` (string, required): 固定値 `"stop_agent"`

#### レスポンス

**成功時 (200 OK):**
```json
{
  "ok": true
}
```

**エラー時 (500 Internal Server Error):**
```json
{
  "type": "about:blank",
  "title": "Internal server error",
  "status": 500,
  "detail": "Agent not initialized"
}
```

#### 使用例

##### TypeScript/JavaScript

```typescript
async function stopAgent() {
  const response = await fetch('http://localhost:9000/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'stop_agent',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to stop agent: ${error.detail}`);
  }

  return await response.json();
}

// エージェントを停止
await stopAgent();
```

##### Python

```python
import requests

def stop_agent() -> dict:
    response = requests.post(
        'http://localhost:9000/action',
        json={
            'type': 'stop_agent',
        }
    )
    response.raise_for_status()
    return response.json()

# エージェントを停止
stop_agent()
```

##### curl

```bash
curl -X POST http://localhost:9000/action \
  -H "Content-Type: application/json" \
  -d '{
    "type": "stop_agent"
  }'
```

#### 動作

1. **停止処理**
   - 実行中のクエリを `query.interrupt()` で中断
   - エージェントのステータスを `stable` に変更

2. **使用ケース**
   - ユーザーがタスクをキャンセルしたい場合
   - 長時間実行されているタスクを強制終了したい場合
   - エージェントが無限ループに陥った場合

3. **注意点**
   - このアクションは不可逆的です
   - 停止後、エージェントを再開するには新しいメッセージを送信する必要があります
   - 実行中のツールは中断されます

---

## 統合的な使用例

### React での実装例

```typescript
import { useEffect, useState } from 'react';

interface Message {
  id: number;
  role: string;
  content: string;
  time: string;
  type?: 'normal' | 'question' | 'plan';
}

interface PendingAction {
  type: string;
  tool_use_id: string;
  content: unknown;
}

function AgentClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);

  // 保留中のアクションを定期的にポーリング
  useEffect(() => {
    const fetchPendingActions = async () => {
      const response = await fetch('http://localhost:9000/action');
      const data = await response.json();
      setPendingActions(data.pending_actions);
    };

    fetchPendingActions();
    const interval = setInterval(fetchPendingActions, 2000); // 2秒ごと

    return () => clearInterval(interval);
  }, []);

  // SSE 接続でメッセージを受信
  useEffect(() => {
    const eventSource = new EventSource('http://localhost:9000/events');

    eventSource.addEventListener('message_update', (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, message]);
    });

    return () => eventSource.close();
  }, []);

  const answerQuestion = async (answers: Record<string, string>) => {
    await fetch('http://localhost:9000/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'answer_question',
        answers,
      }),
    });
    setPendingQuestion(null);
  };

  const handlePlanApproval = async (approved: boolean) => {
    await fetch('http://localhost:9000/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'approve_plan',
        approved,
      }),
    });
  };

  const stopAgent = async () => {
    await fetch('http://localhost:9000/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'stop_agent',
      }),
    });
  };

  // 保留中のアクションを type で分類
  const pendingQuestion = pendingActions.find(a => a.type === 'answer_question');
  const pendingPlan = pendingActions.find(a => a.type === 'approve_plan');

  return (
    <div>
      {/* メッセージ表示 */}
      <div>
        {messages.map(msg => (
          <div key={msg.id}>{msg.content}</div>
        ))}
      </div>

      {/* 質問への回答UI */}
      {pendingQuestion && (
        <div>
          <h3>質問が届いています</h3>
          <pre>{JSON.stringify(pendingQuestion.content, null, 2)}</pre>
          <button onClick={() => answerQuestion({ '0': 'answer' })}>
            回答する
          </button>
        </div>
      )}

      {/* プラン承認UI */}
      {pendingPlan && (
        <div>
          <h3>プランの承認を求められています</h3>
          <pre>{JSON.stringify(pendingPlan.content, null, 2)}</pre>
          <button onClick={() => handlePlanApproval(true)}>承認</button>
          <button onClick={() => handlePlanApproval(false)}>却下</button>
        </div>
      )}

      {/* エージェント停止ボタン */}
      <button onClick={stopAgent}>エージェントを停止</button>
    </div>
  );
}
```

### Python での完全な実装例

```python
import requests
import json
from typing import Optional
from sseclient import SSEClient  # pip install sseclient-py

class AgentAPIClient:
    def __init__(self, base_url: str = "http://localhost:9000"):
        self.base_url = base_url

    def get_pending_actions(self) -> list:
        """保留中のアクションを取得"""
        response = requests.get(f"{self.base_url}/action")
        response.raise_for_status()
        return response.json()["pending_actions"]

    def send_message(self, content: str):
        """エージェントにメッセージを送信"""
        response = requests.post(
            f"{self.base_url}/message",
            json={"content": content, "type": "user"}
        )
        response.raise_for_status()
        return response.json()

    def answer_question(self, answers: dict[str, str]):
        """質問に回答"""
        response = requests.post(
            f"{self.base_url}/action",
            json={"type": "answer_question", "answers": answers}
        )
        response.raise_for_status()
        return response.json()

    def approve_plan(self, approved: bool):
        """プランを承認/却下"""
        response = requests.post(
            f"{self.base_url}/action",
            json={"type": "approve_plan", "approved": approved}
        )
        response.raise_for_status()
        return response.json()

    def stop_agent(self):
        """エージェントを停止"""
        response = requests.post(
            f"{self.base_url}/action",
            json={"type": "stop_agent"}
        )
        response.raise_for_status()
        return response.json()

    def listen_events(self):
        """SSEイベントをリッスン"""
        messages = SSEClient(f"{self.base_url}/events")

        for msg in messages:
            if msg.event == 'message_update':
                message = json.loads(msg.data)
                print(f"[{message['role']}] {message['content']}")

                # 質問を検出
                if message.get('type') == 'question':
                    self.pending_question = message
                    print("\n⚠️  質問が届きました！")

                # プランを検出
                elif message.get('type') == 'plan':
                    self.pending_plan = message
                    print("\n⚠️  プランが届きました！")

# 使用例
if __name__ == "__main__":
    client = AgentAPIClient()

    # メッセージ送信
    client.send_message("プロジェクトのデプロイ手順を教えて")

    # イベントをリッスン（別スレッドで実行することを推奨）
    # client.listen_events()

    # 質問に回答（質問が届いた後）
    client.answer_question({
        "deployment_target": "production",
        "confirm": "yes"
    })

    # プランを承認（プランが届いた後）
    client.approve_plan(True)

    # エージェントを停止
    # client.stop_agent()
```

## エラーハンドリング

### 共通エラー

#### 400 Bad Request - 無効なリクエスト

```json
{
  "type": "about:blank",
  "title": "Invalid request",
  "status": 400,
  "detail": "Validation error details..."
}
```

**原因:**
- リクエストボディの形式が正しくない
- 必須フィールドが不足している
- `type` フィールドの値が無効

**対処法:**
- リクエストボディの形式を確認
- 必須フィールドがすべて含まれているか確認
- `type` フィールドが正しい値（`answer_question`, `approve_plan`, `stop_agent`）であることを確認

#### 409 Conflict - 状態の不一致

```json
{
  "type": "about:blank",
  "title": "No active question",
  "status": 409,
  "detail": "There is no active question to answer..."
}
```

**原因:**
- エージェントが質問またはプランを待っている状態ではない
- エージェントのステータスが `running` ではない

**対処法:**
- `/status` エンドポイントでエージェントの状態を確認
- SSE イベントで質問やプランが届いていることを確認
- エージェントが応答を待っている状態で `/action` を呼び出す

#### 500 Internal Server Error - サーバーエラー

```json
{
  "type": "about:blank",
  "title": "Internal server error",
  "status": 500,
  "detail": "Error message..."
}
```

**原因:**
- エージェントが初期化されていない
- 内部処理でエラーが発生

**対処法:**
- サーバーログを確認
- エージェントが正しく初期化されているか確認
- 必要に応じてサーバーを再起動

## ベストプラクティス

### 1. GET /action で保留中のアクションを確認する

SSE イベントに頼るだけでなく、定期的に `GET /action` を呼び出して保留中のアクションを確認することを推奨します。これにより、ネットワークの問題などでSSEイベントを見逃した場合でも、確実にアクションを取得できます。

```typescript
// 定期的にポーリング
const interval = setInterval(async () => {
  const response = await fetch('http://localhost:9000/action');
  const data = await response.json();

  for (const action of data.pending_actions) {
    if (action.type === 'answer_question') {
      // 質問への回答UIを表示
    } else if (action.type === 'approve_plan') {
      // プラン承認UIを表示
    }
  }
}, 2000); // 2秒ごと
```

### 2. SSE イベントと連携する

`GET /action` と SSE イベントを組み合わせることで、リアルタイム性と確実性の両方を実現できます。

```typescript
const eventSource = new EventSource('http://localhost:9000/events');

eventSource.addEventListener('message_update', (event) => {
  const message = JSON.parse(event.data);

  // メッセージを受信したら、保留中のアクションを確認
  if (message.type === 'question' || message.type === 'plan') {
    fetchPendingActions();
  }
});
```

### 2. エージェントステータスを確認する

アクションを送信する前に、エージェントのステータスを確認することを推奨します。

```typescript
const status = await fetch('http://localhost:9000/status').then(r => r.json());

if (status.status === 'running') {
  // アクションを送信
}
```

### 3. エラーハンドリングを実装する

すべての `/action` 呼び出しでエラーハンドリングを実装してください。

```typescript
try {
  await fetch('http://localhost:9000/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  }).then(response => {
    if (!response.ok) {
      return response.json().then(error => {
        throw new Error(error.detail);
      });
    }
    return response.json();
  });
} catch (error) {
  console.error('Action failed:', error);
  // ユーザーにエラーを通知
}
```

### 4. タイムアウトを設定する

長時間応答がない場合に備えて、タイムアウトを設定することを推奨します。

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒

try {
  await fetch('http://localhost:9000/action', {
    method: 'POST',
    signal: controller.signal,
    // ...
  });
} finally {
  clearTimeout(timeoutId);
}
```

### 5. 状態管理を適切に行う

質問やプランの状態を適切に管理し、重複したアクション送信を防ぎます。

```typescript
const [pendingQuestion, setPendingQuestion] = useState<Message | null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);

const answerQuestion = async (answers: Record<string, string>) => {
  if (!pendingQuestion || isSubmitting) return;

  setIsSubmitting(true);
  try {
    await sendAction({ type: 'answer_question', answers });
    setPendingQuestion(null);
  } catch (error) {
    console.error('Failed to answer question:', error);
  } finally {
    setIsSubmitting(false);
  }
};
```

## トラブルシューティング

### 質問に回答できない

**症状:** 質問に回答しようとすると 409 エラーが返される

**原因と対処:**
1. エージェントのステータスが `stable` になっている
   - `/status` で確認し、`running` になるまで待つ
2. 質問が既に別のクライアントによって回答された
   - SSE イベントで最新の状態を確認
3. 質問のタイムアウトが発生した
   - 新しい質問を待つ

### プランを承認できない

**症状:** プランを承認しようとすると 409 エラーが返される

**原因と対処:**
1. エージェントのステータスが `stable` になっている
   - `/status` で確認し、`running` になるまで待つ
2. プランが既に承認/却下された
   - SSE イベントで最新の状態を確認
3. プランのタイムアウトが発生した
   - 新しいプランを待つ

### エージェントが停止しない

**症状:** `stop_agent` を送信してもエージェントが停止しない

**原因と対処:**
1. エージェントが初期化されていない
   - サーバーログを確認
2. ネットワークエラー
   - リクエストが正しく送信されているか確認
3. サーバー側のエラー
   - サーバーログでエラーを確認

## 関連リソース

- [OpenAPI 仕様書](../spec/openapi.json) - `/action` エンドポイントの詳細な API 仕様
- [README.md](../README.md) - プロジェクト全体のドキュメント
- [coder/agentapi](https://github.com/coder/agentapi) - 互換性のある API 仕様
