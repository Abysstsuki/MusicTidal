# MusicTidal Vercel 迁移方案

## 1. 当前架构

```
┌──────────────┐     HTTP REST API       ┌─────────────────────┐
│  浏览器前端    │ ◄──────────────────────► │  长驻进程服务器        │
│  (Next.js)   │                         │  Express + ws       │
│              │     WebSocket 长连接      │  (Node.js)          │
│              │ ◄══════════════════════► │                     │
└──────────────┘                         └──────────┬──────────┘
                                                    │
                                           ┌────────▼──────────┐
                                           │  本地 PostgreSQL   │
                                           │  (仅用户表)        │
                                           └───────────────────┘

内存状态（进程重启全部丢失）：
  - 歌曲队列: Array<SongWithInstance>
  - 聊天记录: Array<Message> (最近 25 条)
  - 在线用户: Set<string>
  - 当前歌曲: { song, startTime }
  - 切歌定时器: setTimeout
```

## 2. 目标架构

```
┌──────────────┐     HTTP REST API      ┌─────────────────────────┐
│  Cloudflare  │ ◄─────────────────────► │  Vercel Serverless       │
│  Pages       │                        │  Functions               │
│  (前端静态)   │                        │  (Express → api/*.ts)    │
└──────────────┘                        └──┬────────┬──────┬───────┘
                                           │        │      │
                              ┌────────────▼──┐ ┌──▼──────▼──┐
     Pusher Channels         │  Vercel KV     │ │  Vercel    │
     (实时事件推送)            │  (Upstash Redis)│ │  Postgres  │
                              │  队列/聊天/状态 │ │  (用户表)  │
                              └───────────────┘ └────────────┘
```

## 3. 外部服务

| 服务 | 用途 | 配置方式 |
|---|---|---|
| **Pusher Channels** | 替代 WebSocket，实时推送 PLAY_SONG / QUEUE_UPDATED / chat / 在线用户变化 | 注册 https://pusher.com → 创建 App → 获取 app_id, key, secret, cluster |
| **Vercel KV** | 替代所有内存状态：歌曲队列、聊天记录、当前播放信息。基于 Upstash Redis | Vercel 后台 → Storage → KV → Create |
| **Vercel Postgres** | 替代本地 PostgreSQL，存储用户表 | Vercel 后台 → Storage → Postgres → Create |

### Pusher Channels 设计

```
Channels:
  presence-room              — 在线用户（Pusher Presence 自动管理）
    events: join, leave

  private-music              — 音乐同步事件
    events: PLAY_SONG, QUEUE_UPDATED

  private-chat               — 聊天消息
    events: chat
```

### Vercel KV 数据结构

```
Key                        Value                         说明
─────────────────────────────────────────────────────────────────
queue                      JSON Array<SongWithInstance>  歌曲队列
chat:history               JSON Array<{user,text}>       最近 50 条聊天
current:playing             JSON {song, url, startTime}   当前播放信息（含 URL，避免每次查 Netease）
current:instanceId          number                        自增计数器
```

## 4. 后端改动详情

### 4.1 删除文件

```
backend/src/server.ts            ← 不再需要 listen
backend/src/services/websocketServer.ts  ← 替换为 Pusher
```

### 4.2 新增文件

```
backend/api/                      ← Vercel Serverless 路由目录（文件路由）
backend/src/lib/kv.ts             ← Vercel KV 封装（get/set/del）
backend/src/lib/pusher.ts         ← Pusher SDK 单例 + 事件发送工具函数
backend/src/lib/pusher-types.ts   ← Pusher 事件类型定义
```

### 4.3 `backend/src/lib/kv.ts` — KV 封装

