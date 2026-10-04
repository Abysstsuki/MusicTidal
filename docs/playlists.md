# Room playlists

The header's playlist browser uses the signed-in member's Netease binding, not
the host's binding. Unbound members can search and inspect public playlists.
The liked playlist is identified by specialType=5 and its owner's UID.
Sharing a playlist adds an in-memory room directory entry with its source user
ID and a track-ID snapshot. Members can inspect the shared entry; the source
user's current credential is checked server-side. No Cookie is stored in room
entries or sent to browsers. Leaving does not remove a shared entry. Binding
changes invalidate catalog caches and pause affected entries until reactivated.

Each room has regular (manual + heart) and playlist modes, with one player and
one active playlist. Only the host can change modes, activate/remove playlists,
or change sequential/shuffle/repeat settings. Members can share playlists,
add individual songs to the regular queue, and nominate songs in the active
playlist for the FIFO next-song queue. Nominating while regular mode is active
does not switch modes. Browsing playlists never activates them.

Switching preserves the playing track and timer, both queues and their progress.
Heart refill pauses in playlist mode without clearing the heart session. A
playlist finishes in place unless repeat is enabled; another playlist is never
selected automatically. Shuffle covers the full track-ID snapshot and does not
repeat within a round except for explicit replay nominations. URL acquisition
uses the host's current room credential. Ten consecutive unplayable songs pause
the entry. The host can reactivate it to continue. Removing an active entry
keeps the current track playing and leaves playlist mode idle afterwards.

Personal REST routes are under `/api/user/netease/playlists`: list, search,
`:playlistId` metadata and `:playlistId/tracks` pages. Room routes are under
`/api/rooms/:roomId/playlists`: GET/POST directory, `:entryId/tracks`,
`:entryId/activate`, PATCH `:entryId/settings`, `:entryId/next`, and DELETE entry.
POST `/queue/mode` changes room mode. Pages default to 30 and are limited to 100.
The directory holds at most 50 entries and deduplicates by Netease playlist ID.

REST room state and ROOM_SNAPSHOT carry `playlists` (mode, activeEntryId,
entries and loading). PLAYLIST_STATE_UPDATED uses the existing room/revision
envelope. PLAY_SONG remains the playback authority; QUEUE_UPDATED still carries
only the regular queue. Clients exit rooms only for ROOM_CLOSED/NOT_MEMBER,
not for missing playlists. Netease binding errors use 409 rather than JWT 401.
Backend restart clears all playlist entries and progress. No database migration
or separate Netease API process is required. Deploy backend/vendor with dist.

## Local verification

When building alongside a running development server, set
`MUSICTIDAL_NEXT_DIST_DIR` to an independent Next.js output directory such as
`.next-playlist-check`. It defaults to `.next`.

The backend tests mock external Netease responses and cover separate member
catalogs and host playback credentials, bounded pages, host permissions,
playlist progress/shuffle/repeat, priority nominations, mode changes, stale
requests, unavailable tracks, source binding changes, departure and disposal.
The local API fixture supports playlist browsing and simulated QR binding for
two-browser UI checks without a real database or Netease account.
