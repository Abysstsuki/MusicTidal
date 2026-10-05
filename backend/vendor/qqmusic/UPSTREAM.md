# QQ Music embedded subset

Source: https://github.com/sansenjian/qq-music-api
Revision: `45d0d275b590d8c3f99270e7f74135873172c71a` (retrieved 2026-10-04).
License: MIT, included in LICENSE.

Adaptations: CommonJS modules for Node 22, explicit per-user Cookie contexts, no
Koa server/global cookies/debug logging. HTTP timeouts cover response bodies;
redirects are manual. QR credentials stay on the server. WeChat music IDs are
extracted as strings before JSON numeric conversion. Only search, account, QR
login, lyrics, audio URLs and playlist reads are included.

Roaming is an independent implementation of the documented protocol
`music.radioProxy.MbTrackRadioSvr/get_radio_track`:
https://l-1124.github.io/QQMusicApi/reference/modules/recommend/#get_guess_recommend
No Python source from that GPL project is included. File naming and batch detail
parameters were checked against its published protocol documentation.

QR compatibility fix (2026-10-04): retain the upstream native FormData authorize
request and music-login JSON-text/form-urlencoded wire format. Native QQ login
accepts credentials from Set-Cookie even when req.data is null. Redirects enter
the session only after validation; rejected music codes are renewed on retry.
Failure diagnostics contain stage/reason/status/code only, never URLs or tickets.

check_sig redirect fix (2026-10-04): manually follow up to five redirects within
a 15-second budget, retaining cookies at every hop. Follow only HTTPS QQ
check_sig endpoints and graph.qq.com's /oauth2.0/login_jump; reject other hosts,
paths, embedded credentials and loops. A next-hop network retry resumes that hop
instead of replaying the initial ticket. Diagnostics add safe redirect counts
and a fixed target category, without exposing the Location or Cookie values.

QR Cookie scope fix (2026-10-04): each private QR session has its own in-memory
tough-cookie jar. Preserve Domain/Path/Secure/Expires/Max-Age while ingesting
response cookies and select outgoing cookies for the specific request URL.
Tencent can issue a valid .graph.qq.com p_skey and expire the same cookie name
under .qq.com in one check_sig response; merging by name alone erased the valid
ticket. Native OAuth reads the graph-scoped ticket and only music-domain cookies
become the encrypted music credential. QQ requests use the login-page Referer;
polling sends only that session's qrsig. The callback address remains validated
and is used as returned by Tencent.

Search rejection handling (2026-10-05): check inner search codes and negative
`meta.is_filter` statuses even when the RPC reports code zero. Rejected searches
raise a search failure instead of being cached as successful empty results;
they do not invalidate an otherwise valid music binding.
