# Community Browser (separate Render service)

This is a deployment wrapper for the upstream [Mercury Workshop Scramjet-App](https://github.com/MercuryWorkshop/Scramjet-App). It does **not** modify Community Chat's `index.html`, Firebase, or any existing features.

## Deploy to Render
1. Merge the reviewed pull request into `main`.
2. In [Render](https://dashboard.render.com/), create a **Blueprint** using this GitHub repository and the root `render.yaml` (or create a Docker Web Service with root directory `scramjet-browser`).
3. Review service details and deploy. Render provides the actual `https://...onrender.com` address after deployment.
4. Open the address, test browsing, and only then link it from Community Chat.

## Add a link to Community Chat
When Render has issued the URL, use this markup in the chat UI (replace the example URL):

```html
<a href="https://YOUR-RENDER-SERVICE.onrender.com" target="_blank" rel="noopener noreferrer">🌐 Community Browser</a>
```

Do not use the example hostname as a live link. No browser URL can be known before the Render service is created.

## Notes
- The Docker build pulls the official upstream Scramjet-App at build time. Pin the upstream commit for repeatable production builds after testing.
- The app listens on `0.0.0.0` and uses Render's `PORT` variable.
- Free Render services may spin down when idle.
- A proxy cannot guarantee access to all sites or bypass every restriction.
- This service is separate from Community Chat, and no Firebase credentials are needed.
