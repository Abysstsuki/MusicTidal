# AGENTS.md

## Project Overview

MusicTidal is a web app for multiple users to listen to music together in sync. It has:

- `frontend/`: Next.js 15 App Router + React 19 UI.
- `backend/`: Express 5 + TypeScript API server, Prisma user storage, and a WebSocket server.
- `NeteaseCloudMusicApi-master/`: vendored Netease Cloud Music API service used by the backend for search, lyrics, and playable URLs.
- `docs/`: sparse project docs and prior design/process notes.

The main product loop is: user logs in, searches Netease songs, adds songs to a shared queue, the backend advances the in-memory queue, and all connected browsers receive synchronized playback state through WebSocket.

## Repository Map

- `frontend/src/app/page.tsx`: main single-screen app layout.
- `frontend/src/app/layout.tsx`: root layout, font, scanline overlay.
- `frontend/src/app/globals.css`: Tailwind import and global visual tokens.
- `frontend/src/app/api/**/route.ts`: Next API routes that proxy browser calls to the backend.
- `frontend/src/components/musicplayer.tsx`: playback, WebSocket `PLAY_SONG`, current-song sync, skip, download.
- `frontend/src/components/musicqueue.tsx`: shared queue UI, listens for `QUEUE_UPDATED`.
- `frontend/src/components/musicreq.tsx`: song search and enqueue UI.
- `frontend/src/components/musiclyrics.tsx`: LRC parsing and synchronized lyric scrolling.
- `frontend/src/components/chatbox.tsx`: WebSocket chat and chat history.
- `frontend/src/components/onlineuser.tsx`: online user list via WebSocket `join`/`leave`.
- `frontend/src/components/userinfo.tsx`: login state, localStorage token handling.
- `frontend/src/contexts/MusicContext.tsx`: current song, position, playing state shared by player/lyrics/background.
- `frontend/src/types/music.ts`: shared frontend song/search response shapes.
- `backend/src/server.ts`: bootstraps dotenv, verifies Netease cookie, creates HTTP server, attaches WebSocket, starts queue if idle.
- `backend/src/app.ts`: Express app, CORS, JSON, morgan, `/api` routes, error handler.
- `backend/src/routes/index.ts`: mounts `/auth`, `/user`, `/netease`, `/queue`.
- `backend/src/services/songQueueService.ts`: in-memory queue and current-song timer.
- `backend/src/services/websocketServer.ts`: WebSocket users, chat history, broadcast, current playback snapshot.
- `backend/src/services/netease/song.service.ts`: Netease search, song URL, lyric APIs.
- `backend/src/utils/neteaseHttp.ts`: direct HTTP client for the vendored Netease API, including `cookie.txt` and `realIP`.
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
- Netease API access via local vendored service and `backend/cookie.txt`

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
```

Netease API service:

```bash
cd NeteaseCloudMusicApi-master
npm install
npm start
```

The Netease service script sets `PORT=3457` on Windows. The backend defaults `NETEASE_CLOUD_API_URL` to `http://localhost:3457` if the env var is absent.

## Environment And Secrets

Do not print, commit, or replace secret values. It is fine to mention required variable names.

Backend expects:

- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `JWT_SECRET`: signing secret for login tokens.
- `NETEASE_CLOUD_API_URL`: local/remote Netease API base URL, usually `http://localhost:3457`.
- `PORT`: optional backend port, default `3001`.
- `backend/cookie.txt`: Netease cookie used by `neteaseHttp.ts` and `axiosNetease.ts`.

Frontend expects:

- `NEXT_PUBLIC_BACKEND_URL`: backend HTTP origin, usually `http://localhost:3001`.
- `NEXT_PUBLIC_WS_URL`: backend WebSocket URL, usually `ws://localhost:3001`.

Existing `.env`, `.env.local`, and `cookie.txt` files may contain real secrets or session cookies. Treat them as sensitive even if they are already present.

## Runtime Data Flow

1. Browser UI calls local Next routes such as `/api/song/search`, `/api/song/queueAdd`, `/api/user/me`.
2. Next routes proxy requests to `NEXT_PUBLIC_BACKEND_URL`.
3. Backend routes under `/api` call services:
   - `/api/auth/*` uses Prisma users, bcrypt, JWT.
   - `/api/user/me` verifies JWT and returns profile.
   - `/api/netease/*` talks to the vendored Netease API service.
   - `/api/queue/*` mutates or reads `songQueueService`.
4. WebSocket clients connect directly to `NEXT_PUBLIC_WS_URL`.
5. Queue and playback are process memory only. Restarting the backend clears queue, chat history, online users, current song, and timers.

## WebSocket Protocol Notes

Frontend sends:

- `join`: `{ type: "join", username }`
- `leave`: `{ type: "leave", username }`
- `chat`: `{ type: "chat", username, text }`

Backend broadcasts:

- `history`: recent chat messages for a newly joined user.
- `chat`: a new chat message.
- `update`: online user list as `users`.
- `QUEUE_UPDATED`: shared queue payload.
- `PLAY_SONG`: `{ song, url, startTime }` used by clients to align `audio.currentTime`.

There are also legacy-looking queue broadcasts (`queue:update`, `song:play`) in `queueController.ts`; current frontend code primarily consumes `QUEUE_UPDATED` and `PLAY_SONG`.

## Prisma And Database

Current Prisma schema has a single `User` model:

- `id`
- `username` unique
- `email` unique
- `password`
- `neteaseInfo` optional unique
- `createdAt`

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
- `node_modules/`, `.next/`, generated Prisma files, and vendored `NeteaseCloudMusicApi-master/` should generally not be touched unless the task specifically requires it.
- In PowerShell, paths containing square brackets, such as `frontend/src/app/api/auth/[action]/route.ts`, need `-LiteralPath`.
- `rg` may be unavailable or blocked in this sandbox; use `Get-ChildItem` / `Select-String` fallback when needed.
- The backend has no meaningful test script at the moment (`npm test` exits with an error by design).
- The frontend `lint` script is currently `next lint`; verify behavior in the installed Next version before assuming it works.
- The backend imports `verifyCookie` from `utils/neteaseHttp.ts`, not `utils/axiosNetease.ts`, although both files contain similar cookie verification logic.

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

For end-to-end local testing, run the Netease API service, backend, and frontend in separate terminals, then open `http://localhost:3000`.

## Collaboration Rules For Future Agents

- Start by reading this file and checking `git status --short --branch`.
- Keep edits scoped to the user request.
- Do not expose env values, cookies, tokens, or database URLs in chat or docs.
- Prefer existing project patterns over new abstractions.
- For UI work, preserve the dark panel aesthetic and synchronized-music workflow.
- For queue/playback work, consider both REST proxy routes and WebSocket side effects.
- For auth work, check both frontend localStorage behavior and backend JWT middleware.
- Verify with the smallest command that covers the changed area, and report any command that could not be run.
