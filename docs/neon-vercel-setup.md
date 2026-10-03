# MusicTidal：Cloudflare 前端、Neon 数据库与 Vercel 后端接入

更新日期：2026-10-03。适用于当前 Express 5、Prisma 6.11、Next.js 15 项目。

当前已经在前后端 `.env.production` 末尾追加 `NEON_SETUP_NOTES` 注释和占位示例。原有有效配置保留；尚未替换真实连接串、修改 Prisma schema、执行数据库迁移或改造 WebSocket。按下文逐步完成实际接入。

## 1. 配置分别放在哪里

前端继续使用已经部署的 Cloudflare 项目；Vercel 只部署后端，Root Directory 为 `backend`，Neon 也只连接这个后端项目。本机 `.env.production`、Cloudflare 构建变量与 Vercel 后台环境变量是分别维护的配置；修改本机文件不会自动修改云端设置。

当前 `frontend/next.config.ts` 使用 `output: 'export'`，前端生成静态页面，浏览器通过 HTTPS 调用后端 API，通过 WSS 连接后端 WebSocket。Cloudflare 托管前端不会改变 Vercel 后端的运行方式。

| 变量 | Vercel 后端项目 | Cloudflare 前端项目 | 用途 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 必需 | 不配置 | Neon pooled 连接串，应用查询使用 |
| `DATABASE_URL_UNPOOLED` | 启用 `directUrl` 后必需 | 不配置 | 同一项目、分支和数据库的 direct 连接串，迁移使用 |
| `JWT_SECRET` | 必需 | 不配置 | 保留现有登录签名密钥 |
| `NETEASE_COOKIE` | 按账号功能需要配置 | 不配置 | 当前房间共用的网易云账号凭据 |
| `NETEASE_ANONYMOUS_TOKEN` / `NETEASE_REAL_IP` | 可选 | 不配置 | 保留当前网易云适配器的配置方式 |
| `NEXT_PUBLIC_BACKEND_URL` | 不配置 | 必需 | 后端 HTTP origin，不带 `/api` |
| `NEXT_PUBLIC_WS_URL` | 不配置 | 必需 | 实际 WebSocket 的完整 `wss://` URL，包括部署入口路径 |

当前 `JWT_EXPIRES_IN` 没有被登录服务读取，登录 JWT 有效期写死为 `3d`。`NETEASE_CLOUD_API_URL` 也不再被当前内嵌网易云模块使用。此步骤无需删除这些旧配置，但仅改它们不会改变运行行为。

前端不创建 `NEXT_PUBLIC_DATABASE_URL`，也不保存网易云 Cookie。`NEXT_PUBLIC_` 配置会进入浏览器构建产物。

## 2. 在 Vercel Marketplace 创建 Neon

