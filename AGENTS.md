# AGENTS.md

## Project Overview

MusicTidal is a web app for multiple users to listen to music together in sync. It has:

- `frontend/`: Next.js 15 App Router + React 19 UI.
- `backend/`: Express 5 + TypeScript API server, Prisma user storage, and a WebSocket server.
- `backend/vendor/netease/`: embedded Netease API subset for search, lyrics, playable URLs, account checks, daily recommendations, and personal FM. The ignored sibling `NeteaseCloudMusicApi-master/` is the original source reference and is not needed at runtime.
- `docs/`: sparse project docs and prior design/process notes.

The main product loop is: browse the lobby, log in, create or join a room, search Netease songs and share that room's queue. Each room advances playback in memory and synchronizes its own members through authenticated WebSocket connections. See `docs/rooms.md` for lifecycle and deployment details.

## Repository Map

- `frontend/src/app/page.tsx`: public room lobby and login/create/join flow.
- `frontend/src/app/room/page.tsx`: static listening route using `roomId` query parameters; local demo uses `preview=1`.
- `frontend/src/components/ListeningStage.tsx`: room listening layout and host toolbar.
- `frontend/src/app/layout.tsx`: root layout, font, scanline overlay.
- `frontend/src/app/globals.css`: Tailwind import and global visual tokens.
- `frontend/src/app/api/**/route.ts`: Next API routes that proxy browser calls to the backend.
- `frontend/src/components/musicplayer.tsx`: playback, WebSocket `PLAY_SONG`, current-song sync, skip, download.
- `frontend/src/components/musicqueue.tsx`: shared queue UI, listens for `QUEUE_UPDATED`.
- `frontend/src/components/musicreq.tsx`: song search and enqueue UI.
- `frontend/src/components/musiclyrics.tsx`: LRC parsing and synchronized lyric scrolling.
- `frontend/src/components/chatbox.tsx`: WebSocket chat and chat history.
- `frontend/src/components/onlineuser.tsx`: room online user list.
- `frontend/src/components/userinfo.tsx`: account controls using global authentication.
- `frontend/src/contexts/AuthContext.tsx`: global login state and localStorage token handling.
- `frontend/src/contexts/MusicContext.tsx`: room-scoped music state, WebSocket events and requests; disposal cancels requests and audio.
- `frontend/src/types/music.ts`: shared frontend song/search response shapes.
- `backend/src/server.ts`: bootstraps dotenv, creates HTTP server and attaches WebSocket.
- `backend/src/app.ts`: Express app, CORS, JSON, morgan, `/api` routes, error handler.
- `backend/src/routes/index.ts`: mounts `/auth`, `/user`, `/rooms`; global queue/music routes are retired.
- `backend/src/services/roomManager.ts`: room membership, passwords, authorization, broadcasts and 180-second reconnect lifecycle.
- `backend/src/services/songQueueService.ts`: instantiable in-memory queue, heart sessions and timers with disposal guards.
- `backend/src/services/websocketServer.ts`: JWT-authenticated room connections and heartbeat.
- `backend/src/services/netease/binding.service.ts`: per-user QR sessions and encrypted persistent credentials.
- `backend/src/services/netease/song.service.ts`: Netease search, song URL, lyric APIs.
- `backend/src/utils/neteaseHttp.ts`: adapter for the embedded Netease modules, including environment/file credentials, `realIP`, and bounded search/lyric caching.
- `backend/prisma/schema.prisma`: Prisma schema. Generated client lives in `backend/src/generated/prisma`.

## Tech Stack

Frontend:

- Next.js `15.3.1`
- React `19`
- TypeScript strict mode
- Tailwind CSS v4
- MUI packages are installed, but much of the current UI uses Tailwind classes plus inline styles.
- `simplebar-react` for custom scroll areas.
- `framer-motion` for selected animations.

Backend:

- Node + TypeScript, CommonJS
- Express `5.1.0`
- `ws` WebSocket server on the same HTTP server as Express
- Prisma `6.11.0` with PostgreSQL
- JWT auth with bcrypt password hashing
- Netease API access via embedded modules and explicit room-owner credentials or guest authorization

## Common Commands

Run commands from the relevant subdirectory unless noted.

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

Backend:

```bash
cd backend
npm install
npm run dev
npx tsc --noEmit
npx prisma generate
npm run build
npm start
```

The backend calls Netease directly through `backend/vendor/netease/`; no separate Netease API service or API-origin variable is needed. See `docs/backend-netease.md` for configuration and deployment details.

## Environment And Secrets

Do not print, commit, or replace secret values. It is fine to mention required variable names.

Backend expects:

- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `JWT_SECRET`: signing secret for login tokens.
- `NETEASE_COOKIE_ENCRYPTION_KEY`: stable 64-character hex key for AES-256-GCM personal Cookie encryption.
- `NETEASE_ANONYMOUS_TOKEN`: optional guest token, takes precedence over `backend/anonymous_token`; otherwise acquired in memory when needed.
- `NETEASE_REAL_IP`: optional override of the project's existing domestic IP default.
- `PORT`: optional backend port, default `3001`.
- Legacy `NETEASE_COOKIE` and `backend/cookie.txt` are no longer read for room authorization. Preserve existing secrets; users bind their accounts through QR login. `axiosNetease.ts` only re-exports the adapter for compatibility.

Frontend expects:

