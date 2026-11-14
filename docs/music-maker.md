# Minz Studio — Music Maker

**Open:** https://minzo-vr.github.io/Minzos-Live-Chat/music-maker.html

Music Maker is a standalone Community Hub/Game Hub app, beside Minzify, Chat, Python Editor and the other applications. It is not one of the browser games and does not reuse Minzify playback or access Spotify.

## What works

- 92 playable, internally synthesised instrument presets: 15 keys, 16 guitars/strings, 8 bass, 14 winds/brass, 20 synthesiser/pad, and 19 drum/percussion sounds.
- Two-octave on-screen piano; click or tap to audition the selected track's instrument. On a desktop keyboard, use A W S E D F T G Y H U J K.
- Multi-track 16- or 32-step grid, with each activated step storing its own pitch; use the piano or Note selector to choose which note to add. Tap an already-active step again to clear it or change its pitch.
- Up to 12 tracks. Select a track on the left of the grid, then assign an instrument using the searchable, category-filtered library. Each track has independent volume, mute and solo.
- Transport controls for Play, Stop, tempo (50–220 BPM), swing, master volume, step length and demo song.
- Local browser auto-save plus Save locally, downloadable .json project, import .json project, and offline-rendered .wav export (1, 2 or 4 repetitions of the pattern).

## Quick start

1. In Community Hub, choose **Music Maker** from the main app launcher.
2. Tap **Demo Beat** then **Play** to hear an example, or start your own pattern using **New song**.
3. Select a track (e.g. Grand Piano). Choose an instrument from the left library. Tap the keyboard to choose a note, then tap steps in that track's sequencer to place them.
4. Change tempo, add tracks, mute/solo, and replay to build an arrangement.
5. Save locally, download a JSON project for later, or click **Export WAV** to render shareable audio.

## Limitations and privacy

- All sounds are **synthetic approximations**, not sampled grand pianos or licensed instrument recordings. An instrument may sound electronic compared with its acoustic counterpart.
- This version is a loop/pattern-based composer (16 or 32 steps, 12 concurrent tracks), not a full multi-minute DAW timeline with recorded vocals.
- It creates original sounds with the Web Audio API and **does not** download, stream, sample, or copy third-party tracks. No Spotify API, Cloudinary account or paid music subscription is required.
- Playback begins following user interaction because Safari and other browsers block unwanted autoplay. WAV export requires browser OfflineAudioContext support.
- Local save is per-browser/device, not a Firebase cloud project. Use **Download project** to share or move work. Clearing site data will remove local browser saves.
- The app's status messages report audio, saving and import errors. No files are uploaded to a server.

## Admin website controls

Music Maker uses the **music-maker** Hub availability and role-lock key. It appears under the main **Websites & apps** admin category, not **Individual games**. The repo's database.rules.json now includes this key in the two existing Firebase whitelists. Deployment of that rules file to live Firebase is separate and requires an authorised service account (via the existing workflow) or console publication. Preserve all other database rule sections.

## Files

- music-maker.html — self-contained responsive page structure and styling
- music-maker.js — instrument library, Web Audio synthesis, step sequencing, keyboard, local projects, import/export and WAV rendering
- index.html, hub-store.js, hub-icons.js — main launcher and App Store-style preview/icon
- hub-site-controls.js, database.rules.json — website admin access and role locks
