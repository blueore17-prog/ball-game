# ball. with online challenges

Files:
- index.html: the whole game
- api/handle.mjs: the challenge API logic (saves challenges and results), shared by both hosts
- functions/api/[[path]].js: Cloudflare Pages entry point (data in Workers KV)
- netlify/functions/api.mjs + netlify.toml + package.json: the older Netlify setup (data in Netlify Blobs)

## Cloudflare Pages (current host)
1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git, pick this repo.
2. Build settings: framework preset None, build command empty, build output directory `/`.
3. Storage & Databases > KV > create a namespace, e.g. `ball-challenges`.
4. In the Pages project: Settings > Bindings > Add > KV namespace, variable name `CHALLENGES`, pick the namespace. Redeploy.
5. Check https://<project>.pages.dev/api/ping shows {"ok":true}.

Every push to main then deploys automatically.
