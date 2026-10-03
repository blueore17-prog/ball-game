# ball. with online challenges

Files:
- index.html: the whole game
- netlify/functions/api.mjs: the challenge API (saves challenges and results in Netlify Blobs)
- netlify.toml: tells Netlify where the site and the function are
- package.json: lists the one library the function needs (@netlify/blobs)

Deploy with GitHub (once), then every push updates the site:
1. Create a new GitHub repository and upload these files, keeping the folders.
2. In Netlify, open the project, go to Project configuration > Build & deploy > Link repository, and pick the repo.
3. Leave the build settings as they are (netlify.toml sets them) and deploy.
4. Check https://<your-site>.netlify.app/api/ping shows {"ok":true}.
