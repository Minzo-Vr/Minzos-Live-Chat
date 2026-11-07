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

## Import and reuse files inside the installed IPA / Android app

The mobile build now installs the Capacitor 7-compatible native file picker and injects a **native-only Files bridge** into bundled pages. The original GitHub Pages website keeps its browser file picker.

In **Shapes & Colours**:

1. Tap **📦 Import 3D** to pick `.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.ply` or `.dae` from the device Files picker. Use a self-contained `.glb` for best results.
2. Tap **Load JSON** to load a saved scene; while in Yeeps Mode, tap the **Yeeps ZIP** picker to load `.zip` blocks. The first-person avatar GLB picker also uses native Files.
3. Tap **📂 My Imports** to reopen or share/delete copied files. The importer tries an on-device file copy first to avoid large base64 transfers. If the OS denies copying, smaller files use a limited in-memory fallback. A file can still be imported into the current scene even if a reusable copy could not be retained.
4. Tap **Save** to store the current scene as JSON in the app's `Documents/CommunityHubImports/` folder. Saved JSON scenes can be reopened from My Imports or exported with the system Share sheet.

On iPhone/iPad, the generated Xcode `Info.plist` enables **UIFileSharingEnabled** and **LSSupportsOpeningDocumentsInPlace**, making the app's Documents folder available from **Files → On My iPhone/iPad → Community Chat** on supported iOS installations. On Android, app-managed documents are available from the in-app My Imports manager.

**Persistence:** These files remain after normal signed app updates with the same bundle ID, but can be deleted by uninstalling the app or clearing app data. They are stored on that device, **not automatically synced** between the website, iPad and Android. To move files between devices, use the Share button or transfer them through Files.

**Limits:** File selection is limited to supported extensions and at most 200 MB. If direct OS copying fails, only files up to 20 MB can be kept as reusable copies via the fallback. Very large assets can still strain device RAM; external `.gltf` textures/dependencies are not automatically bundled. Local imported 3D models aren't automatically shared to other MultiBuilder users; that needs a separate secure shared-asset system. Existing chat attachments continue to use their platform file input and Cloudinary upload flows.

This feature is part of **new native IPA/APK builds only**. Existing installed builds must be rebuilt/reinstalled as an update. A produced **unsigned IPA still needs Apple signing** before it can run on a real iPhone or iPad.

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
