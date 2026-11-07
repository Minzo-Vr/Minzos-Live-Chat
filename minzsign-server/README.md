# MinzSign — Community Hub IPA Signing

MinzSign is a separate Community Hub app at \`/minzsign.html\`. It **really re-signs IPA files** using the open-source cross-platform \`zsign\` tool, a user-owned Apple .p12 signing certificate, and a matching .mobileprovision file. It does not provide "free certificates", auto-sign unsigned IPA files without credentials, or bypass Apple's installation policies.

## Current state

- The client app is usable on GitHub Pages for **local IPA format inspection**. It checks ZIP magic and for the \`Payload/*.app\` directory (not an antivirus or integrity check).
- The separate Node/Docker server is included, but **must be deployed and configured** before signing works. Until then the Sign button remains disabled and explains why.
- Authentication uses the same Firebase project as Community Hub. Accounts must sign in; anonymous users cannot upload.
- The server processes a certificate and profile temporarily, runs \`zsign\`, removes the original IPA and signing credentials, then keeps only the signed IPA behind a random, 15-minute expiring URL. The private key is never committed to GitHub.
- Only a validated \`ProvisionsAllDevices\` enterprise/in-house profile enables a Safari OTA-install manifest. Ad Hoc and development signed IPAs can be downloaded, but must use an eligible installation method. Neither path overrides Apple's device-trust checks.

## Deploy to Render (or your own isolated Docker host)

1. Deploy \`minzsign-server/Dockerfile\` as a **separate** Docker web service, not as GitHub Pages static code. Do not deploy the container on a shared untrusted host; users send signing private keys to this service.
2. Configure environment variables:
   - \`FIREBASE_PROJECT_ID=website-chat-80038\`
   - \`FRONTEND_ORIGIN=https://minzo-vr.github.io\` (adjust if the site has a custom domain; use the origin without path)
   - \`PUBLIC_BASE_URL=https://<your-actual-service-hostname>\` (the exact external HTTPS origin of your service)
   - \`PORT\` is assigned automatically by Render (defaults to 10000)
3. Check \`https://<service-hostname>/health\` returns \`{"ready":true,...}\`. This does **not** prove signing works; test against an app you own with a valid certificate and profile.
4. Set \`window.MINZSIGN_API_URL\` in the public \`minzsign-config.js\` to the *same* HTTPS origin. This is a public setting, not a secret. Confirm it is your own trusted service.
5. Merge the feature branch when you approve the changes. GitHub Pages then shows **MinzSign** in the hub menu. The \`render.yaml\` entry is a deployment blueprint, not proof the service has been deployed.

Local container command:

\`\`\`sh
docker build -t minzsign-server ./minzsign-server
docker run --rm -p 10000:10000 \
  -e FIREBASE_PROJECT_ID=website-chat-80038 \
  -e FRONTEND_ORIGIN=https://minzo-vr.github.io \
  -e PUBLIC_BASE_URL=https://your-real-server.example \
  minzsign-server
\`\`\`

\`/api/sign\` accepts a Firebase Bearer token, multipart fields \`ipa\` (.ipa), \`certificate\` (.p12), \`profile\` (.mobileprovision), and \`password\`. The response contains an expiring relative download URL; if \`ProvisionsAllDevices\` is true, it also includes an expiring manifest URL. Never expose those URLs publicly: possession grants access to the signed IPA for up to 15 minutes.

## Requirements and limits

- Apple requires valid signing assets; .p12 certificates contain sensitive private keys. Certificate/password uploads are **not end-to-end encrypted**: your server necessarily reads the key to sign. Use HTTPS and only trusted infrastructure. Keys are deleted from server disk after signing; the OS, hosting provider, or a compromised container could still see them during processing. Avoid production use without a security review.
- Ad Hoc signing requires a compatible App ID, signed profile, and registered device UDIDs. Enterprise in-house distribution is for employees of eligible organisations, not public app stores.
- The app has no pre-provisioned signing certificate and will not generate Apple certificates.
- File upload limit 250 MB. Each server instance allows one simultaneous sign and 6 requests per hour per IP. Instances with ephemeral disks will lose download links on restart.
- ZIP structure checking does not verify that uploaded apps are safe. Users are responsible for scanning third-party IPAs and having distribution rights.
- Complex IPA bundles with app extensions may need additional provisioning profiles, which this first version does not support.
- The signer's password is supplied to \`zsign\` as a command-line argument, so process administrators on the host can potentially see it while signing. Use an isolated trusted container; **do not** host for public users without additional hardening and an independent security review.
- In-house wireless installation depends on iOS trusting the certificate and on Apple network access. Newer iOS versions may require a restart to complete trust.
- Apple documentation: [Ad Hoc provisioning](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/), [distributing in-house apps](https://support.apple.com/guide/deployment/distribute-proprietary-in-house-apps-depce7cefc4d/web).
