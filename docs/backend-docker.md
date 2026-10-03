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

至少替换 `POSTGRES_PASSWORD` 和 `JWT_SECRET`。可运行两次 `openssl rand -hex 32` 生成随机十六进制字符串，然后分别填入这两个值。十六进制字符也能安全放进 PostgreSQL 连接串。`NETEASE_COOKIE` 等网易云变量按需取消注释并填写。

`.env.docker` 包含密钥，已由 `backend/.gitignore` 排除，不要提交。Compose 会据此自动生成容器内的 `DATABASE_URL`。镜像构建本身不使用真实密钥。

## 3. 构建并初始化数据库

```sh
docker compose --env-file .env.docker build
docker compose --env-file .env.docker run --rm backend node node_modules/prisma/build/index.js migrate deploy
```

Compose 会先启动 PostgreSQL，并等它通过健康检查后再执行迁移。迁移按项目现有 Prisma 文件创建表，不会把原服务器或本地数据库里的用户复制过来。

## 4. 启动服务

```sh
docker compose --env-file .env.docker up -d
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 backend
```

后端端口默认仅绑定在宿主机的 `127.0.0.1:3001`，供宿主机上的 Nginx 转发。PostgreSQL 不发布公网端口。Nginx 配置 HTTPS，并将 WebSocket 的 Upgrade/Connection 请求头转发给后端。

## 数据保存与更新

PostgreSQL 数据保存在 Compose 创建的 `postgres_data` 卷中。重启或更新后端容器不会删除用户数据；普通的 `docker compose down` 也会保留该卷。定期备份数据库。删除该数据卷会一并删除注册用户及数据库数据。

更新应用代码时，在 `backend` 目录重新运行 build、`migrate deploy` 和 `up -d` 命令。新增迁移会更新数据库结构；不要使用 `migrate reset` 清空生产数据库。

保持一个后端容器，HTTP API 和 WebSocket 使用同一进程的队列状态。后端容器重启会清空当前内存队列、聊天、在线用户及计时器，PostgreSQL 用户数据仍保留。

## Cloudflare 前端地址

在 Cloudflare 的前端构建设置中配置 `NEXT_PUBLIC_BACKEND_URL` 为后端 HTTPS origin（不带 `/api`），并把 `NEXT_PUBLIC_WS_URL` 配成实际的 WSS 地址，然后重新构建发布。后端 HTTP 和 WebSocket 使用同一个服务器域名与端口，TLS 由 Nginx 提供。

## 文件说明

- `backend/Dockerfile`：生成 Linux Prisma 客户端、编译并运行 Node 后端。
- `backend/docker-compose.yml`：同时启动 PostgreSQL 和后端，持久化 PostgreSQL 数据并等待数据库就绪。
- `backend/.env.docker.example`：无密钥的配置模板。
- `backend/.dockerignore`：防止本机依赖、环境文件和网易云凭据进入镜像构建上下文。

## 参考

- [Docker Compose 环境变量](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Compose 等待数据库健康检查](https://docs.docker.com/compose/how-tos/startup-order/)
- [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)
- [Nginx WebSocket 转发](https://nginx.org/en/docs/http/websocket.html)