1. 打开 [Neon Marketplace 页面](https://vercel.com/marketplace/neon)，点击 **Install**。
2. 没有 Neon 账号时按向导创建；已有账号时按向导选择适合的连接方式。
3. 选择 **Free** 套餐，给数据库命名，例如 `musictidal-production`。
4. 选择与后端 Vercel Function 相同或接近的区域；以两边实际可选区域为准。
5. 创建后进入 **Storage → 数据库 → Connect Project**，连接 Root Directory 为 `backend` 的项目。
6. 先选择 **Production**。Development、Preview 使用测试数据库或独立分支，不让测试注册、迁移直接写生产数据。
7. 使用默认变量名称，不添加自定义前缀；当前代码读取的名称是 `DATABASE_URL`。
8. 在后端项目 **Settings → Environment Variables** 确认注入了 `DATABASE_URL` 和 `DATABASE_URL_UNPOOLED`。如果缺少直连变量，在 Neon Connect 界面复制 direct URL 并补充。

Neon Vercel 集成会注入数据库连接变量；可以在 Storage 中通过 **Open in Neon** 管理数据库。参考 [Neon 原生集成指南](https://neon.com/docs/guides/vercel-native-integration)。

## 3. 更新本机后端配置

在 `backend/.env.production` 上方原有的 `DATABASE_URL` 行替换为 Neon 的 **pooled** 地址；不要把注释中的例子直接当真实凭据，也不要保留两条有效的同名变量。

接着添加一条有效的 `DATABASE_URL_UNPOOLED`，值为同一数据库的 **direct** 地址。注释示例中的 `#` 表示它不会生效。

```dotenv
# 仅为占位示例：从 Neon Connect 复制真实的完整连接串。
DATABASE_URL="postgresql://NEON_USER:NEON_PASSWORD@ep-example-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://NEON_USER:NEON_PASSWORD@ep-example-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

pooled 主机通常含 `-pooler`，direct 主机不含；两个地址必须指向同一项目、分支和数据库。复制 Neon 给出的完整 URL，保留它自带的 TLS 等查询参数。

保留已有 `JWT_SECRET`。更换签名密钥会使原来的登录 Token 失效。数据库迁移保留原用户 ID 和密码哈希后，可以继续使用原账号。

## 4. 给 Prisma 6 添加迁移直连配置

编辑 `backend/prisma/schema.prisma`，把 `datasource db` 改成：

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
```

保留现有 `generator`、`User` 模型和迁移文件。当前项目使用 Prisma 6，此接入无需升级 Prisma 或改用 Prisma 7 的配置文件，也无需引入 Neon 专用驱动适配器。

添加 `directUrl` 后，所有运行 Prisma CLI 的环境都需要 `DATABASE_URL_UNPOOLED`。本机开发的 `backend/.env` 若继续使用原 PostgreSQL，也补充其直连地址；普通无连接池数据库可以让两个变量使用相同地址。Vercel 后端项目和需要构建的 Preview 环境也必须提供该变量。

参考 [Neon 的 Prisma 指南](https://neon.com/docs/guides/prisma)中 “Using Prisma 6 or earlier”。

## 5. 显式读取 `.env.production` 并初始化新数据库

Prisma CLI 通常读取 `backend/.env`，不会因为文件名是 `.env.production` 就自动切到生产配置。项目中的 `server.ts` 自己加载生产文件，也不会改变 Prisma CLI 的加载规则。

先完成第 3、4 步，确认两个地址属于新建的 Neon 数据库。然后在 PowerShell 7 中运行：

```powershell
Set-Location 'F:\开发项目\MusicTidal\backend'

# 本项目已经安装 dotenv；让每个 Prisma 进程先加载生产配置。
# 使用 try/finally，运行后恢复当前终端原有的 dotenv 加载设置。
$taskPreviousDotenvPath = $env:DOTENV_CONFIG_PATH
$taskPreviousDotenvOverride = $env:DOTENV_CONFIG_OVERRIDE
try {
    $env:DOTENV_CONFIG_PATH = '.env.production'
    $env:DOTENV_CONFIG_OVERRIDE = 'true'

    node -r dotenv/config ./node_modules/prisma/build/index.js validate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma 配置校验失败，请先检查连接变量和 schema。' }

    node -r dotenv/config ./node_modules/prisma/build/index.js migrate deploy
    if ($LASTEXITCODE -ne 0) { throw '数据库迁移失败，请根据 Prisma 错误继续处理。' }

    node -r dotenv/config ./node_modules/prisma/build/index.js generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma 客户端生成失败。' }
}
finally {
    $env:DOTENV_CONFIG_PATH = $taskPreviousDotenvPath
    $env:DOTENV_CONFIG_OVERRIDE = $taskPreviousDotenvOverride
}

npm run build
```

这段命令会应用仓库中已有的两条迁移，建立 `User` 表并生成客户端。`migrate deploy` 负责表结构，不会复制原数据库的用户记录。到 Neon Tables/SQL Editor 确认存在 `User` 表及 `id`、`username`、`email`、`password`、`neteaseInfo`、`createdAt` 列。

若希望本机按生产配置启动后端，保持工作目录在 `backend`，然后运行：

```powershell
$taskPreviousNodeEnv = $env:NODE_ENV
try {
    $env:NODE_ENV = 'production'
    npm start
}
finally {
    $env:NODE_ENV = $taskPreviousNodeEnv
}
```

当前 `server.ts` 在 `NODE_ENV=production` 时会加载 `.env.production`，并覆盖同名 `.env` 或进程变量。仅执行 `npm start` 不会自动设置 `NODE_ENV=production`。

## 6. 原数据库已有用户时如何处理

如果不需要原账号，可以使用第 5 步新建的空用户表，重新注册。

如果需要保留原账号，先导出原 PostgreSQL，再导入 Neon，并保留用户 ID、bcrypt 密码哈希和迁移记录。推荐对这个当前只有用户表的项目使用 PostgreSQL 的 `pg_dump` / `pg_restore` 进行完整数据库迁移。

完整备份恢复到空 Neon 数据库和第 5 步“先建立表”是两条路径；不要在已经建立了重复表结构后直接重复恢复完整备份。先确定需要空库重新注册还是完整保留原库，再执行对应操作。导入完成后用 `prisma migrate deploy` 应用尚未执行的迁移。

可以参考 [Neon 的迁移指南](https://neon.com/docs/import/migrate-from-postgres)。此文不执行导出或导入，也不将密码、连接串写入命令历史。

## 7. 配置后端 Vercel 项目

1. Root Directory 设置为 `backend`，按 Vercel 的 Express 支持配置 Node.js 后端。
2. 确认 Neon 已连接这个项目的 Production 环境。
3. 在 **Settings → Environment Variables** 配置 `JWT_SECRET`，按实际使用补充 `NETEASE_COOKIE` 等后端变量。
4. 建议覆盖 Build Command 为：

   ```text
   npx prisma generate && npm run build
   ```

   当前 `npm run build` 只运行 TypeScript 和复制生成客户端，所以前面必须先生成 Prisma Client。上述是 Vercel 云端构建命令，不是要求在本机使用 Bash。

5. 初始化迁移已按第 5 步完成时，可以先不把迁移加入每次构建。后续模型变更再使用 `npx prisma migrate deploy`；不要在生产使用 `migrate dev` 或 `migrate reset`。
6. Output Directory 不填写为静态 `dist` 站点。Express 部署是后端 Function，`dist` 是当前 Node 编译产物。
7. 为 HTTP API 选择明确的 Express 入口；WebSocket 入口要求见第 10 节。数据库接通不代表当前 `server.ts` 的全部内存行为已适合云端。
8. 环境变量更新后触发一次新的 Production 部署。

Vercel 会在构建和函数执行时提供后台变量。`.env.production` 在本项目被 Git 忽略，不会跟随 Git 推送成为云端配置；不要为了部署把含凭据的文件强行提交。尤其不要把当前会 `override: true` 的本机生产文件打包进部署，用它覆盖 Marketplace 注入的变量。

参考 [Prisma 6 的 Vercel 部署指南](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/serverless/deploy-to-vercel)、[Vercel Express 文档](https://vercel.com/docs/frameworks/backend/express)。

## 8. 配置前端 `.env.production` 与现有 Cloudflare 项目

前端只改两个地址；改原有有效行，不额外加入重复行：

```dotenv
NEXT_PUBLIC_BACKEND_URL="https://music-backend.example.com"
NEXT_PUBLIC_WS_URL="wss://music-backend.example.com/api/ws"
```

这里的域名均为示例。`/api/ws` 也是将来独立 WebSocket Function 入口的路径示例，当前仓库没有这个入口；必须按最终部署的路由或 rewrite 填写。

`NEXT_PUBLIC_BACKEND_URL` 不带 `/api`，因为 `apiRequest` 调用时已经传入 `/api/auth/login`、`/api/queue/list` 等路径。后端入口应保留这些实际 URL。

按照现有 Cloudflare 项目的部署方式配置这两个变量：

- **Pages 使用 Git 构建**：进入 Cloudflare **Workers & Pages → 现有 Pages 项目 → Settings → Environment variables**，在 Production 环境添加或更新这两个变量，然后触发新的构建和部署。
- **Workers Builds 使用 Git 构建**：进入现有 Worker 的 **Settings → Build → Build variables and secrets**，添加或更新这两个构建变量，然后重新构建部署。只更新运行时的 Variables & Secrets 不会改写已经构建好的前端 JavaScript。
- **本机构建后上传静态文件**：先让本机构建使用正确变量，重新执行 `npm run build`，再按原来的上传方式发布 `frontend/out`；后台改值不会修改已经上传的静态页面。

保留目前可用的 Cloudflare 构建和发布设置。前端项目不连接 Neon 资源，也不需要新增 Vercel 前端项目。

后端当前 `app.use(cors())` 允许跨域，现有登录请求使用 Bearer Token，因此 Cloudflare 与后端使用不同域名可以沿用当前请求方式。若后续改为 HttpOnly Cookie 登录，需要另外配置凭据跨域请求和 Cookie 属性；本次不改登录机制。WebSocket 握手不受 Express CORS 中间件管理，若增加 Origin 校验，应允许实际 Cloudflare 前端域名。

本机 Next.js 的同名变量加载优先级为：

```text
process.env
→ .env.production.local
→ .env.local
→ .env.production
→ .env
```

本项目目前有 `frontend/.env.local`。因此本机运行 `npm run build` 时，只改 `.env.production` 可能仍然使用 `.env.local` 中的旧地址。需要明确本次构建使用哪些地址：可以调整对应的本机覆盖文件，或在构建进程中显式提供变量。`NEXT_PUBLIC_` 变量在构建时固化，部署后仅修改运行变量不会更新浏览器里的地址。

参考 [Cloudflare Pages 构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)和 [Next.js 15 环境变量文档](https://nextjs.org/docs/15/app/guides/environment-variables)。

## 9. 后续配置变更规则

| 要改的配置 | 需要做什么 |
| --- | --- |
| Neon 项目、分支或数据库 | 更新两个数据库 URL，确认结构、数据已准备，再重新部署后端 |
| Neon 角色密码 | 更新匹配的 pooled/direct 凭据，并重新部署后端；浏览器无需得到这些地址 |
| `JWT_SECRET` | 更新后端并重新部署；已有登录 Token 会失效 |
| 网易云 Cookie | 更新后端 `NETEASE_COOKIE` 并重新部署；当前尚无房主个人绑定接口 |
| 后端 HTTP 域名或 WebSocket 路径 | 更新 Cloudflare 构建环境或本机构建中的前端公开变量，重新构建并发布前端 |
| Prisma 模型 | 创建并审查迁移文件，向目标数据库执行 `migrate deploy`，重新生成客户端并构建 |

Vercel 环境变量的变更只作用于新的部署，旧部署不会自动更新。Development、Preview、Production 分别检查环境作用域。参考 [Vercel 环境变量文档](https://vercel.com/docs/environment-variables)。

Cloudflare 上的前端地址变量要在构建时生效，变更后重新构建和发布。浏览器仍请求旧后端时，先检查发布的构建是否使用了新地址，而不是再次修改数据库连接串。

## 10. 现有 WebSocket 接入 Vercel 的要求

Vercel 当前在所有套餐提供 WebSocket Beta，需要开启 Fluid compute。Express + `ws` 可以继续使用。官方示例的部署模块导出包含 WebSocket 的 `http.Server`，而不是仅导出 Express `app`。参考 [Vercel WebSocket 文档](https://vercel.com/docs/functions/websockets)。

部署入口的形式如下。这只是说明所需结构，本次没有新增或部署该入口：

```typescript
import { createServer } from 'node:http';
import app from '../src/app';
import { setupWebSocketServer } from '../src/services/websocketServer';

const server = createServer(app);
setupWebSocketServer(server);

export default server;
```

如果使用 `backend/api/ws.ts` 一类独立 Function 文件，就按最终路由确认 WebSocket URL；如果使用全应用入口，则按其路由/rewrite 确认地址。不要只修改 `NEXT_PUBLIC_WS_URL` 而没有部署对应入口。Vercel 当前 Express 支持 port listener，并不是必须删除本地 `server.ts`；为本地启动与云端导出明确入口，可以避免初始化职责混在一起。

当前按用户要求采用简单部署方案，不在此引入 Redis 或跨实例广播。接入时先处理以下入口与运行行为：

| 当前代码 | Vercel 下需要的处理 |
| --- | --- |
| `MusicContext.tsx` 已有指数退避重连、重连后刷新队列和播放快照 | 保留并适配部署路径；不要把每次断线视为房间结束 |
| 队列、聊天历史、在线用户放内存 | 仅在当前进程存活期间保留；接入 Neon 的用户表不会保存这些状态 |
| 使用 `setTimeout` 自动切歌 | 固定常驻 Node 进程可沿用；Vercel Function 结束或回收后不能依赖原计时器继续推进 |
| 目前 `join` / `chat` 直接接受客户端用户名 | 需要把连接与认证身份绑定；改造不会新增敏感词或 ID 拦截 |
| HTTP CORS 与 WebSocket 握手是两套入口 | WebSocket 单独检查允许的 Origin；浏览器使用 HTTPS/WSS |

Hobby 的函数最长运行时间是 300 秒，WebSocket 达到函数上限会断开；新的连接或重连不保证落到同一个实例。只部署一个 Vercel 项目或入口，也不等于获得一个固定常驻进程；前端放 Cloudflare 不改变这个限制。参考 [Vercel 函数时长限制](https://vercel.com/docs/functions/limitations#max-duration)和上述 WebSocket 文档。

如果“一个固定常驻进程、保留现有内存队列和计时器”是部署要求，后端应选择支持常驻 Node 服务的平台，前端继续放 Cloudflare，数据库继续用 Neon。若仍选择 Vercel，则需要接受上述生命周期限制，实际 WebSocket 入口仍待改造。

## 11. 本次完成范围

- 已给两个 `.env.production` 添加示例说明，保留原有内容和有效赋值。
- 已提供创建 Neon、配置 Prisma 6、显式加载生产变量、迁移和构建的完整步骤。
- 已按现有 Cloudflare 前端部署补充公开地址变量的配置和重新发布步骤。
- 尚未替换真实数据库地址、连接云端数据库或执行迁移。
- 尚未新增云端 WebSocket 入口、共享房间状态或跨实例广播。

旧的 `docs/vercel-migration.md` 是历史方案，其中 Pusher、旧 Vercel KV/Postgres 产品名称不能直接当作当前平台要求；当前接入以本文和官方文档为准。
