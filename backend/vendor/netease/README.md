# Embedded Netease API subset

Source: the project's `NeteaseCloudMusicApi-master`, version 4.11.1, by Binaryify (MIT; see `LICENSE`). No dependency on that sibling directory remains at runtime.

This subset includes `cloudsearch`, `song_url_v1`, `lyric`, `user_account`, `recommend_songs`, `personal_fm`, `user_playlist`, `likelist`, and `playmode_intelligence_list`. The last three modules support the room's heart mode, using the account's liked playlist and liked song IDs. They are copied unchanged from the same 4.11.1 source. `register_anonimous` is included only to acquire an in-memory guest token when no credentials are configured. Modules are statically imported by `index.js`; the original HTTP server and dynamic directory loading are omitted.

Local adaptations:

- `util/request.js`: accepts anonymous token and timeout options instead of reading/printing a token from the working directory; shares keep-alive agents; removes unused proxy integrations; sanitizes transport errors.
- `module/song_url_v1.js`: removes diagnostic logging and an unused import.
- `index.js`: creates an independent cookie object for each call, preserving whitespace handling and values containing `=`.
- `index.d.ts`: describes the subset for the backend's TypeScript adapter.

The upstream protocol and encryption are otherwise preserved. Its only external runtime dependency is `axios`, already declared in `backend/package.json`. Files are kept alongside `dist/` in `backend/vendor/`; deploy both directories. No user cookie or anonymous token is bundled here.
