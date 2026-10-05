# 双音源实现与验收

网易云和 QQ 音乐可同时绑定。点歌搜索、播放及推荐使用房主账号；个人歌单的读取和搜索使用当前用户账号。授权过期等同于未绑定。个人歌单可浏览，房主没有对应授权时禁止单曲和整单加入房间，后端返回 `MUSIC_BINDING_REQUIRED`（409），不会退出 MusicTidal 登录。

超级房间的 QQ 点歌搜索使用公共 QQ 授权，所有成员均可搜索，无需个人绑定 QQ。网易云点歌搜索和两平台歌词使用匿名客户端；个人歌单仍使用当前用户自己的绑定。公共授权仅在后端使用，不返回账号身份、资料或凭据。

## API 与歌曲身份

- `GET /api/rooms/:roomId/music/song/search?keywords=…&limit=10&neteaseOffset=0&qqmusicOffset=0`：独立分页并交错返回两家结果，网易云在前。`providers` 包含各家 `songs/total/offset/limit/hasMore/error`；某家失败不丢弃另一家。
- `GET …/music/song/url?id=…&provider=qqmusic`、`GET …/music/lyric?id=…&provider=qqmusic`。
- `POST …/queue/add` 的 `song.provider`，`POST …/playlists` 的 `provider`，`POST …/queue/recommendations/start` 的 `provider` 均支持 `netease/qqmusic`。未传时兼容网易云。
- `/api/user/qqmusic`、`/qr`、`/qr/:sessionId/check`、取消及解绑沿用网易云响应形状；二维码创建请求的 `channel` 为 `qq/wechat`。浏览器只取得 session ID、图片和过期时间。
- `/api/user/qqmusic/playlists`、`/search`、`/:playlistId`、`/:playlistId/tracks` 使用用户自己的账号。

歌曲和歌单身份为平台＋数字 ID；QQ 另保留 MID 和媒体 MID。原 `source` 继续表示 `manual/heart/playlist`，推荐来源见 `recommendations.provider`（QQ 的 `phase` 为 `roam`）。队列手动歌曲的 `unavailableReason` 表示暂时跳过，重新绑定后恢复调度。歌单保留进度但需房主重新激活。

`access` 为 `free/vip/paid/quality/unknown`。网易云 `fee=8` 表示高音质或下载会员限制，不标整首 VIP；QQ 分开保留播放、月会员和下载字段。入队时从平台重新读取元数据，浏览器传入的付费标签或 MID 不决定实际播放权限。

播放快照保存 `trial`、片段 `duration`、`originalDuration`、`lyricOffset`（原曲毫秒偏移）、`audioOffset` 和实际 `format`。优先完整音频及较低音质，再尝试平台试听。房间服务端用片段时长切歌；无音频时发出 `PLAYBACK_NOTICE` 并跳过。下载文件使用返回的格式，试听加 `[试听]` 文件名标记。

## 数据迁移与部署

迁移文件：[20261004000000_qqmusic_binding](../backend/prisma/migrations/20261004000000_qqmusic_binding/migration.sql)。四个新字段均可空，原用户和网易云绑定不变。`qqmusicProfile` 只保存公开资料；所有授权票据保存到 `qqmusicCookieEncrypted`。沿用稳定的 `NETEASE_COOKIE_ENCRYPTION_KEY` 和原 v1 AES-256-GCM 格式，无需新增密钥。

在服务器仓库 `backend` 目录运行：

