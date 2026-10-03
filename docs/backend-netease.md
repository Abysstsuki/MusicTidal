# 内嵌网易云 API

调用链为 `MusicTidal backend → backend/vendor/netease 内部模块 → 网易云服务器`。后端运行无需启动 `NeteaseCloudMusicApi-master` 服务，也不再读取 `NETEASE_CLOUD_API_URL`。

## 接口与业务

保留现有 `neteaseHttp.get()` 的调用和 `{ data }` 返回形状，支持搜索、播放地址、歌词、账号校验，以及心动模式需要的用户歌单、红心歌曲列表、智能播放接口。内嵌子集保留日推和私人 FM 模块，但共享推荐队列只使用心动模式。内部还包含游客登录模块，用于缺少凭据时获取匿名令牌。

第三方源码位于 `backend/vendor/netease/`，音乐模块来自本地 API 仓库 4.11.1；二维码登录模块适配 Enhanced 分支的 type 3 协议，附带 MIT 许可证。这里只内嵌所需模块、请求和加密代码，不包含上游 HTTP 服务、依赖目录或任何已有凭据。请求使用 axios，二维码图片由 qrcode 在后端生成。

## 授权配置

| 配置 | 用途与优先级 |
|---|---|
| `NETEASE_COOKIE_ENCRYPTION_KEY` | 必需的 64 位十六进制密钥，用于 AES-256-GCM 保存个人 Cookie，跨部署保持稳定 |
| `NETEASE_ANONYMOUS_TOKEN` | 缺少用户或游客 Cookie 时使用；未配置时读取 `backend/anonymous_token` |
| `NETEASE_REAL_IP` | 覆盖项目原有的国内 IP 默认值 |

房间显式使用房主绑定的 Cookie；未绑定或明确失效时使用游客授权，旧 `NETEASE_COOKIE` 和 `backend/cookie.txt` 不再参与房间请求。个人 Cookie 只在服务端解密，不会返回浏览器或写入日志。游客令牌文件路径固定相对于 backend，开发和 `dist` 运行均适用；未配置令牌时，首次请求获取游客令牌并缓存在进程内存。心动模式需要有效的网易云登录和非空红心歌单；MusicTidal 登录不会替代网易云绑定。

部署还需沿用 `DATABASE_URL`、`JWT_SECRET` 等 MusicTidal 配置，先执行可空字段迁移再发布前后端。二维码申请、检查及解除绑定接口需要 MusicTidal 登录；授权流程和迁移步骤见 [多房间说明](rooms.md)。更换加密密钥会使已有绑定无法解密，需要重新扫码。

## 请求策略

- 每次网易云请求设定 15 秒超时，复用 HTTP/HTTPS 连接；首次游客请求可能额外进行一次游客登录。
- 搜索和歌词成功响应缓存 2 分钟，最多保存 100 项；相同请求并发时合并，缓存按凭据和 IP 隔离。附带 `timestamp` 可跳过缓存。
- 播放地址、账号校验、用户歌单、红心列表和心动推荐均通过内嵌模块直接请求。心动模式在每次开启时建立独立会话，读取当前账号的红心歌单；红心来源在新推荐批次请求前每 5 分钟刷新一次，返回的动态列表按顺序分批消费。
- 错误只传递收敛后的消息和数字状态码，不传递 Axios 配置、上游 Cookie 或响应正文。

## 本地启动与构建

在 `backend` 目录配置加密密钥、执行迁移后运行 `npm run dev`，再启动前端。进入大厅登录并创建房间，房主可在账号绑定入口扫码。

生产构建：

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

构建将 TypeScript 输出到 `dist/`，并复制已生成的 Prisma 客户端及运行时资源。部署应保留 `backend/vendor/netease/`、`dist/` 和 package/lock 文件；网易云模块通过静态引用加载，无需携带原来的独立 API 仓库。Prisma 客户端应在目标部署环境生成。

Express/WebSocket 仍使用一个常驻进程；房间、队列和计时器保存在内存，个人绑定保存在 PostgreSQL。后端重启会结束所有房间；第一版不支持 serverless 或多实例共享房间。