```ts
import { kv } from '@vercel/kv';

// 歌曲队列
export async function getQueue(): Promise<SongWithInstance[]> {
  return (await kv.get('queue')) || [];
}
export async function saveQueue(queue: SongWithInstance[]): Promise<void> {
  await kv.set('queue', JSON.stringify(queue));
}

// 当前播放信息
export async function getCurrentPlaying(): Promise<CurrentPlaying | null> {
  return await kv.get('current:playing');
}
export async function setCurrentPlaying(data: CurrentPlaying): Promise<void> {
  await kv.set('current:playing', JSON.stringify(data));
}

// 聊天历史
export async function getChatHistory(): Promise<ChatMessage[]> {
  return (await kv.get('chat:history')) || [];
}
export async function addChatMessage(msg: ChatMessage): Promise<ChatMessage[]> {
  const history = await getChatHistory();
  history.push(msg);
  if (history.length > 50) history.shift();
  await kv.set('chat:history', JSON.stringify(history));
  return history;
}

// 自增 instanceId
export async function nextInstanceId(): Promise<number> {
  return await kv.incr('current:instanceId');
}
```

### 4.4 `backend/src/lib/pusher.ts` — Pusher 封装

```ts
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// 广播到所有客户端
export async function broadcastMusic(event: string, data: unknown) {
  await pusher.trigger('private-music', event, data);
}

export async function broadcastChat(data: { username: string; text: string }) {
  await pusher.trigger('private-chat', 'chat', data);
}
```

### 4.5 `backend/api/` 路由目录 — 替换 Express 路由

Vercel 的文件路由约定：文件名即路径。每个文件 export 对应 HTTP method 的函数。

```
backend/api/
├── auth/
│   ├── login.ts          POST /api/auth/login
│   └── register.ts       POST /api/auth/register
├── user/
│   └── me.ts             GET  /api/user/me
├── netease/
│   ├── search.ts         GET  /api/netease/song/search
│   └── lyric.ts          GET  /api/netease/lyric
├── queue/
│   ├── add.ts            POST /api/queue/add
│   ├── list.ts           GET  /api/queue/list
│   ├── remove.ts         POST /api/queue/remove
│   ├── moveTop.ts        POST /api/queue/moveTop
│   ├── current.ts        GET  /api/queue/currentPlaying
│   ├── advance.ts        POST /api/queue/advance     ← 新增：切歌
│   └── skip.ts           POST /api/queue/skipNext     ← 替代 skipNext
└── chat/
    └── history.ts        GET  /api/chat/history       ← 新增：获取聊天历史
```

每个路由文件结构示例（`queue/add.ts`）：

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getQueue, saveQueue, nextInstanceId, getCurrentPlaying, setCurrentPlaying } from '../../src/lib/kv';
import { broadcastMusic } from '../../src/lib/pusher';
import { getSongPlayInfo } from '../../src/services/netease/song.service';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { song } = req.body;
  const instanceId = await nextInstanceId();
  const songWithInstance = { ...song, instanceId };

  const queue = await getQueue();
  queue.push(songWithInstance);
  await saveQueue(queue);

  await broadcastMusic('QUEUE_UPDATED', queue);

  // 如果没有正在播放的歌曲，立即开始播放
  const current = await getCurrentPlaying();
  if (!current) {
    await startNextSong();
  }

  return res.status(200).json({ success: true, song: songWithInstance });
}
```

### 4.6 自动切歌机制 — 核心设计

这是最关键的改动。没有了 `setTimeout`，改为 **客户端触发 + 服务端幂等保护**。

```
任一客户端 <audio> 播完
      │
      ▼
fetch('POST /api/queue/advance', { body: { currentInstanceId } })
      │
      ▼
服务端用 KV 做 check-and-set：
  1. 读取 current:playing
  2. 如果 instanceId 不匹配 → 409 忽略（别的客户端已触发）
  3. 匹配 → 出队下一首，写入 KV，推送 Pusher 事件
      │
      ▼
