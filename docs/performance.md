# Interaction latency

The first optimization pass keeps the existing room authorization, playback
ownership and WebSocket protocol. It reduces redundant work on common paths.

- Create/join responses include `state` alongside `room`. The lobby transfers
  that authenticated snapshot in memory to the room route for up to 15 seconds,
  scoped to the current token. Client navigation preserves the auth provider.
  Direct links still call join; older backend responses fall back to `/state`.
- Login uses the profile returned by the login API. On reload, a stored profile
  with a matching user ID and an unexpired token restores the account UI while
  `/user/me` revalidates in the background. These local checks never authorize a
  request: REST and WebSocket still verify JWTs and room membership.
- Public lobby reads omit Authorization, share in-flight requests, and show a
  30-second session cache while refreshing. Auth profile reads also share
  in-flight work, with independent cancellation for each subscriber.
- Successful mutations complete after the mutation response. WebSocket events
  apply room changes; disconnected clients refresh a snapshot in the background,
  and reconnecting clients receive a new authoritative snapshot. Duplicate
  playback snapshots no longer seek the audio again.
- Panels mount on first use and retain their state while hidden. Song search and
  playlist pages have bounded 60-second UI caches. Each search platform responds
  separately; later results append without moving already visible rows.
- Audio position uses its own subscription, consumed only by player and lyrics.
  It does not update the shared room context.
- Netease song details and privileges cache by credential identity, real IP and
  song ID for 120 seconds, up to 1000 songs. Batch lookup and single enqueue can
  reuse the same validated data. Authorization disposal invalidates that scope;
  playable URLs are still resolved with current playback credentials.
- Playlist credentials cache for 15 seconds, up to 100 users per platform, and
  binding changes/expiry invalidate them immediately. QQ renewal invalidates
  the catalog scope as well. Identical in-flight catalog reads are coalesced.
- QQ personal browsing fetches only the requested page. Imported playlists keep
  a complete ID snapshot for shared shuffle/repeat; index reads use at most
  three concurrent page requests when the upstream reports a total. Permission
  rechecks use a one-song page instead of re-reading the full index.
- Recommendation enabling acknowledges the mode while the initial fill runs
  in the background; existing loading/error WebSocket events report progress.
- CORS preflight responses use a 600-second max age.

Deploy the frontend and backend changes together for the reduced request paths.
First visits and cache misses still need network, database and music-provider
responses. Actual latency gains should be measured using the browser request
waterfall and Performance recording, separating request waits from rendering.
