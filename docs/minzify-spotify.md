# Add Spotify search to Minzify

This optional feature is a **Spotify catalog search** that opens matching tracks on Spotify. It does **not** stream Spotify tracks for free, combine Spotify audio with Audius, use Spotify playback SDK, or expose a Client Secret.

## Configure

1. Open [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create or edit a Spotify app with **Web API** enabled.
2. Add this **exact Redirect URI** to the app allowlist and save it:
   \`https://minzo-vr.github.io/Minzos-Live-Chat/minzify-spotify.html\`
   If your web app runs at another domain, open that version of \`minzify-spotify.html\` and copy the Redirect URI displayed on the page instead.
3. Copy the **Client ID** from the dashboard. A Client ID is public; it is **not** the Client Secret. Never commit the Client Secret to GitHub or give it to users.
4. Choose either:
   - Site-wide: edit \`minzify-spotify-config.js\` and set \`window.MINZIFY_SPOTIFY_CLIENT_ID = "your-public-client-id";\`.
   - Personal testing: keep the config blank. Open the Spotify search page and paste your Client ID in its settings field. It saves the ID locally on that device.
5. Open Minzify, select **Spotify search**, tap **Connect Spotify**, and log in on Spotify's own site. The page redirects back and allows you to search tracks.

## Limitations (as of November 2026)

- Spotify Developer Mode requires an active **Premium** subscription on the developer account and generally allows **five authorized Spotify users per app**. Add testers in Spotify Dashboard's User Management / allowed users settings. Apps open to the public require Spotify's extended quota access and approval, which isn't normally offered to hobbyist projects.
- Spotify limits development-mode search to **10 results per call**. Minzify requests 10.
- The new feature returns metadata and links; clicking **Open in Spotify** opens the official Spotify website/app. Spotify's API does not provide unrestricted raw audio files.
- The original Minzify Audius search/player remains unchanged. Search Spotify on its separate page.
- The app uses **Authorization Code + PKCE**, the appropriate OAuth flow for client-side browser apps. No Client Secret or backend is required for that flow.
- Spotify OAuth access/refresh tokens are saved to the current browser tab's session storage and can be removed by clicking **Disconnect on this device**. Disconnect clears local tokens; it does not revoke Spotify's grant on other devices.
- New users are not automatically added to a Spotify development-mode allowlist. Even with a published Client ID, not every visitor to Community Hub can use Spotify API features.

Official docs:
- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- https://developer.spotify.com/documentation/web-api/reference/search