所有客户端收到 PLAY_SONG → 同步切换
```

`queue/advance.ts` 实现要点：

```ts
// 原子检查：只有当前 instanceId 匹配且尚未切过时才执行
const current = await getCurrentPlaying();
if (!current || current.song.instanceId !== req.body.currentInstanceId) {
  return res.status(409).json({ skipped: true, reason: 'already advanced' });
}
// 清理当前，出队下一首
await setCurrentPlaying(null);
const queue = await getQueue();
const next = queue.shift();
await saveQueue(queue);

if (next) {
  const playInfo = await getSongPlayInfo(next.id.toString());
  const playing = { song: next, url: playInfo.url, startTime: Date.now() };
  await setCurrentPlaying(playing);
  await broadcastMusic('PLAY_SONG', playing);
}
```

前端 `musicplayer.tsx` `ended` 事件改为：

```tsx
const handleEnded = async () => {
  if (!currentSong) return;
  await fetch(`${BACKEND_URL}/api/queue/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentInstanceId: currentSong.instanceId }),
  });
  // 无论 200 还是 409，Pusher 事件会推送真正的新歌曲
};
```

### 4.7 改写的现有文件

**`src/services/songQueueService.ts`** → 删除类，改为纯函数（无状态，所有状态走 KV）：
- `startNextSong()` — 出队下一首 → 调 Netease API 取 URL → 存 KV → 推 Pusher
- `enqueue()` → 读 KV 队列 → push → 写 KV → 推 Pusher
- `removeById()` / `moveToTop()` / `skipToNext()` → 同上模式

**`src/controllers/queueController.ts`** → 所有 handler 改为读写 KV，不再 import 单例。

**`src/app.ts`** → 删除或简化为中间件集合（CORS、JSON 解析），由 `vercel.json` 或各路由文件自行处理。

### 4.8 `vercel.json`

```json
{
  "functions": {
    "api/**/*.ts": {
      "memory": 512,
      "maxDuration": 10
    }
  },
  "env": {
    "PUSHER_APP_ID": "@pusher-app-id",
    "PUSHER_KEY": "@pusher-key",
    "PUSHER_SECRET": "@pusher-secret",
    "PUSHER_CLUSTER": "@pusher-cluster"
  }
}
```

## 5. 前端改动详情

### 5.1 新增依赖

```bash
npm install pusher-js
```

### 5.2 新增文件

```
frontend/src/lib/pusher-client.ts   ← Pusher 客户端单例
```

### 5.3 `frontend/src/lib/pusher-client.ts`

```ts
import Pusher from 'pusher-js';

const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY!;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER!;

export const pusher = new Pusher(PUSHER_KEY, {
  cluster: PUSHER_CLUSTER,
  authEndpoint: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pusher/auth`,
});

export const musicChannel = pusher.subscribe('private-music');
export const chatChannel = pusher.subscribe('private-chat');
```

### 5.4 改写的组件

| 组件 | 改动 |
|---|---|
| `musicplayer.tsx` | 删除 `new WebSocket(...)`，改为 `musicChannel.bind('PLAY_SONG', ...)`；`ended` 处理改为调 `/api/queue/advance` |
| `musicqueue.tsx` | 删除 `new WebSocket(...)`，改为 `musicChannel.bind('QUEUE_UPDATED', ...)` |
| `chatbox.tsx` | 删除 `new WebSocket(...)`，改为 `chatChannel.bind('chat', ...)`；发送消息改为调 `/api/chat/send`（或直接 Pusher client events） |
| `onlineuser.tsx` | 删除 `new WebSocket(...)`，使用 Pusher Presence channel 的 `members` 成员列表 |

### 5.5 Pusher Presence 在线用户

```tsx
const presenceChannel = pusher.subscribe('presence-room');

presenceChannel.bind('pusher:subscription_succeeded', (members) => {
  // members.each((member) => { ... })
  // members.count
});

