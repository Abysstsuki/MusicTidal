# Ubuntu 上用 Docker 部署后端和 PostgreSQL

本方案用 Docker Compose 一起运行后端和 PostgreSQL。无需在 Ubuntu 宿主机上单独安装 PostgreSQL；Compose 会在首次启动时创建数据库、账号和持久化数据卷。前端继续部署在 Cloudflare。

## 1. 准备服务器

在 Ubuntu ECS 安装 Docker Engine 和 Docker Compose 插件，并将项目仓库克隆到服务器。下列命令在仓库的 `backend` 目录执行：

```sh
cd MusicTidal/backend
```

## 2. 配置数据库和应用密钥

复制环境变量模板，并编辑服务器本地的配置文件：

```sh
cp .env.docker.example .env.docker
nano .env.docker
```

至少替换 `POSTGRES_PASSWORD`、`JWT_SECRET` 和 `NETEASE_COOKIE_ENCRYPTION_KEY`。分别运行 `openssl rand -hex 32` 生成不同的随机十六进制字符串。加密密钥必须为 64 位十六进制，并在更新、重启和迁移服务器时保持不变；它用于解密数据库中的个人网易云绑定。游客令牌等网易云变量按需配置，房间不再读取全局个人 Cookie。

`.env.docker` 包含密钥，已由 `backend/.gitignore` 排除，不要提交。Compose 会据此自动生成容器内的 `DATABASE_URL`。镜像构建本身不使用真实密钥。

## 3. 构建并启动，自动初始化数据库

```sh
docker compose --env-file .env.docker up -d --build
```

Compose 会先启动 PostgreSQL，并等它通过健康检查后再启动后端容器。后端容器会自动执行 `prisma migrate deploy`，迁移成功后才启动 HTTP 和 WebSocket 服务；迁移失败时不会启动应用，可通过下方日志命令查看原因。每次容器启动都检查迁移，只执行尚未应用的迁移。

首次使用空数据卷时，PostgreSQL 自动创建数据库和账号，三个现有 Prisma 迁移自动创建与当前代码一致的表结构。无需手动安装 PostgreSQL、执行建表 SQL 或导入旧数据。已有数据卷会保留原数据，这个启动流程不会主动清空它。

部署前需要将最新后端代码、Dockerfile 和整个 `backend/prisma/migrations` 目录提交并推送到仓库，再在 ECS 拉取；尤其不要漏掉 `20261003000000_room_netease_binding` 迁移。真实 `.env.docker` 配置仅保存在服务器上。

## 4. 查看服务状态

```sh
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 backend
```

后端端口默认仅绑定在宿主机的 `127.0.0.1:3001`，供宿主机上的 Nginx 转发。PostgreSQL 不发布公网端口。Nginx 配置 HTTPS，并将 WebSocket 的 Upgrade/Connection 请求头转发给后端。

## 当前表与数据保存

当前只有一张业务表 `User`：

| 字段 | 用途 |
| --- | --- |
| `id` | 自增整数主键 |
| `username`、`email` | 唯一用户名和邮箱 |
| `password` | 密码哈希 |
| `neteaseInfo` | 可空、唯一的网易云标识 |
| `neteaseCookieEncrypted` | 加密的网易云凭据 |
| `neteaseProfile` | 网易云账号资料 JSON |
| `neteaseBoundAt`、`neteaseInvalidAt` | 绑定及失效时间 |
| `createdAt` | 用户创建时间 |

Prisma 还会自动创建 `_prisma_migrations` 表记录迁移历史。首次初始化没有预设用户或旧用户，用户通过网页注册后写入 `User` 表。

PostgreSQL 数据保存在 Compose 创建的 `postgres_data` 卷中。重启或更新后端容器不会删除用户数据；普通的 `docker compose down` 也会保留该卷。定期备份数据库。删除该数据卷会一并删除注册用户及数据库数据。

更新应用代码时，先拉取最新代码，再在 `backend` 目录重新运行 `docker compose --env-file .env.docker up -d --build`。新增迁移会在容器启动时自动更新数据库结构；不要使用 `migrate reset` 清空生产数据库。

保持一个后端容器，HTTP API 和 WebSocket 使用同一进程的房间状态。后端容器重启会结束所有房间并清空队列、聊天、在线用户及计时器，PostgreSQL 用户及加密的网易云绑定仍保留。多房间改造需要先执行可空字段迁移，再同步发布前后端，详见 [多房间说明](rooms.md)。

## Cloudflare 前端地址

在 Cloudflare 的前端构建设置中配置 `NEXT_PUBLIC_BACKEND_URL` 为后端 HTTPS origin（不带 `/api`），并把 `NEXT_PUBLIC_WS_URL` 配成实际的 WSS 地址，然后重新构建发布。后端 HTTP 和 WebSocket 使用同一个服务器域名与端口，TLS 由 Nginx 提供。

## 文件说明

- `backend/Dockerfile`：生成 Linux Prisma 客户端、编译后端，启动时先应用迁移再运行 Node 后端。
- `backend/docker-compose.yml`：同时启动 PostgreSQL 和后端，持久化 PostgreSQL 数据并等待数据库就绪。
- `backend/.env.docker.example`：无密钥的配置模板。
- `backend/.dockerignore`：防止本机依赖、环境文件和网易云凭据进入镜像构建上下文。

## 参考

- [Docker Compose 环境变量](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Compose 等待数据库健康检查](https://docs.docker.com/compose/how-tos/startup-order/)
- [Prisma 6 生产环境迁移](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)
- [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)
- [Nginx WebSocket 转发](https://nginx.org/en/docs/http/websocket.html)
