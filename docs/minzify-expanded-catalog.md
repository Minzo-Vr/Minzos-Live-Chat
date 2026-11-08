# Minzify expanded music catalogue

Minzify now supports a broader set of **live, artist-shared songs** without storing music files. This is not a licensed on-demand catalogue of every commercial song.

## Available immediately: Audius

The existing Audius integration retrieves additional tracks from these real API endpoints:

- `/tracks/trending?time=week&limit=65`
- `/tracks/trending/underground?limit=45`
- `/tracks/latest?limit=45`
- `/tracks/search?query=...&limit=90`

New sections in Minzify's home page display trending, recent releases, and underground independent artists, with a `Show more songs` control. Genre filters now include more categories. Songs remain live streams hosted by Audius. If APIs fail, the app displays an informative error. Tracks are not embedded in the GitHub repository.

## Optional Jamendo support

Jamendo is a second, separate platform for streaming independent music. The Jamendo API requires your **own approved read-only Client ID**, registered at https://devportal.jamendo.com/ .

1. Create a Jamendo app and review the API terms for your website and whether it is commercial.
2. Open `minzify-jamendo-config.js` and replace the empty string with **your** Jamendo Client ID:
   `window.MINZIFY_JAMENDO_CLIENT_ID = "YOUR_APPROVED_CLIENT_ID";`
3. After the updated site is deployed, the Jamendo discovery section and combined search activate automatically.
4. Jamendo song metadata, image and streams are fetched through its official `https://api.jamendo.com/v3.0/tracks/` and `tracks/file` endpoints. A `j-123` ID prefix prevents collisions with Audius favorites.
5. Jamendo's test Client ID from documentation **must not** be used for the production website.
6. If the ID is missing, all Jamendo functionality stays disabled. Audius discovery, likes, and the existing playlists continue to work.

Jamendo limits read-only free API calls and may restrict monetized use; review its terms and seek the appropriate approval for a public/commercial application.

## What this does not do

- It does not extract Spotify, Apple Music or YouTube audio.
- It does not allow playing every mainstream/popular copyrighted song for free.
- Spotify search remains separately available at `minzify-spotify.html`; it links to Spotify and does not directly stream Spotify's audio.
- It does not make claims about how many different tracks each service will return at runtime.

References:
- https://docs.audius.co/api/
- https://developer.jamendo.com/v3.0/tracks
- https://developer.jamendo.com/v3.0/authentication
