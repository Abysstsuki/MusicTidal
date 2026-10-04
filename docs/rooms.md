# 多房间一起听

首页 `/` 展示公开房间摘要；登录 MusicTidal 后才能创建或加入房间。听歌页为 `/room?roomId=<id>`，兼容 Next 静态导出。预览页面与歌词调试 URL 开关已移除，听歌页面必须完成登录与入房校验。

## 使用规则

- 创建者是房主，创建时可设置密码。服务器只保存密码哈希；密码房间的邀请链接携带独立的入房密钥，登录后自动加入，无需再次输入密码。手动从大厅加入仍校验密码。
- 密码房间在大厅仅显示固定高斯模糊的随机占位封面与文案，公开房间列表的 `currentSong` 为 `null`；入房后成员可查看真实歌曲详情。
- 所有成员可以点歌、切歌、置顶、删歌和聊天。房主独占心动开关；房间使用房主个人账号的网易云授权。
- 同一 MusicTidal 用户同时加入一个房间；同房间多标签页只计一位在线成员。退出操作会移除该用户的全部房间连接。
- 点击「离开房间」需二次确认。房主主动离开、退出登录或最后一个连接断开后保留 180 秒，期间播放与聊天继续，房间内显示实时销毁倒计时；房主重新加入并连接成功后取消销毁。首次创建后没有建立连接也会超时清理。
- 主动离开会立即释放当前入房身份并关闭该用户的全部连接；房主的重入预留不授予 REST 或 WebSocket 权限。重复离开不会延长倒计时，原房间销毁不会影响该用户后来加入的新房间。
- 邀请复制内容固定为「点击加入MusicParty，<房间链接>」，复制结果以顶部居中的非阻塞提示显示。密码房间使用 `/room?roomId=<id>#inviteToken=<密钥>`，同一链接可供多人反复使用，校验成功不会消耗或更换密钥；只有房间销毁后失效。入房密钥只在成员快照和房间事件中返回，不出现在大厅摘要中。登录前保留邀请，入房成功后只清除当前浏览器地址栏里的密钥，不影响已分享的链接；无效邀请可改为手动输入密码。
- 大厅、听歌页与弹窗共用 `ToastProvider` 和 `StageToast`，通过 `useToast().showToast()` 或 `useToastMessage()` 显示消息。普通消息约 3 秒、错误约 5 秒后消失，最多叠放 3 条短消息；房主离开倒计时、连接中断与自动播放受限使用常驻提示，状态恢复或退出房间时移除。倒计时在顶部 toast 中每秒更新，不占用播放器布局，也不会被复制提示覆盖。原生弹窗打开时 toast 挂到最上层弹窗，避免被遮罩挡住。
- 操作成功与失败、登录/绑定结果、房间结束、聊天/搜索/播放/歌词错误统一用 toast；加载状态、空列表、扫码操作指引和离开确认仍在对应组件中展示。后台轮询的相同错误只在消息变化时提示，避免反复弹出。
- 普通成员断线后保留入房资格 180 秒，期间不计在线人数；超时释放成员身份。刷新时无需再次输入密码。
- 房间、聊天、队列和推荐均在一个后端进程内存中，重启清空；用户和网易云绑定保存在 PostgreSQL。不要运行多个后端副本。

## 网易云绑定

在大厅的「网易云账号」或房主工具栏中扫码绑定。Cookie 使用 AES-256-GCM 加密保存在 `User.neteaseCookieEncrypted`；只有后端解密。`neteaseProfile`、`neteaseBoundAt`、`neteaseInvalidAt` 保存公开资料与状态。

后端必须配置 `NETEASE_COOKIE_ENCRYPTION_KEY`，值是 32 字节随机密钥的 64 位十六进制编码。密钥保存在服务器环境文件或密钥管理中，不提交、不分享；重部署时保留，并与数据库备份一并妥善保管。改变密钥会导致旧 Cookie 无法解密。

本地生成并添加一个尚未配置的密钥，可在 `backend` 目录运行以下 PowerShell 命令；命令不显示密钥：

```powershell
node -e "const fs=require('fs'),c=require('crypto'),d=require('dotenv');const p='.env';const s=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';if(d.parse(s).NETEASE_COOKIE_ENCRYPTION_KEY)throw Error('Existing key preserved');fs.appendFileSync(p,'\nNETEASE_COOKIE_ENCRYPTION_KEY='+c.randomBytes(32).toString('hex')+'\n');"
```

二维码会话属于当前登录用户；关闭、刷新二维码、解除绑定或退出登录会取消旧会话。正常网络失败不删除授权，明确登录失效时标记过期并提示重新扫码。

