# LumeBox mobile danmaku component

Upstream version and source commit: manifest.json. Source is huangxd-/danmu_api; license: LICENSE.

Build: npm install, then node tools/build-mobile.mjs . mobile.
The adapter uses the existing on-device Node host and native HTTP bridge; it exposes authenticated loopback search, match, comments/segments, favorites and local configuration routes only.

The App trusts a pinned RSA public key and checks manifest.sig before activating an update. Signed releases may be prepared locally with the dedicated private key; that private key is not included here or in the App. If BUILTIN_SIGNING_KEY is not configured in Actions, upstream/Cloudflare synchronization continues but mobile releases remain at the last locally signed version.
