# ball. with online challenges

Files:
- index.html: the whole game
- api/handle.mjs: the challenge API logic (saves challenges and results), shared by both hosts
- worker.mjs + wrangler.jsonc: Cloudflare Worker entry point and config (data in Workers KV)
- netlify/functions/api.mjs + netlify.toml + package.json: the older Netlify setup (data in Netlify Blobs)

## Cloudflare Workers (current host)
- worker.mjs serves the game files and runs the API for /api/*; wrangler.jsonc configures it.
- Challenge data lives in the Workers KV namespace `ball-challenges` (bound as CHALLENGES in wrangler.jsonc).
- .assetsignore keeps server and config files out of the public site.
- The Worker is connected to this GitHub repo, so every push to main deploys automatically.
- Check https://ball-game.<subdomain>.workers.dev/api/ping shows {"ok":true}.
