# Client feedback update — 2 October 2026

The mobile registration now collects restaurant details, a confirmed map location,
separate restaurant photo sections, and 1–3 described Signature Dishes in one
submission. Restaurant prices on cards derive from dish prices rather than a
separate unexplained starting-price field.

## Deployment

Deploy the updated backend before distributing the updated mobile build. New
restaurant registrations require the new multipart submission contract. Existing
restaurants and dishes do not require a database migration: uncategorized photos
appear under the additional restaurant areas section.

## Registration contract

`POST /api/owner/restaurant` accepts up to 24 `images` files:

- Restaurant photos come first. `restaurantImageCount` specifies their count.
- `photoCategories` is a JSON array in retained-photo/new-photo order, using
  `interior`, `exterior`, or `other`. New registrations require interior and
  exterior photos and permit up to four photos per category.
- `signatureDishes` is a JSON array of 1–3 dish objects. Each has a name,
  description, nonnegative price, and 1–4 unique `imageIndexes` referring to the
  remaining uploaded files. Restaurant photos cannot be reused as dish photos.
- `location` contains explicit latitude and longitude; blank coordinates are
  rejected. A default map camera position does not count as a confirmed location.

Both check-in API surfaces require valid GPS coordinates within 100 meters of
the restaurant. Check-ins record visits and support the current review flow.
Their inclusion in the original client brief still needs to be checked against
that brief; no original brief is included in this repository.

## Customer discovery and dashboard — 26 October 2026

Restaurant cards show the restaurant photo and up to three clickable active
Signature Dish previews. Restaurant details place Signature Dishes before the
restaurant information and categorized galleries. Owner and dashboard forms,
and both dish-management API surfaces, permit up to three Signature Dishes.
Existing extra dishes are retained; only the first three active signatures are
featured. Reclassify any existing fourth signature as a regular dish before
adding another signature.

Dashboard restaurant editing supports interior, exterior and additional-area
uploads with up to four photos per category. Photo metadata follows the retained
photo/new upload order. Edits from older clients without category metadata keep
the categories of retained images.

Mobile version is 1.0.0+6. Deploy the backend and dashboard, prepare approved demo
restaurants with three described dishes and distinct photos, then distribute a
fresh mobile build. The updated seed script is available but must not be run on
production without reviewing its existing account and restaurant updates. Real
device and TestFlight checks remain release tasks.

## Testing data and operational checks

The existing `npm run seed:users` script now prepares three Signature Dishes,
three regular dishes and twelve categorized restaurant photos per demo restaurant.
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