- `NEXT_PUBLIC_BACKEND_URL`: backend HTTP origin, usually `http://localhost:3001`.
- `NEXT_PUBLIC_WS_URL`: backend WebSocket URL, usually `ws://localhost:3001`.

Existing `.env`, `.env.local`, and `cookie.txt` files may contain real secrets or session cookies. Treat them as sensitive even if they are already present.

## Runtime Data Flow

1. Browser UI calls `NEXT_PUBLIC_BACKEND_URL` directly when configured, compatible with static export.
2. The public lobby reads `/api/rooms`; authenticated users create or join before loading room state.
3. Backend routes under `/api` call services:
   - `/api/auth/*` uses Prisma users, bcrypt, JWT.
   - `/api/user/me` verifies JWT and returns profile.
   - `/api/rooms/:roomId/netease/*` uses the owner's cloud credentials and requires membership.
   - `/api/rooms/:roomId/queue/*` operates on the room's queue; heart controls require ownership.
   - `/api/user/netease/*` manages encrypted personal binding and per-user QR sessions.
4. WebSocket clients connect to `NEXT_PUBLIC_WS_URL`, then send JWT and room ID in an `AUTH` message.
5. Restarting clears all rooms, playback, chat and timers; PostgreSQL preserves users and encrypted bindings. Run one backend process.

## WebSocket Protocol Notes

Frontend sends:

- `AUTH`: `{ type: "AUTH", token, roomId }` within 10 seconds; the user must already be admitted through REST.
- `chat`: `{ type: "chat", roomId, text }`; identity comes from the server.
- Explicit exit uses REST `/api/rooms/:roomId/leave`; page unload only disconnects.

Backend broadcasts:

- `ROOM_SNAPSHOT`: room, playback, queue, recommendations, members and recent 25 messages.
- `ROOM_UPDATED` / `ROOM_CLOSED`: room metadata or destruction reason.
- `chat`: a new chat message.
- `update`: distinct online room members.
- `QUEUE_UPDATED`: shared queue payload.
- `PLAY_SONG`: `{ song, url, startTime, playbackRevision }` used by clients to align `audio.currentTime`.
- `RECOMMENDATIONS_UPDATED`: room heart-mode state.

Events use `{ type, roomId, revision, payload }`; clients reject old revisions and other rooms. Same-playback-version skip requests advance once. Host exit destroys immediately; last-connection loss gives 180 seconds to reconnect.

## Prisma And Database

Current Prisma schema has a single `User` model:

- `id`
- `username` unique
- `email` unique
- `password`
- `neteaseInfo` optional unique
- `createdAt`
- Nullable `neteaseCookieEncrypted`, `neteaseProfile`, `neteaseBoundAt`, `neteaseInvalidAt`; never include encrypted credentials in public responses.

The Prisma generator outputs to `backend/src/generated/prisma`. Prefer editing `backend/prisma/schema.prisma` and running `npx prisma generate` instead of manually editing generated client files.

## Frontend Design Conventions

The current UI has a dark technical/dashboard style:

- Background: `#0A0C10`
- Panels: `rgba(18, 20, 26, 0.95)`
- Primary text: `#E8E8EF`
- Secondary text: `#8B8FA3`
- Accent blue: `#3A6BFF`
- Thin borders around `rgba(255,255,255,0.08)`
- Letter-spaced small labels for panel headers and controls.
- `SimpleBar` is used for scrollable panels.

Keep changes visually consistent with the existing first-screen app layout. Avoid replacing the product UI with a marketing/landing page.

## Important Implementation Notes

- Many existing source files contain mojibake in comments and user-facing strings. Preserve it unless the task explicitly asks to fix copy/encoding; broad copy rewrites can create noisy diffs.
- Several files already have local modifications in the working tree. Do not revert or overwrite unrelated changes.
- `node_modules/`, `.next/`, generated Prisma files, and the original `NeteaseCloudMusicApi-master/` should generally not be touched unless the task specifically requires it. Embedded third-party adaptations live separately in `backend/vendor/netease/` with their license and change notes.
- In PowerShell, paths containing square brackets, such as `frontend/src/app/api/auth/[action]/route.ts`, need `-LiteralPath`.
- `rg` may be unavailable or blocked in this sandbox; use `Get-ChildItem` / `Select-String` fallback when needed.
- The backend `npm test` covers room isolation/lifecycle, REST/WebSocket authorization, encrypted QR bindings and queue behavior without real external services.
- The frontend `lint` script is currently `next lint`; verify behavior in the installed Next version before assuming it works.
- Startup does not validate a global Cookie. The binding service and explicit room clients determine authorization.

## Suggested Verification

For frontend-only changes:

```bash
cd frontend
npm run build
```

For backend TypeScript/API changes:

```bash
cd backend
npx tsc --noEmit
```

For Prisma schema changes:

```bash
cd backend
npx prisma generate
```

For end-to-end local testing, run backend and frontend in separate terminals, then open `http://localhost:3000`.

## Collaboration Rules For Future Agents

- Start by reading this file and checking `git status --short --branch`.
- Keep edits scoped to the user request.
- Do not expose env values, cookies, tokens, or database URLs in chat or docs.
- Prefer existing project patterns over new abstractions.
- For UI work, preserve the dark panel aesthetic and synchronized-music workflow.
- For queue/playback work, consider both REST proxy routes and WebSocket side effects.
- For auth work, check both frontend localStorage behavior and backend JWT middleware.
- Verify with the smallest command that covers the changed area, and report any command that could not be run.
