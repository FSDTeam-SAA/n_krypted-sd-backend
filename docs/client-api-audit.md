# Flutter and dashboard API audit

Both shipped clients resolve their backend base URL to `http://<host>:5000/api` by default. The backend therefore exposes the compatibility contract below at `/api` and keeps the newer API at `/api/v1`.

## Authentication and users

| Method | Path | Consumer | Access | Backend status |
|---|---|---|---|---|
| POST | `/auth/register` | Flutter | Public | Implemented |
| POST | `/auth/login` | Flutter, dashboard | Public | Implemented |
| POST | `/auth/forgot-password` | Flutter, dashboard | Public | Implemented |
| POST | `/auth/verify` | Flutter, dashboard | Public | Implemented |
| POST | `/auth/reset-password` | Flutter, dashboard | Public | Implemented |
| POST | `/auth/change-password` | Flutter, dashboard | Signed in | Implemented |
| PUT | `/auth/update-profile` | Flutter, dashboard | Signed in | Implemented; JSON and multipart |
| GET | `/auth/single-user/:id` | Flutter, dashboard | Signed in | Implemented |
| DELETE | `/auth/delete/user` | Flutter constant | Signed in | Implemented |
| GET | `/auth/all/user` | Dashboard | Admin | Implemented |
| DELETE | `/auth/delete/users` | Dashboard | Admin | Implemented; bulk operation |
| GET | `/auth/restaurant-owners` | Dashboard | Admin | Implemented |
| POST | `/auth/restaurant-owners` | Dashboard | Admin | Implemented |
| PUT | `/auth/restaurant-owners/:id` | Dashboard | Admin | Implemented |

## Restaurant discovery and saved items

| Method | Path | Consumer | Access | Backend status |
|---|---|---|---|---|
| GET | `/deals` | Flutter | Public/optional auth | Implemented with search, category, location, rating, distance, sorting, and pagination |
| GET | `/deals/:id` | Flutter | Public/optional auth | Implemented |
| GET | `/categories` | Flutter | Public | Implemented |
| GET | `/discovery/options` | Flutter | Public | Implemented |
| GET | `/saved` | Flutter | Signed in | Implemented |
| PUT | `/saved/:restaurantId` | Flutter | Signed in | Implemented for restaurants and dishes |
| DELETE | `/saved/:restaurantId` | Flutter | Signed in | Implemented for restaurants and dishes |

## Restaurant and dish management

| Method | Path | Consumer | Access | Backend status |
|---|---|---|---|---|
| GET | `/manage/deals` | Dashboard | Admin or owner | Implemented and owner-scoped |
| GET | `/manage/deals/:id` | Dashboard | Admin or owning owner | Implemented |
| GET | `/owner/restaurant` | Flutter, dashboard | Owner | Implemented; returns `null` before initial setup |
| POST | `/owner/restaurant` | Flutter, dashboard | Owner | Implemented; multipart images |
| PUT | `/owner/restaurant/:id` | Flutter, dashboard | Owning owner | Implemented; resubmits for approval |
| POST | `/admin/restaurants` | Dashboard | Admin | Implemented; creates/reuses an owner and accepts multipart images |
| PUT | `/admin/restaurants/:id` | Flutter, dashboard | Admin or owning owner | Implemented |
| PATCH | `/admin/restaurants/:id/approval` | Dashboard | Admin | Implemented |
| PATCH | `/deals/:id/status` | Dashboard | Admin | Implemented |
| DELETE | `/deals/bulk` | Dashboard | Admin | Implemented with related-record cleanup |
| POST | `/restaurants/:id/dishes` | Flutter, dashboard | Admin or owning owner | Implemented; multipart images |
| PUT | `/restaurants/:id/dishes/:dishId` | Flutter, dashboard | Admin or owning owner | Implemented; multipart images |
| DELETE | `/restaurants/:id/dishes/:dishId` | Flutter, dashboard | Admin or owning owner | Implemented with related-record cleanup |

## Check-ins and reviews

| Method | Path | Consumer | Access | Backend status |
|---|---|---|---|---|
| POST | `/check-ins` | Flutter | Signed in | Implemented with location, accuracy, party size, and distance |
| GET | `/check-ins/my` | Flutter | Signed in | Implemented |
| GET | `/check-ins/owner` | Flutter, dashboard | Owner | Implemented and owner-scoped |
| GET | `/check-ins/admin` | Dashboard | Admin | Implemented |
| GET | `/check-ins/user/:userId` | Dashboard | Admin | Implemented |
| GET | `/reviews` | Flutter, dashboard | Public/optional auth | Implemented with role-aware visibility and filters |
| GET | `/reviews/deal/:dealId` | Flutter | Public | Implemented |
| GET | `/reviews/eligibility/:dealId` | Flutter | Signed in | Implemented |
| POST | `/reviews` | Flutter | Signed in | Implemented; verified check-in required |
| PUT | `/reviews/:id` | Dashboard | Admin, or review author | Implemented |
| DELETE | `/reviews/:id` | Dashboard | Admin, or review author | Implemented |
| DELETE | `/reviews/bulk` | Dashboard | Admin | Implemented |
| GET | `/review-restaurants` | Dashboard | Admin or owner | Implemented and owner-scoped |

## Content and reporting

| Method | Path | Consumer | Access | Backend status |
|---|---|---|---|---|
| GET | `/content/legal` | Flutter, dashboard | Public | Implemented |
| PUT | `/content/legal` | Dashboard | Admin | Implemented |
| GET | `/content/app-settings` | Flutter | Public | Implemented |
| GET | `/dashboard/stats` | Flutter, dashboard | Admin or owner | Implemented with role-scoped totals |

## Direct third-party requests

These are intentionally not backend routes:

- OpenStreetMap tiles: Flutter explore/location maps and dashboard maps.
- Nominatim search and reverse geocoding: Flutter and dashboard restaurant location pickers.

## Response compatibility

The `/api` layer translates the current normalized MongoDB models into the field names used by the clients, including `title`, `images` as URL strings, embedded `dishes`, `phoneNumber`, `isVerified`, `dealID`, `userID`, `ratings`, `reviewComment`, `checkedInAt`, and dashboard pagination metadata. The `/api/v1` response contract is unchanged.
