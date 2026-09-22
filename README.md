# n_krypted MVP Backend

Express.js ES module backend for the customer app, restaurant-owner app, and admin dashboard screens.

## Features

- JWT auth with `customer`, `restaurant_owner`, and `admin` roles
- MongoDB/Mongoose models for users, restaurants, dishes, reviews, saved items, check-ins, viewers, and static pages
- Soft delete for accounts, restaurants, dishes, and reviews
- Admin-approved restaurant onboarding
- Nearby restaurant search using MongoDB `2dsphere`
- Cloudinary single and multi-image uploads
- Modular Postman collection for frontend developers

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/n_krypted
JWT_SECRET=REMOVED_SECRET
JWT_EXPIRES_IN=7d
ACCESS_TOKEN_SECRET=REMOVED_SECRET
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=REMOVED_SECRET
REFRESH_TOKEN_EXPIRES_IN=30d
OTP_EXPIRES_IN_MINUTES=10
PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES=15
GMAIL_SMTP_USER=your_gmail_address@gmail.com
GMAIL_SMTP_APP_PASSWORD=your_gmail_app_password
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Main API Areas

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh-token`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/verify-password-reset-otp`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/logout`
- `GET /api/v1/restaurants`
- `GET /api/v1/restaurants/nearby`
- `GET /api/v1/restaurants/:id`
- `GET /api/v1/dishes/:id`
- `GET /api/v1/reviews`
- `POST /api/v1/reviews`
- `GET /api/v1/me/reviews`
- `PATCH /api/v1/reviews/:id`
- `DELETE /api/v1/reviews/:id`
- `GET /api/v1/me/saved`
- `GET /api/v1/owner/dashboard`
- `GET /api/v1/owner/restaurant`
- `PATCH /api/v1/owner/restaurant/gallery/reorder`
- `GET /api/v1/owner/dishes`
- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/restaurants`
- `GET /api/v1/admin/dishes/:id`
- `PATCH /api/v1/admin/dishes/:id/status`
- `DELETE /api/v1/admin/dishes/:id`
- `GET /api/v1/admin/reviews`
- `POST /api/v1/admin/reviews/sd`
- `PATCH /api/v1/admin/reviews/:id`
- `PATCH /api/v1/admin/reviews/:id/override`

See `docs/postman/n_krypted_api.postman_collection.json` for modular request documentation with sample bodies.

## Response Language

All API responses return German as the primary display message and English as a developer-friendly companion message:

```json
{
  "success": true,
  "message": "Profil erfolgreich aktualisiert",
  "messageEn": "Profile updated successfully",
  "data": {}
}
```

Frontend should display `message` to users. Developers can use `messageEn` for debugging or support.

## Auth and Tokens

- Register creates a verified user and immediately returns `accessToken`, `refreshToken`, and `token`, where `token` is an alias of `accessToken`.
- Login returns a short-lived access token plus a long-lived refresh token.
- Frontend sends access token as `Authorization: Bearer <accessToken>`.
- `POST /api/v1/auth/refresh-token` rotates the refresh token and returns a new access/refresh pair. The frontend should replace both stored tokens.
- Forgot password flow: `forgot-password` sends OTP, `verify-password-reset-otp` returns a short-lived `resetToken`, and `reset-password` sets the new password.
- Gmail SMTP is used only for password-recovery OTP through `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD`. Use a Gmail App Password, not the normal Gmail account password.

## Customer Search Filters

Restaurant list and nearby search support:

- `search`
- `category`
- `priceRange`
- `district`
- `openNow=true|false`
- `minRating`
- `sort=rating|popular|newest` for list
- `sort=distance|rating|popular` for nearby
- `lat`, `lng`, `radius` for nearby

## Reviews

There are two review types:

- `customer`: created by customers after they check in to a restaurant.
- `sd_admin`: created by admin as an SD/editorial review.

Customer review rules:

- Customer must call `POST /api/v1/restaurants/:id/check-ins` before `POST /api/v1/reviews`.
- Customer can list/edit/delete only their own customer reviews.
- Customer rating aggregates only use active `customer` reviews.

Admin review rules:

- `GET /api/v1/admin/reviews` returns both customer and SD reviews; filter with `reviewType=customer` or `reviewType=sd_admin`.
- `POST /api/v1/admin/reviews/sd` creates an SD/admin review.
- `PATCH /api/v1/admin/reviews/:id` lets admin edit any review.
- `PATCH /api/v1/admin/reviews/:id/override` explicitly overrides a customer review and stores `originalReview`, `overriddenBy`, `overriddenAt`, and `overrideReason`.

## Image/Form-data Policy

- Use `multipart/form-data` whenever sending binary images with a form.
- Profile/admin avatar field: `avatar`
- Dish, review, and gallery image field: `images`
- The upload-first flow is also supported: upload to `/api/v1/uploads` or `/api/v1/uploads/multiple`, then send returned image asset objects in JSON.

## Account Deletion

Deleting an account cascades cleanup so active screens do not keep broken references:

- The user is soft-deleted.
- Saved items, check-ins, and restaurant views owned by the user are removed.
- Reviews written by the user are soft-deleted and rating aggregates are recalculated.
- If the user is a restaurant owner, their restaurants, dishes, and restaurant reviews are soft-deleted, and saved/check-in/view records for those restaurants are removed.

## Uploads

```http
POST /api/v1/uploads
```

Form-data:
- `image`: file
- `folder`: optional Cloudinary folder name

```http
POST /api/v1/uploads/multiple
```

Form-data:
- `images`: files
- `folder`: optional Cloudinary folder name

```http
DELETE /api/v1/uploads/:publicId
```

If the Cloudinary `public_id` contains slashes, use:

```http
DELETE /api/v1/uploads?publicId=folder/image
```

## Tests

```bash
npm test
```