扫码流程遵循 [Enhanced 二维码登录文档](https://docs-neteasecloudmusicapi.focalors.ltd/#/?id=_3-二维码登录)：申请 key、自行渲染二维码、带时间戳轮询，`800 / 801 / 802 / 803` 分别表示过期、等待、待确认、授权成功。请求使用新版 EAPI 协议；网易云 Cookie 只进入后端会话，不以 Set-Cookie 返回浏览器。收到 `803` 及凭据后保留确认状态，账号校验或数据库保存临时失败会使用同一凭据重试，不重新轮询已确认的二维码。

绑定失败会区分扫码轮询、账号校验和数据库保存阶段；日志仅记录阶段和安全错误码。`NETEASE_BINDING_SCHEMA_OUTDATED` 表示缺少表或字段，需要执行下方迁移与客户端生成命令；`NETEASE_BINDING_SAVE_FAILED` 表示保存暂时失败。数据库已包含四个可空绑定字段时无需重复增加字段。

房主没有绑定或绑定过期时使用游客授权。旧 `NETEASE_COOKIE` / `cookie.txt` 不再作为房间授权，也不会自动导入用户表。原凭据文件保留；需要绑定时通过页面扫码。

重新绑定或解除绑定会清空待播心动推荐并停止补歌，当前歌曲播完，手动队列保留。绑定成功后由房主手动开启心动模式。播放 URL 返回的可用时长短于歌曲时长时，服务端按可用时长切歌。

## REST 与 WebSocket

公开接口只有 `GET /api/rooms`，返回名称、房主、人数、当前歌曲摘要、密码标记和房主断线截止时间。摘要不包含队列、聊天、播放 URL 或绑定凭据。

登录接口继续使用 `/api/auth/*`，其他调用携带 `Authorization: Bearer <MusicTidal token>`。

| 接口 | 行为 |
|---|---|
| `POST /api/rooms` | `{ name, password? }` 创建并预留房主身份 |
| `POST /api/rooms/:roomId/join` | `{ password?, inviteToken? }` 校验密码或房间专属邀请凭据；仍需登录，已有成员可重入 |
| `POST /api/rooms/:roomId/leave` | 幂等离开；房主离开后启动 180 秒销毁倒计时 |
| `GET /api/rooms/:roomId/state` | 成员完整快照及 `revision` |
| `/api/rooms/:roomId/queue/*` | 原队列操作；`skipNext` 提交 `{ playbackRevision }`，并发相同版本只切一次 |
| `/api/rooms/:roomId/netease/*` | 成员的搜索、歌曲 URL、歌词 |
| `GET /api/user/active-room` | 当前用户已加入的房间摘要 |
| `GET /api/user/netease` | `unbound / bound / expired` 状态及公开资料 |
| `POST /api/user/netease/qr` | 二维码图片、`sessionId`、到期时间 |
| `POST /api/user/netease/qr/:sessionId/check` | `waiting / scanned / authorized / expired`；成功保存授权，不返回 Cookie |
| `DELETE /api/user/netease/qr/:sessionId` | 取消二维码会话 |
| `DELETE /api/user/netease` | 解除个人绑定 |
| `POST /api/user/logout` | 取消二维码并退出房间，客户端再清除本站 token |

全局 `/api/queue/*` 和 `/api/netease/*` 已退役。房间接口依次校验 JWT、成员身份和操作权限。错误返回 `{ success: false, error, code? }`；`ACTIVE_ROOM` 表示先退出原房间，`ROOM_PASSWORD` 表示密码错误，`ROOM_INVITE` 表示邀请凭据无效，`ROOM_CLOSED` 表示房间不存在，`NOT_MEMBER` 表示尚未加入。

WebSocket URL 不携带 token。建立连接后 10 秒内发送 `{ type: 'AUTH', token, roomId }`，服务器验证 JWT 和已入房资格后发送 `ROOM_SNAPSHOT`。聊天提交 `{ type: 'chat', roomId, text }`，服务器从身份记录生成用户名。未经认证的连接不会收到房间内容。

服务器事件使用 `{ type, roomId, revision, payload }`，包括 `ROOM_SNAPSHOT`、`ROOM_UPDATED`、`ROOM_CLOSED`、`PLAY_SONG`、`QUEUE_UPDATED`、`RECOMMENDATIONS_UPDATED`、`update` 和 `chat`。`ERROR` 返回安全消息；JWT 到期断开连接。心跳每 30 秒检测，连续 60 秒无回应终止连接。

## 部署与验证

先在目标环境配置加密密钥、备份数据库并执行增量迁移，再同步发布后端和前端：

```powershell
# backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start

# frontend
npm ci
npm run build
```

Docker 的 `.env.docker` 添加同一加密密钥，Compose 已通过 `env_file` 加载；现有数据库迁移命令仍适用。后端继续常驻单进程，前端使用 HTTPS 后端地址和 WSS。

本地检查使用 `npx tsc --noEmit`、`npm test`（backend）和 `npm run build`（frontend）。后端测试使用假时钟、独立授权和隔离 HTTP/WS 服务，不连接真实数据库或网易云账号。

可选浏览器联调：在 `backend` 运行 `node tests/fixtures/apiHarness.cjs`，另一个 PowerShell 窗口在 `frontend` 运行：

```powershell
$env:NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:3101'
$env:NEXT_PUBLIC_WS_URL = 'ws://127.0.0.1:3101'
npm run dev -- --port 3100
```

打开 `http://localhost:3100`，演示账号为 `demo@musictidal.test` / `DemoMusic123`，种子密码房间密码 `4321`。这些仅是测试凭据；演示服务只绑定本机，账号、二维码和歌曲来源为内存模拟，禁止在生产运行。实际扫码确认、Cookie 复用和账号歌曲权限需用真实运行环境验收。
