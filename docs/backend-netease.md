# 内嵌网易云 API

调用链为 `MusicTidal backend → backend/vendor/netease 内部模块 → 网易云服务器`。后端运行无需启动 `NeteaseCloudMusicApi-master` 服务，也不再读取 `NETEASE_CLOUD_API_URL`。

## 接口与业务

保留现有 `neteaseHttp.get()` 的调用和 `{ data }` 返回形状，支持搜索、播放地址、歌词、账号校验，以及心动模式需要的用户歌单、红心歌曲列表、智能播放接口。内嵌子集保留日推和私人 FM 模块，但共享推荐队列只使用心动模式。内部还包含游客登录模块，用于缺少凭据时获取匿名令牌。

第三方源码位于 `backend/vendor/netease/`，来自本地 API 仓库 4.11.1，附带 MIT 许可证。这里只内嵌所需模块、请求和加密代码，不包含上游 HTTP 服务、依赖目录或任何已有凭据。运行时依赖仅使用 backend 已有的 axios。

## 授权配置

| 配置 | 用途与优先级 |
|---|---|
| `NETEASE_COOKIE` | 优先使用环境变量；未配置或为空时读取 `backend/cookie.txt` |
| `NETEASE_ANONYMOUS_TOKEN` | 缺少用户或游客 Cookie 时使用；未配置时读取 `backend/anonymous_token` |
| `NETEASE_REAL_IP` | 覆盖项目原有的国内 IP 默认值 |

凭据在调用时读取，确保 `.env` 已加载；文件路径固定相对于 backend，开发和 `dist` 运行均适用。不会修改 Cookie 文件，也不会打印凭据或上游请求配置。没有用户/游客 Cookie 和匿名令牌时，首次请求获取游客令牌并保存在当前进程内存，重启后重新获取。心动模式需要有效的网易云用户登录和非空红心歌单，游客会收到明确提示。MusicTidal 自身的登录不会替代网易云登录。

`.env.example` 只包含空占位项。部署时还需沿用 `DATABASE_URL`、`JWT_SECRET` 等 MusicTidal 配置。此改动不新增个人网易云账号绑定，房间继续共用后端配置的账号。

## 请求策略

- 每次网易云请求设定 15 秒超时，复用 HTTP/HTTPS 连接；首次游客请求可能额外进行一次游客登录。
- 搜索和歌词成功响应缓存 2 分钟，最多保存 100 项；相同请求并发时合并，缓存按凭据和 IP 隔离。附带 `timestamp` 可跳过缓存。
- 播放地址、账号校验、用户歌单、红心列表和心动推荐均通过内嵌模块直接请求。心动模式在每次开启时建立独立会话，读取当前账号的红心歌单；红心来源在新推荐批次请求前每 5 分钟刷新一次，返回的动态列表按顺序分批消费。
- 错误只传递收敛后的消息和数字状态码，不传递 Axios 配置、上游 Cookie 或响应正文。

## 本地启动与构建

在 `backend` 目录运行 `npm run dev`，再按原有方式启动前端。当前 Cookie 文件可继续使用，无需迁移或替换。

生产构建：

```powershell
npm ci
npx prisma generate
npm run build
npm start
```

构建将 TypeScript 输出到 `dist/`，并复制已生成的 Prisma 客户端及运行时资源。部署应保留 `backend/vendor/netease/`、`dist/` 和 package/lock 文件；网易云模块通过静态引用加载，无需携带原来的独立 API 仓库。Prisma 客户端应在目标部署环境生成。

本次只整合网易云调用。Express/WebSocket 仍是常驻进程，播放队列仍保存在内存；Vercel serverless、多实例状态共享及数据库迁移需要另外处理。
