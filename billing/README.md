# Community Chat — Chat+ subscriptions (website + native iOS)

This repository now contains a **secure subscription implementation**, but no payment can be charged until its account credentials and store products are configured. **The website checkout is disabled by default**, and Apple In-App Purchase also stays unavailable until a signed app build contains the correct Apple product configuration.

- Website: **Stripe Checkout**, A$1.00 per month, recurring. Starts in **test mode**.
- Native iOS/iPadOS Capacitor app: **Apple In-App Purchase (StoreKit via RevenueCat)**. Apple's App Store displays the actual price and renewal terms; do not promise that its configured price is identical to the web price.
- Android: checkout intentionally disabled until Google Play Billing is implemented.
- Both payment paths grant a **server-verified billing entitlement** under `chatBillingEntitlements/{firebaseUid}/{stripe|apple}`. Manually assigned Plus or Admin roles remain unchanged.
- Signed-in Chat+ access uses an active entitlement with an expiry timestamp in the future. Neither a Stripe success redirect nor a client-reported Apple purchase grants access.

## Payment backend

File: [worker.js](./worker.js). This is a **separate** Cloudflare Worker from the Discord bot. It has been deployed to **`community-chat-billing`**, with a workers.dev address of **`https://community-chat-billing.kobefalzon8.workers.dev`**. The GitHub Pages `chat-plus-config.js` file points to that address. All payments still remain disabled until configuration is complete.

Routes:
- `GET /health` — public configuration readiness without secrets.
- `POST /checkout` — verify Firebase ID token, check the configured Stripe price, create Stripe Customer + Checkout Session.
- `POST /portal` — authenticated Stripe Billing Portal session for the same customer.
- `GET /status` — authenticated entitlement status.
- `POST /stripe-webhook` — verify Stripe's HMAC signature from the original body, query the current subscription and update Firebase.
- `POST /revenuecat-webhook` — verify RevenueCat HMAC signature, query its server API, validate Apple product and store and update Firebase.

**Worker secrets (never commit them):**
- `STRIPE_SECRET_KEY` — starts `sk_test_` in test mode or `sk_live_` in live mode.
- `STRIPE_WEBHOOK_SECRET` — starts `whsec_`, from the Stripe webhook endpoint.
- `FIREBASE_SERVICE_ACCOUNT` — complete **JSON string** of a service account from the **website-chat-80038** Firebase project, with least-privilege access to the Realtime Database.
- `REVENUECAT_SECRET_API_KEY` — RevenueCat secret API key, stored only on the server.
- `REVENUECAT_WEBHOOK_SECRET` — RevenueCat Pro webhook **HMAC signing secret**. The backend explicitly requires a verified HMAC signature and will reject unsigned notifications.

**Worker environment variables:**
- `STRIPE_PRICE_ID` — test-mode or live-mode Stripe recurring **AUD $1.00/month** Price ID (`price_...`).
- `STRIPE_MODE` — `test` (default) or `live` (only after live payments are explicitly ready).
- `REVENUECAT_IOS_PRODUCT_ID` — exact App Store Connect monthly subscription product identifier.
- `REVENUECAT_ENTITLEMENT_ID` — `chat_plus` (must match RevenueCat dashboard).
- `PUBLIC_SITE_URL` — `https://minzo-vr.github.io/Minzos-Live-Chat/`.
- `BILLING_FIREBASE_RULES_READY` — **`true` only after** the merged Firebase security rules are published and verified (owner-read and no client-write). Both web and Apple payment buttons intentionally stay disabled without this interlock.
- `REVENUECAT_ALLOW_SANDBOX` — omit or `false` in production; set `true` in an isolated test environment only.

Configure the Worker route(s) above, then register the Stripe webhook endpoint `https://YOUR-WORKER/stripe-webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` (the Worker refetches the current subscription and ignores unsupported events). The webhook must be configured for the appropriate Stripe test/live environment.

Stripe **Billing Portal** must also be enabled in your Stripe dashboard; cancellation takes effect when paid access expires.

Configure the RevenueCat webhook as `https://YOUR-WORKER/revenuecat-webhook` with **HMAC signing enabled** using its configured secret. The Worker deliberately does **not** grant Chat+ based solely on a webhook's `app_user_id` and entitlement claims; it calls RevenueCat's API and checks the exact configured Apple product and active subscription period.

## Firebase Realtime Database rules

Run the included [rules merge utility](./merge-firebase-rules.mjs) against a **backup** of the currently published rules:

