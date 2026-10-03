# Client feedback update — 2 October 2026

The mobile registration now collects restaurant details, a confirmed map location,
separate restaurant photo sections, and 1–4 described Signature Dishes in one
submission. Restaurant prices on cards derive from dish prices rather than a
separate unexplained starting-price field.

## Deployment

Deploy the updated backend before distributing the updated mobile build. New
restaurant registrations require the new multipart submission contract. Existing
restaurants and dishes do not require a database migration: uncategorized photos
appear under the additional restaurant areas section.

## Registration contract

`POST /api/owner/restaurant` accepts up to 28 `images` files:

- Restaurant photos come first. `restaurantImageCount` specifies their count.
- `photoCategories` is a JSON array in retained-photo/new-photo order, using
  `interior`, `exterior`, or `other`. New registrations require interior and
  exterior photos and permit up to four photos per category.
- `signatureDishes` is a JSON array of 1–4 dish objects. Each has a name,
  description, nonnegative price, and 1–4 unique `imageIndexes` referring to the
  remaining uploaded files. Restaurant photos cannot be reused as dish photos.
- `location` contains explicit latitude and longitude; blank coordinates are
  rejected. A default map camera position does not count as a confirmed location.

Both check-in API surfaces require valid GPS coordinates within 100 meters of
the restaurant. Check-ins record visits and support the current review flow.
Their inclusion in the original client brief still needs to be checked against
that brief; no original brief is included in this repository.

## Testing data and operational checks

The existing `npm run seed:users` script now prepares four Signature Dishes,
two regular dishes and twelve categorized restaurant photos per demo restaurant.
It uses the configured database. It was updated but was not executed against the
live database as part of this change. Its stock photos are illustrative test data.

Registration begins a background health request while the form is filled out.
`POST /api/auth/register` exposes server processing duration in `Server-Timing`.
Compare that duration with total request duration on the deployed service to
separate server processing from connection/cold-start latency. The reported
25-second delay still requires measurement on the deployed service.

Verify GPS permissions, app force-close/relaunch and the launcher icon on a real
iPhone after uploading a new TestFlight build. iOS icons are RGB without alpha;
an iOS build cannot be produced on the Windows development machine.
