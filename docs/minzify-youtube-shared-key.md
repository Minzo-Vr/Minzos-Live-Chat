# Connect one YouTube API key for everyone on Minzify

Minzify uses the official YouTube Data API v3 to search **music-category videos** and plays selections in the official YouTube video embed. Visitors do **not** need to create or enter their own API keys.

## Site owner setup (one time)

1. Sign into [Google Cloud](https://console.cloud.google.com/) and select the intended project.
2. [Enable YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
3. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials) and create or locate a **Google Cloud API key** (not an OAuth client ID, Spotify key, or Jamendo key).
4. Restrict the key **before** putting it on a public website:
   - **Application restrictions:** Websites / HTTP referrers.
   - Allowed entries: `https://minzo-vr.github.io` and `https://minzo-vr.github.io/*`.
   - **API restrictions:** Restrict key > **YouTube Data API v3** only.
5. Edit [minzify-youtube-config.js](../minzify-youtube-config.js) on the **main** branch, replacing only the empty string:
   `window.MINZIFY_YOUTUBE_API_KEY = "YOUR_RESTRICTED_GOOGLE_API_KEY";`
6. Save the file and refresh [Minzify YouTube Search](https://minzo-vr.github.io/Minzos-Live-Chat/minzify-youtube.html). Visitors can search music videos directly on that page.

## Important facts

- **A browser JavaScript key is public** and visible to visitors and GitHub readers; never commit OAuth client secrets, service account keys or unrestricted API keys. HTTP referrer restrictions help protect browser API keys. For a truly private key use a properly secured server-side proxy, instead.
- **Quota is shared** by all visitors. Google can change daily limits; check your project's YouTube Data API quota in Cloud Console. A busy public site may exhaust the search quota.
- The site will show a clear message and a link to YouTube Music if no owner key has been configured or Google denies the requests. It never asks visitors to connect a key.
- YouTube Data API v3 does not provide the full YouTube Music catalog or extracted audio. Playback uses YouTube's official embedded player.

References:
- https://docs.cloud.google.com/docs/authentication/api-keys
- https://developers.google.com/youtube/data/reference/rest/v3/search/list