presenceChannel.bind('pusher:member_added', (member) => { ... });
presenceChannel.bind('pusher:member_removed', (member) => { ... });
```

### 5.6 环境变量新增

```env
# frontend/.env.local
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=ap3
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000   # vercel dev 默认端口
```

## 6. 本地开发

```bash
# 终端 1: Netease API
cd NeteaseCloudMusicApi-master
npm start                          # 端口 3457

# 终端 2: 后端 (Vercel Serverless 模拟)
cd backend
npm install @vercel/node vercel @vercel/kv pusher
vercel dev                         # 端口 3000，自动加载 .env.local

# 终端 3: 前端
cd frontend
npm run dev                        # 端口 3001（或自定义）
```

`vercel dev` 会：
- 读取 `vercel.json` 配置
- 运行 `api/` 目录下的 serverless functions
- 注入环境变量
- 连到云端 Vercel KV / Postgres / Pusher（本地无需搭建任何中间件）

唯一要求：本地有网络连接。

## 7. 部署步骤

1. 注册 Pusher → 创建 Channels App → 记录 key/secret/cluster
2. Vercel 后台创建项目，关联 backend 仓库
3. Vercel 后台 → Storage → 创建 KV 和 Postgres
4. 在 Vercel 项目设置中配置所有环境变量
5. 本地跑 `vercel dev` 测试通过
6. `git push` → Vercel 自动部署
7. 前端在 Cloudflare Pages 设置 `NEXT_PUBLIC_BACKEND_URL` 指向 Vercel 域名
8. 前端 build + deploy

## 8. 环境变量清单

### 后端 (Vercel)

| 变量 | 用途 | 来源 |
|---|---|---|
| `PUSHER_APP_ID` | Pusher App ID | Pusher 后台 |
| `PUSHER_KEY` | Pusher Key | Pusher 后台 |
| `PUSHER_SECRET` | Pusher Secret | Pusher 后台 |
| `PUSHER_CLUSTER` | Pusher Cluster (如 ap3) | Pusher 后台 |
| `KV_URL` | Vercel KV 连接串 | Vercel → Storage → KV |
| `KV_REST_API_URL` | KV REST API URL | Vercel 自动注入 |
| `KV_REST_API_TOKEN` | KV REST API Token | Vercel 自动注入 |
| `DATABASE_URL` | PostgreSQL 连接串 | Vercel → Storage → Postgres |
| `JWT_SECRET` | JWT 签名密钥 | 自定义 |
| `NETEASE_CLOUD_API_URL` | 网易云 API 地址 | 本地: localhost:3457 / 线上: 自部署 |

### 前端 (Cloudflare Pages)

| 变量 | 用途 |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | Vercel 后端 URL（如 https://xxx.vercel.app） |
| `NEXT_PUBLIC_PUSHER_KEY` | Pusher Key（与后端相同） |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Pusher Cluster |

## 9. 功能对比确认

| 功能 | 当前实现 | 迁移后 | 体验变化 |
|---|---|---|---|
| 搜索歌曲 | REST API → Netease | 不变 | 无 |
| 添加队列 | REST API → 内存 | REST API → KV | 无 |
| 队列管理(置顶/删除) | REST API → 内存 | REST API → KV | 无 |
| 同步播放 | WebSocket 推送 | Pusher 推送 | 延迟更低（全球加速） |
| 自动切歌 | setTimeout 服务器端 | 客户端 ended 触发 + 幂等 | 触发时机更准确 |
| 聊天 | WebSocket 广播 | Pusher 广播 | 延迟更低 |
| 聊天历史 | 内存 25 条，重启丢失 | KV 50 条，持久化 | ✅ 更好 |
| 在线用户 | Set<string>，断线检测差 | Pusher Presence 自动心跳 | ✅ 更好 |
| 用户认证 | JWT + PostgreSQL | 不变 | 无 |
| 后端重启 | 队列/聊天/状态全部丢失 | 全部持久化，不丢失 | ✅ 更好 |
| 歌词 | REST API → Netease | 不变 | 无 |
