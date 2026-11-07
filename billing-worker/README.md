# Chat+ payments — Stripe website + Apple iOS

**Status: code integrated, payments NOT LIVE.** The site has a gated Stripe test checkout button; the Capacitor iOS build includes a native Apple purchase/restore bridge. Both remain disabled until you configure and deploy the billing services. **Do not tell customers they can pay yet.**

## Pricing
- Website: existing **AUD 1.00/month Stripe sandbox** plan, `STRIPE_PRICE_ID` must reference a test-mode AUD 100 cents recurring monthly price.
- iOS: Apple subscription pricing comes from the App Store product/RevenueCat offering. Set your own App Store Connect price tier; do not promise an exact price until Apple approves/configures it.
- Website and iOS share the same Firebase UID and Plus access. Existing manually granted Plus/Admin roles are not intentionally removed by billing cancellation.

## 1. Website: Stripe + Cloudflare
1. In the connected Stripe **test-mode** account, create a recurring AUD 1/month Chat+ product/price. Note its `price_...` ID. Do not switch to live mode without separately approving production billing.
2. Deploy `billing-worker/` as its **own** Cloudflare Worker: `cd billing-worker && npm install && npx wrangler deploy`. Do not replace the Discord bot Worker.
3. Set `STRIPE_PRICE_ID` in the Worker's Cloudflare environment variables. Add secrets via `npx wrangler secret put NAME` for:
   - `STRIPE_SECRET_KEY` — Stripe test secret key
   - `STRIPE_WEBHOOK_SECRET` — signing secret for the **specific** Stripe webhook endpoint
   - `FIREBASE_SERVICE_ACCOUNT_EMAIL` and `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` — dedicated Firebase service account, securely stored; use minimum necessary database permissions
   - `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_SECRET_API_KEY` only if using the Apple webhook on the same Worker
4. Configure Stripe webhook endpoint `https://<worker-domain>/stripe/webhook`. Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. The Worker verifies the signature and only accepts Stripe **test** events.
5. Update `CHAT_PLUS_BILLING_WORKER_URL` in root `index.html` to the deployed **HTTPS** Worker origin (no trailing slash). The site checks `/health` before enabling checkout. Use Stripe test card details only in test mode.
6. Test checkout, webhook, subscription renewal, cancellation, billing portal, and returning from checkout. Check `chatRoles/<uid>/plus` becomes true after the webhook, not immediately after the browser redirect.

**Important:** The Worker uses a privileged service account to write `chatBilling/<uid>` and `chatRoles/<uid>`. **Never** add client `.write` permission for `chatBilling` or allow users to self-assign `chatRoles/plus`. In Firebase RTDB rules, add a sibling top-level `"chatBilling": {".read": false, ".write": false}` to make the intended restriction explicit; Admin SDK service account access bypasses client rules.

## 2. iPhone/iPad: Apple in-app purchases
1. You need an **Apple Developer Program** account, an App Store Connect app with matching bundle ID `com.minzovr.communitychat`, and the Paid Apps Agreement/tax/banking information as required.
2. Create a **monthly auto-renewable subscription** in an App Store Connect subscription group. Configure its price, descriptions, availability, review screenshot, and StoreKit sandbox testers.
3. Connect that app and subscription to **RevenueCat**, create the entitlement ID **`chat_plus`**, and create an offering with the subscription package.
4. In GitHub repository **Settings → Secrets and variables → Actions → Variables**, set `REVENUECAT_APPLE_PUBLIC_KEY` to the RevenueCat Apple public SDK key. The iOS workflow injects this into the bundled native app. This public key is not a payment secret.
5. In RevenueCat, configure webhook `https://<worker-domain>/apple/webhook` with Authorization `Bearer <your-secret>`. Save the same value as `REVENUECAT_WEBHOOK_AUTH` in Cloudflare. Also set `REVENUECAT_SECRET_API_KEY` so the Worker checks current server-side entitlement before granting access.
6. Rebuild and **sign** the iOS app with Apple provisioning. Current GitHub workflow generates an **unsigned IPA**; unsigned IPAs are not App Store-ready. Install via TestFlight/sandbox and test purchase, restore, renewal, expiry, and user switching. RevenueCat app user ID must equal the signed-in Firebase UID.
7. Apple billing must use StoreKit; the native iOS button **never** redirects to Stripe Checkout. App Store pricing/terms are shown by Apple on the purchase sheet. <https://www.revenuecat.com/docs/getting-started/installation/capacitor>

## 3. Security and production readiness
- The existing `chatRoles` database schema is used to unlock Chat+ (including emoji reactions). This avoids changing all existing role checks. The Worker records which Plus grants it owns and attempts to preserve manual Plus/Admin assignments.
- **Before production**, review concurrency and ownership logic: RTDB read/modify/write is not a transaction. Simultaneous admin role edits and billing events could conflict. Use transactional/ETag writes or a dedicated paid-entitlement role source before processing real payments.
- **Before production**, implement strict subscription ownership reconciliation for multiple Stripe subscriptions per UID, durable webhook idempotency/replay protection, rate limiting, a customer self-service billing recovery path, and Apple purchase transfers/account changes.
- **Before production**, verify Stripe test/live keys are isolated, add proper tax disclosures and refund policies, publish terms/privacy, confirm Apple App Review compliance, and perform security and on-device tests.
- Firebase Auth tokens are verified using Google's public signing keys; the Stripe webhook uses Stripe's verified raw-body signature; RevenueCat webhook requires a secret and checks entitlement status from RevenueCat's server.
- Never put Stripe secret keys, Firebase service-account keys, RevenueCat secret keys or webhook secrets in GitHub Pages, public HTML, GitHub Actions **variables**, or client-side JS.
- **No Apple or Stripe payments have been activated or tested as of this commit.** Configure accounts and run end-to-end sandbox tests before enabling live charges.

## Routes
`GET /health` checks Stripe test setup; `POST /checkout` starts Stripe Checkout with a Firebase bearer token; `POST /portal` opens Stripe Billing Portal; `POST /stripe/webhook` receives Stripe events; `POST /apple/webhook` receives RevenueCat events.
