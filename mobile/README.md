# Community Chat mobile — Capacitor

This is a **native iOS and Android project generator** for the existing Community Chat website. It uses the original root `index.html` without replacing Firebase, Cloudinary, GIPHY, chat logic or settings. The mobile shell is bundled locally; the app still requires internet for Firebase and other services.

## Automatic builds on every update

GitHub Actions builds on **every push to `main`**, whether the change is to Community Chat, Shapes & Colours, Update Centre, a new app, or another repository file. You can also start it manually or publish a GitHub Release.

Open [Actions → Build Community Chat mobile apps](https://github.com/Minzo-Vr/Minzos-Live-Chat/actions/workflows/build-mobile.yml), open the latest successful run, and expand **Artifacts**. The build includes:

- `community-chat-ios-device-ipa-unsigned` — ZIP containing `community-chat-unsigned.ipa` for a **physical iOS device**. **This IPA is unsigned and cannot be installed until it is correctly signed.**
- `community-chat-ios-simulator-app-unsigned` — unsigned iOS Simulator `.app`, not usable directly on an iPhone or iPad.
- `community-chat-android-debug-apk` — Android debug APK for testing.

Every root-level public `.html` app (plus public root JS/CSS/images and supported asset folders) is copied to the mobile web bundle, so linked pages like `shapes-colours.html` and `update-centre.html` are packaged with `index.html`. Nested apps with additional asset directories might need those directories added to `mobile/scripts/prepare-web.mjs`.

The workflow automatically attaches the unsigned IPA and Android debug APK to **GitHub Releases when a Release is published**. Ordinary GitHub pushes produce **Actions artifacts**, not automatically published Releases. This distinction avoids creating a public Release for each code commit.

### To get a signed, installable IPA

This requires a one-time Apple signing setup with a distribution certificate, app provisioning profile (matching `com.minzovr.communitychat`), and appropriate Apple Developer Program access. Store signing material **only in encrypted GitHub Actions secrets**, not in source code or a public Release. The signing workflow can then archive and export an Ad Hoc IPA (for registered devices), or upload an App Store Connect build for TestFlight. Apple handles installation and updates through TestFlight if you choose that option.

**Until signing is configured, the automatically produced IPA is an unsigned build artifact; it is not a ready-to-install iPad app.**

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
