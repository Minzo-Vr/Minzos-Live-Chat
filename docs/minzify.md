# Minzify 🎧

Minzify is a standalone, free-to-use music discovery and listening app inside Community Hub.

**Launch:** https://minzo-vr.github.io/Minzos-Live-Chat/minzify.html

## What works

- Search artists, songs and music genres from the public [Audius](https://audius.co/) catalogue.
- Stream entire tracks that artists have chosen to make available to third-party players.
- Explore trending tracks and browse genre shortcuts (Electronic, Hip-Hop, Lo-Fi, Pop, Rock, R&B).
- Play/pause, previous/next, seek, volume, mute, shuffle, repeat queue or repeat track.
- Like songs, browse recently played and create or delete personal playlists.
- Add tracks to playlists, browse the play queue and open original track pages on Audius.
- Fully responsive layout for phone, tablet/iPad and desktop.
- Included automatically in the existing Capacitor IPA/APK builds by mobile/scripts/prepare-web.mjs.

**Important:** Minzify does **not** provide every song on Spotify or bypass Spotify Premium. The content is provided by Audius artists, who can choose not to allow third-party streaming. Some tracks may be stream-gated, unavailable or removed; Minzify filters known locked content and displays errors when a stream is unavailable. No files are downloaded or rehosted.

## Data sources and permissions

The UI calls Audius's read-only public REST API at https://api.audius.co/v1, falling back to the public discovery endpoint if necessary. No Audius secret or user password is stored in code. Public API access and artist streaming rights are controlled by Audius; its platform requirements, quotas and endpoints may change.

Search: GET /tracks/search?query=...
Home: GET /tracks/trending?limit=35&time=week
Player: GET /tracks/{track_id}/stream

API documentation: https://docs.audius.co/api/

Likes, recent songs and custom playlists are stored only in browser or mobile WebView localStorage. They are **not** connected to Firebase, shared with other Community Hub accounts or backed up to another device. Clearing local browser/app data can delete saved playlists. Songs cannot be played offline.

## Files

- minzify.html — main accessible app UI and player
- minzify.css — responsive visual design
- minzify.js — search, catalog, playback and local collection

The Community Hub interface selector links to minzify.html with no authentication or Chat+ membership required. This app does not monetize or route payments through Stripe or Apple.

## Testing and limitations

HTML links, element IDs and JS syntax were verified on commit. The API was checked against the official Audius documentation. Live network playback has **not** been verified in a physical browser or on an iPad; test artist streaming on your device after GitHub Pages publishes.

Browsers restrict autoplay with audio. Visitors must tap the Play button; iOS background/screen-off playback may be limited by the operating system.