```text
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

数据库健康后运行 `prisma migrate deploy`，成功才启动 HTTP/WebSocket。后端健康检查为 `/api/health`，同时检查数据库可连接。沿用单后端进程、原 PostgreSQL 数据卷和 HTTPS/WSS 代理。先更新后端，再发布 Cloudflare 静态前端并刷新页面。重启容器结束现有房间，用户和两家的加密绑定保留。

## 已验证与待验收（2026-10-04）

双音源初版的本地 68 项测试全部通过，覆盖双平台授权、独立歌单、同 ID 隔离、推荐切换、失效保留队列、片段时长及偏移、QQ/微信 QR 协议与取消/替换/重试、密文及敏感响应隔离。生产前端可静态导出，后端可编译。后续扫码 Cookie 修复的 19 项针对性测试及后端构建也已通过，包含跨域同名 Cookie 删除与并发账号隔离。

使用假账号和平台响应的本地浏览器验收确认了双账号卡、双平台搜索结果及来源/VIP/试听标签、歌单 Tab 切换保留各自详情页码、混合队列播放和中途加入的试听时间轴。截图与 HTTP/WS 验收使用本地测试服务，不代表真实 QQ 授权能力已验证。

在隔离 PostgreSQL 16 数据库中验证了空库四个迁移、已有用户及网易云密文的增量升级、重复部署无待迁移项；编译后端的健康接口、注册/登录、认证 WebSocket 快照和新服务实例读取加密 QQ 绑定也已验证。所有测试使用临时库和假账号凭据，未修改现有数据库。

2026-10-04 使用用户手机 QQ 在本机完成真实扫码，确认 `check_sig` 下发票据、OAuth 授权、音乐 Cookie 交换及账号资料读取全部成功。该验证仅在内存使用凭据，没有保存真实账号绑定或输出 Cookie。

无登录公开请求已取得 QQ 歌曲元数据及平台试听 URL；这不能替代账号验收。当前网络下公开搜索返回空结果，必须在实际部署网络与已绑定账号下检查搜索。微信区真实扫码、个人/收藏歌单、漫游、VIP 完整播放及非会员试听仍待真实账号验收。当前本机无 Docker，容器构建、Compose 状态及反向代理 HTTPS/WSS 仍需在现有服务器完成；本地 HTTP/WS 检查不等同于 Compose 验收。

## QQ 授权自动续期

QQ 登录凭据到期前 **30 分钟**由后端自动续期，使用已实测成功的
`QQConnectLogin.LoginServer / QQLogin` 网页协议。按平台返回的
`musickeyCreateTime + keyExpiresIn` 保存到期时间；2026-10-05 的真实 QQ
验证连续两次刷新取得新音乐 Key，账号读取成功，返回的音乐 Key 寿命为 72 小时。
该寿命不等于刷新票据永远有效。微信续期未启用，QQ／微信扫码绑定入口不变。

无需新增数据库字段、SQL 迁移或密钥。仍使用 `qqmusicCookieEncrypted` 和 v1
AES-256-GCM 加密；新加密载荷包含完整 Cookie 及到期时间，读取时兼容旧的纯 Cookie。
历史 Cookie 中的 `psrf_qqrefresh_token`、`psrf_qqaccess_token`、`psrf_qqopenid`
可直接用于续期，无需统一重新扫码。旧 Cookie 的到期时间按
`psrf_musickey_createtime` 加已实测的 72 小时推算，成功续期后改用实际响应时间；
票据齐全但没有时间戳时会立即续期以取得到期时间。缺失票据的绑定继续沿用已有
Cookie，授权失效后需要重新扫码。

启动时分页恢复所有有效绑定的定时器，用户离线也会续期；已进入续期窗口的绑定
立即补刷。新绑定注册新定时器，解绑、账号替换、授权失效及停服会取消对应任务。
网络、账号查询或数据库写入失败按 1／2／4／5 分钟退避重试；数据库写入失败时
暂存已取得的新凭据，避免再次消费旧票据。确认票据被拒绝时，保留当前 Key 到期前
的授权，到期后标记失效。日志只包含允许的原因和数字错误码，不含票据或响应。

续期写入按用户串行并校验旧密文，迟到的响应不会覆盖新绑定或恢复已解绑账号。
成功续期直接更新房间使用的 QQ 客户端；当前音频、手动队列、歌单进度和 QQ 漫游
保持运行。正在请求的旧 Key 若返回失效，会用新 Cookie 重试一次。个人歌单的新
请求读取最新凭据，绑定时间与公开账号资料不变。
旧 Key 的失效处理会等待正在进行的续期及保存，避免把刚刷新成功的绑定误判为过期。

更新后只需重建后端，无需发布前端：在服务器 `backend` 目录执行
`docker compose --env-file .env.docker up -d --build`。容器重启仍会结束现有房间；
账户及已加密保存的绑定保留。

## QQ 扫码失败排查

`QQMUSIC_QR_POLL_FAILED` 表示扫码状态、登录票据确认、OAuth 跳转或音乐凭据交换中的任一步骤失败，不表示数据库迁移失败。扫码确认后的请求保持[上游实现](https://github.com/sansenjian/qq-music-api/blob/main/src/services/apis/user/checkQQLoginQr.ts)的编码：OAuth 使用 multipart FormData，音乐登录发送 JSON 文本且 Content-Type 为 `application/x-www-form-urlencoded`。QQ 的凭据可由 Set-Cookie 返回，不要求 `req.data` 存在。

后端日志 `QQ Music QR binding failed` 仅记录 `stage/reason/httpStatus/upstreamCode`。`qr_poll` 是扫码状态请求，`check_sig` 是登录票据确认，`oauth_authorize` 是授权跳转，`music_login` 是音乐登录交换。日志不包含 Cookie、授权码、跳转地址或原始响应。重建后端镜像后刷新旧二维码再试；仍失败时可依据这些安全字段区分网络问题、缺失票据、未返回授权跳转和上游拒绝。

`check_sig / MISSING_P_SKEY / 302` 表示这一跳没有返回需要的票据，不等于 Cookie 已过期。实现会在固定的 QQ 登录端点内手动跟随重定向，逐跳保存 Cookie，最多五次跳转且总时间不超过 15 秒。取得 `p_skey` 后才继续 OAuth；若仍缺失，会额外记录安全的 `redirectCount` 和 `redirectTarget`（`qq_signature/qq_oauth/other`）。异常域名、路径、带用户名密码的 URL 和循环跳转会被拒绝。不能通过放开 Axios 全局自动跳转或忽略票据检查来处理。

`check_sig / MISSING_P_SKEY / 200 / redirectTarget: qq_oauth` 曾由 Cookie 合并错误触发：腾讯在同一响应中下发 `.graph.qq.com` 的有效 `p_skey`，随后清除 `.qq.com` 下的同名 Cookie。按名称合并会使空值覆盖有效票据，仅跟随 302 无法解决。每个二维码会话现使用独立的内存 CookieJar，保留域名、路径和过期信息，按请求地址选取 Cookie；OAuth 使用 graph 域票据，最终加密保存音乐域凭据。部署修复后重新生成二维码，旧会话里的票据可能已经被消费。
