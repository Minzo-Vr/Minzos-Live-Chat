# Community Hub — App Installer

Game Hub URL: https://minzo-vr.github.io/Minzos-Live-Chat/app-installer.html

App Installer is a separate Game Hub app, not a browser game or a replacement for Minz Apps. It offers official downloads, a signed iOS install option when one is configured, and optional signing of your own IPA. It uses original Community Hub styling, not Delta's files or branding.

## Available now

- Android APK download links to the repository's existing Mobile-App GitHub Release.
- Browse IPA releases links to GitHub Releases. An unsigned IPA download is not automatically installable on iOS.
- The custom downloader opens a direct HTTPS .ipa or .apk URL. It does not verify, sign, or install the file.

## iPhone / iPad one-tap install

1. Prepare a properly signed IPA under an Apple-supported distribution method. Enterprise/in-house signing is for eligible organisations' internal apps, not general public distribution.
2. Host that IPA and the corresponding OTA manifest (.plist) on HTTPS, with correct bundle identifier, version, title and package URL.
3. Set MINZ_INSTALLER_MANIFEST_URL in app-installer-config.js to the real HTTPS manifest URL.
4. Deploy GitHub Pages. The install button then launches the system itms-services manifest flow from Safari. The device still verifies the code signature, provisioning and trust.

Default: MINZ_INSTALLER_MANIFEST_URL is empty, so one-tap iOS install truthfully reports Not configured. The app cannot create valid Apple signing credentials or provide universal free installation.

## Connect the existing MinzSign server

1. Deploy minzsign-server/ to an isolated trusted HTTPS host; see minzsign-server/README.md for full settings, security limitations and key management.
2. Set FIREBASE_PROJECT_ID, FRONTEND_ORIGIN and PUBLIC_BASE_URL for that server. Confirm /health returns ready: true.
3. Set window.MINZSIGN_API_URL inside minzsign-config.js to that service's HTTPS origin only.
4. Sign into a full non-anonymous Game Hub account. Under App Installer → Sign an IPA, upload your own .ipa, .p12, .mobileprovision and certificate password.
5. The service returns an expiring signed IPA download. It returns an Install signed IPA in Safari link only for its eligible in-house profile branch; Ad Hoc and development profiles require different supported installation methods.

Important: the backend must temporarily read the private key and password. Deleting files afterwards is not equivalent to end-to-end encryption. Do not upload signing credentials to an untrusted host or commit them to GitHub. Use only software and signing assets you own or are authorised to use.

## Admin controls and Firebase rules

App Installer uses the app-installer key in hub-store.js, hub-site-controls.js and database.rules.json. Admins can disable or role-lock it once the updated rules are live.

The repository contains an existing auto-deployment workflow (.github/workflows/publish-firebase-rules.yml) that attempts to publish rules after changes to database.rules.json. It only succeeds if the Firebase service-account secret and permissions are configured correctly. Check the workflow run. If it fails, a project owner must publish the full updated database.rules.json in the Firebase Realtime Database console; do not replace the existing rules with a short snippet.

## Apple references

- https://support.apple.com/en-au/118254
- https://support.apple.com/guide/deployment/distribute-proprietary-in-house-apps-depce7cefc4d/web