```sh
node billing/merge-firebase-rules.mjs firebase-rules-backup.json firebase-rules-with-chatplus.json
```

**Review the output diff before publishing.** The utility adds `chatBillingEntitlements/{uid}` with only owner-read access, blocks client writes to it and to `chatBillingPrivate`, and extends *existing Plus checks* to include paid Stripe/Apple entitlements that have not expired. It preserves the rest of your rules including chats, rooms, moderation, roles and MultiBuilder.

**Do not overwrite your current Firebase rules with a partial snippet.** The merger updates a full JSON rules backup and does not publish anything automatically. The Worker uses its own Firebase service account and bypasses client rules for billing updates. Test that a regular user cannot write entitlements directly.

If you added the `chatMessageReactions` rules, the utility also expands their Plus checks to include server-verified paid subscriptions.

## Website activation

Deploy the billing Worker with its own URL and secrets. Then edit the **public** root [chat-plus-config.js](../chat-plus-config.js) file to set:

```js
window.COMMUNITY_CHAT_PLUS_BILLING_API="https://YOUR-VERIFIED-WORKER-URL";
```

This URL is public. **Never** put Stripe secret keys, Firebase service account credentials or RevenueCat secret keys in that file or any GitHub web source.

On the Community Chat Settings page, the Subscribe button probes `/health` and remains disabled unless the Worker reports Checkout configured. A signed-in browser will be redirected to Stripe's hosted Checkout; its return does **not** unlock Plus until the verified webhook updates the database.

Start with test mode. Only switch to Stripe live keys, matching live Price ID and live webhook secret after a successful sandbox round trip and confirming subscription cancellation/expiration handling.

## Native Apple In-App Purchase activation

The existing mobile bundle is Capacitor **7**; [mobile/package.json](../mobile/package.json) includes `@revenuecat/purchases-capacitor` compatible with it. The iOS app also includes [native-billing.js](../mobile/native-billing.js) and the Restore Purchases button.

1. Enroll in the Apple Developer Program, configure the App Store Connect app and **paid-app agreements, banking, and tax** details. Use the existing bundle ID `com.minzovr.communitychat`.
2. Create an **auto-renewable monthly subscription** in App Store Connect. Choose Apple's monthly price tier (this need not equal A$1.00), add subscription disclosures/localizations, and configure StoreKit test/sandbox accounts.
3. Configure a RevenueCat app linked to App Store Connect with the In-App Purchase key; create the **`chat_plus` entitlement** and a current offering containing the matching monthly product.
4. In the GitHub repository's **Actions variables** (not secrets, since these are public SDK and product identifiers), set:
    - `REVENUECAT_APPLE_PUBLIC_KEY` = RevenueCat Apple *public* SDK API key (starts `appl_`).
    - `REVENUECAT_IOS_PRODUCT_ID` = the exact App Store Connect monthly product ID.
5. Configure the corresponding Worker values (`REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_IOS_PRODUCT_ID`, `REVENUECAT_ENTITLEMENT_ID=chat_plus`) and RevenueCat HMAC webhook.
6. Produce a **signed** iOS build via an Apple provisioning profile. The current GitHub Actions IPA is **unsigned**, cannot be installed normally on an iPad, and will not function as an App Store-distributed purchase app without proper signing and App Store Connect configuration.
7. Test purchase, restore, cancellation, renewal, and expiry with sandbox/TestFlight. Test with the same Firebase account on web and iPad to verify access follows the account. Do not enable live charging until this succeeds.

**Why not Apple Pay?** Apple's in-app purchase requirements apply to Chat+ digital features inside the native app. Apple Pay for physical goods is not a substitute for StoreKit.

**Payment activation is not automatic:** Worker deployment only publishes code. It does not create a Stripe product, enable the RevenueCat webhook, set Apple subscription pricing, sign the IPA, or publish Firebase rules. Do not configure the readiness interlock until both the backend credentials and Firebase security rules are verified. RevenueCat signed webhooks require a supported plan with HMAC signing.

### Important safety notes

- Cloudflare Worker secrets are required to verify the user's Firebase token and securely update billing states.
- Billing entitlements expire automatically in Firebase security checks based on `expiresAt` and the rules' `now`. Webhook delivery delays never justify unlocking features based on client claims.
- Existing manual Plus/Admin roles are never removed by billing webhook handling.
- Changing repo files triggers an automatic unsigned IPA/APK build; no payment, Apple app registration or account setup is performed by a GitHub commit.
- At A$1.00/month, factor in Stripe/Apple transaction fees and tax, which might be significant relative to the subscription price.
