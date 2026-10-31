# Community Chat mobile — Capacitor

This is a **native iOS and Android project generator** for the existing Community Chat website. It uses the original root `index.html` without replacing Firebase, Cloudinary, GIPHY, chat logic or settings. The mobile shell is bundled locally; the app still requires internet for Firebase and other services.

## GitHub Actions builds

Open **Actions → Build Community Chat mobile apps → Run workflow**. The Android job creates a downloadable **debug APK** artifact. The iOS job generates an Xcode project and builds an **unsigned iOS Simulator .app**, **not a sideloadable IPA**. A physical-device IPA requires a macOS signing workflow with an Apple certificate and provisioning profile for your device (or a sideloading-compatible signing process). Do not upload Apple private keys to this repository.

## Local native projects

With Node 22 installed, from `mobile/` run:

```sh
npm install
npm run native:android   # requires Android SDK
npm run native:ios       # requires macOS + Xcode
```

Then open `mobile/android` in Android Studio or `mobile/ios/App/App.xcworkspace` in Xcode. After changing the web app, run `npm run sync` to refresh the bundled site.

## Compatibility checks before distributing

- **Authentication:** Google and Discord OAuth/popups and redirects may fail inside a native WebView. Capacitor's local origin differs from GitHub Pages; configure Firebase Authorized Domains and the relevant OAuth redirect/deep-link strategy, preferably using a system browser and native callback. Test sign-in, account switching and sign-out on actual devices before release. Do **not** blindly add broad wildcard redirect origins.
- **Browser features:** Test uploads, camera, microphone, calls/screen sharing, embedded Scramjet, file downloads, notifications, fullscreen and external links. Some features need native plugins, entitlements, permissions, and platform-specific handling. Web push/service workers do not automatically become native push notifications.
- **App icon/splash:** Native icon and splash assets are not yet configured. Add properly sized platform assets before distribution.
- **iOS:** This workflow intentionally does not claim to produce an installable signed IPA. Signing is a separate step.
- **Android:** The APK is a debug build intended for testing, not Play Store release.

No existing web application files are changed by this setup. Generated `ios/`, `android/` and `www/` are excluded from Git to keep the repository manageable; GitHub Actions regenerates them deterministically.
