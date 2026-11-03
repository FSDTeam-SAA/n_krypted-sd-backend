# Signature Dish agreed-feature implementation — 2 November 2026

This tracks the supplied Google Doc and its highlighted screenshots against the current local source. The user's update replaces Apple Maps with Google Maps throughout the map flows. Apple ID remains an account-login option.

## Feature coverage

| Agreed area | Implementation in this update |
|---|---|
| iOS / Android | Flutter project, native Maps and login plugin configuration; Android compilation checked. iOS compilation needs macOS/Xcode. |
| Discovery | Search/city/cuisine, rating/price/nearest ordering, distance/rating/price-class/open-now/tag filters; corrected geospatial pagination and combined filters. |
| Restaurant cards | Lead Signature Dish image, restaurant identity/customer rating, km/miles, approximate walking time, up to three clickable dish previews. |
| Maps | Google Maps SDK in mobile and JavaScript map in dashboard; Google geocoding through the backend; walking directions open Google Maps. OpenStreetMap/Leaflet dependencies removed. |
| Restaurant profile | Cover selection, description, interior/exterior/other galleries, ten-photo total, contact links, weekly opening hours, timezone, menu and opening preview. |
| Signature Dishes | Three-signature limit, separate photos/description/price/customer rating/review count, badge, labels, lead-image selection and applicable promotions. |
| Customer reviews | Verified visit date/time/party size, detailed comment/stars, dedicated My Reviews history, admin editing/deletion and hide/unhide moderation. |
| Team reviews | Admin creation with separate team identity/badge; global and per-restaurant admin visibility; customer averages remain separate. |
| Deals/promotions | Restaurant or dish target, start/end dates, active switch, banner upload/URL, text, percentage/amount discount and customer display. |
| Dessert/coffee | Existing post-review recommendation flow connected to corrected nearby discovery; requires matching restaurant data and permitted GPS location. |
| Health/safety | Admin-managed notice/comment/disclaimer, customer profile display; no invented health claims are supplied. |
| Coming soon | Opening date management and existing upcoming discovery/profile previews. |
| Food labels | Default dietary/allergen/new/spicy labels, admin-managed vocabulary and dish assignment/filtering. |
| Accounts | Existing email account/profile/favorites; Google/Apple login and authenticated provider linking with signed-token verification. |
| Admin panel | Cities, labels, restaurants/photos/dishes, moderation, promotions, Team Reviews, safety and public contact/social settings. |
| Rich text | Dashboard description/legal editors support bold/italic/paragraphs/alignment; sanitized backend content and formatted app/dashboard rendering. |
| Image management | Lead-image selection, capped galleries, fixed presentation ratios; new Cloudinary uploads standardized to 1200×900, avatars to 512×512. Existing photos are retained. |
| Legal/information | Terms, Privacy, Impressum, contact details and configured Instagram/TikTok links. Legal/business copy is supplied by the administrator. |
| Owner statistics | Mobile owner dashboard retained; actual restaurant views and viewer activity replace the previous checked-in-customer mapping. |

Mobile version is **1.0.0+7**. The independent review also preserves formatting when mobile descriptions are unchanged, keeps the selected lead photo stable across edits, preserves all cuisine values, expires visible offers automatically and retains map permission/settings and live-GPS lifecycle handling.

## New dashboard locations

- **Inhalte & Angebote** (`/content-management`): Städte, Labels, Angebote, Gesundheit & Sicherheit, Team-Bewertungen, Kontakt & Social Media.
- **Impressum** (`/impressum`): formatted legal content.
- Restaurant forms: contact, cuisine, timezone, weekly hours, opening date, offers, photo sections and lead-image selection.
- Dish forms: labels, description formatting and lead-image selection.
- Restaurant review list: hide/unhide alongside edit/delete.

The four statistics shown in the client's screenshot belong to the Flutter **owner dashboard**, backed by API data. Approved owners land there after login; users with pending/rejected restaurants use the approval workspace.

## Compatibility and existing data

The clients continue to use `/api`; `/api/v1` remains available. Deploy the backend before distributing the updated dashboard/mobile build. No production environment file or database has been changed by this implementation.

The user's latest local-development setting comments out the production mobile default and uses `http://10.0.2.2:5000/api` for the Android emulator. Debug/profile Android builds allow that local HTTP connection. Set `API_BASE_URL` to the deployment HTTPS base when preparing a customer build; physical devices require the computer's reachable LAN address for local testing.

Existing restaurants, photos and dishes are retained. Owners of restaurants with more than ten existing photos must select the ten they want before saving a replacement gallery. The implementation does not silently remove existing photos. Only the first three active signature dishes are featured for legacy data with extra signatures.

Restaurant discovery price is derived from active dish prices. `scripts/sync-catalog-prices.js` previews existing price differences and oversized galleries using the configured database. It is **read-only by default**; `--apply` updates derived prices after review and never removes photos. This script and the demo seeder have not been run against production.

## Configuration required for live Maps/login

The workspace does not contain configured Google Maps or Google/Apple login project IDs. Implementation and compilation do not create those provider resources or credentials.

### Backend

Add these values to the deployment environment, using `.env.example` as the reference:

- `GOOGLE_MAPS_SERVER_KEY`: restricted server key for Google Geocoding API. Enable billing and that API on the owning Google Cloud project.
- `GOOGLE_CLIENT_IDS`: comma-separated accepted Google ID-token audiences (normally the web/server OAuth client ID used by mobile).
- `APPLE_CLIENT_IDS`: comma-separated iOS bundle ID and Android Apple Service ID as applicable.
- `APPLE_ANDROID_PACKAGE`: actual Android application ID; currently defaults to `com.example.n_krepted_flutter`.

Backend verification checks issuer, audience, signature, expiry and verified email. Apple additionally requires a short-lived single-use server nonce. Linking requires the existing authenticated account; email matches alone do not grant access to an existing account. Public admin registration is denied on both API surfaces; existing admins remain usable.

### Dashboard

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to a browser key restricted to the dashboard origin, with Maps JavaScript API enabled. Keep server geocoding keys on the backend. Existing `NEXT_PUBLIC_BASE_URL`, `NEXTAUTH_URL` and `NEXTAUTH_SECRET` settings still apply; see `.env.example`.

### Android

1. Configure a Google Android OAuth client for the app's actual package ID and debug/release SHA fingerprints. Configure the server/web OAuth client ID used for ID tokens.
2. Enable Maps SDK for Android and supply its restricted key via `GOOGLE_MAPS_ANDROID_KEY` environment variable or the same Gradle property name.
3. Copy `config/build.example.json` to ignored `config/build.local.json`. Set `API_BASE_URL`, `GOOGLE_MAPS_ENABLED=true` and `GOOGLE_SERVER_CLIENT_ID`.
4. For Apple login on Android, configure an Apple Service ID/domain and registered HTTPS return URL. Set `APPLE_SERVICE_ID` and `APPLE_REDIRECT_URI` to the deployed `/api/auth/apple/callback` URL. The callback returns to the fixed Android package and the backend validates the signed identity before changing the app session.
5. Build a debug APK with `flutter build apk --debug --dart-define-from-file=config/build.local.json`. A store release also needs the project's release keystore/signing configuration; the existing project uses debug signing and is not being represented as store-ready.

### iOS

1. Use macOS/Xcode; install pods and prepare a real signing/provisioning profile with Sign in with Apple enabled.
2. Copy `ios/Flutter/ProviderKeys.example.xcconfig` to ignored `ProviderKeys.xcconfig`. Set `GOOGLE_MAPS_IOS_KEY` and `GOOGLE_REVERSED_CLIENT_ID`.
3. Set `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_SERVER_CLIENT_ID` in the Dart build configuration. Restrict the Maps key to the actual iOS bundle ID and enable Maps SDK for iOS.
4. The project now targets iOS 15+ to support the selected native dependencies. Confirm this minimum version is acceptable before release.
5. Build/archive with the same Dart configuration, upload a fresh TestFlight build, and retest on an iPhone. This cannot be performed on the current Windows machine.

Without provider configuration, map/login failures are handled visibly; empty keys are not replaced with fabricated credentials. Google Maps direction URLs can still open externally without a Maps API key.

## Verification and release gate

Final local verification after three independent agent reviews:

- Backend: **38 tests passed** across three suites, using temporary MongoDB instances only. Includes signed social identity verification/linking, Apple nonce/callback, public admin-registration denial, geospatial pagination/sorting, promotion expiry, content permissions, concurrent view deduplication, category/asset preservation and moderation aggregates/visibility across both API surfaces.
- Dashboard: **4 multipart contract tests passed**, ESLint passed and Next.js production build passed with all new routes.
- Flutter: **38 tests passed**, covering existing flows plus formatting preservation, cuisine/lead-image round trips, promotion expiry and narrow-screen presentation. Final Dart analysis of `lib` and `test` reported **no issues**. Android debug compilation passed from the final local-API source after regenerating a stale native-assets hook cache; output is `n_krepted_flutter/build/app/outputs/flutter-apk/app-debug.apk`.

These are local checks. Real provider configuration, production deployment, iPhone testing and the unseen TestFlight comments remain release requirements below.

Before client delivery:

- Configure provider projects/keys and run real Google Maps, geocoding, Google login and Apple login/linking tests on the target platforms.
- Populate legitimate legal/contact/safety copy, cities, labels and promotions through the dashboard.
- Deploy backend, then dashboard, then distribute a fresh mobile build with the correct API base and provider configuration.
- Retest customer, owner and admin flows against that deployment, including GPS permissions, app relaunch, review moderation, expiring offers and owner view totals.
- Obtain and check the actual TestFlight beta comments. The supplied screenshot says comments exist but does not contain their individual contents; those issues cannot be marked resolved from the screenshot alone.
- Compare the client's reference screens with the installed build. Source presence and a debug APK are not evidence that the client's existing TestFlight build has been updated.

Reference documentation: [Google Maps Flutter setup](https://developers.google.com/maps/flutter-package/config), [Google Sign-In Flutter](https://pub.dev/packages/google_sign_in), [Apple sign-in package setup](https://pub.dev/packages/sign_in_with_apple).
