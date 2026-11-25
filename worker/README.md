# SmartClass AI Worker

Keeps the Gemini key **off every browser**. The site sends AI requests here with
the lecturer's sign-in token; the Worker checks with Firestore that it is the
lecturer, adds the key and calls Gemini. Students and other sites are refused.

## Set up (once, ~5 minutes, free)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free plan).
2. In this folder:
   ```
   npx wrangler login
   npx wrangler secret put GEMINI_KEY     (paste the key when asked; it is stored encrypted)
   npx wrangler deploy
   ```
3. Copy the address it prints (`https://smartclass-ai.<name>.workers.dev`) into
   `web/js/ai-config.js` → `AI_PROXY`, commit, push.

No command line? Dashboard → **Workers & Pages → Create → Hello World** → Deploy →
**Edit code**, paste `src/index.js`, Deploy. Then **Settings → Variables**: add
`FIREBASE_PROJECT`, `ALLOWED_ORIGINS`, `MODEL` (as in `wrangler.toml`) and
`GEMINI_KEY` as type **Secret**.

## Checks it makes
| Check | Refused with |
|---|---|
| Origin is our site | 403 |
| Firebase token present, for our project, not expired | 401 |
| Firestore lets this token read `staff/{uid}` (real lecturer) | 403 |
| ≤ 30 requests a minute per lecturer | 429 |
| Body ≤ 26 MB, only `contents`, `systemInstruction`, `generationConfig` | 413 / 400 |
