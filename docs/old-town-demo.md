# Old Town Kitchen demo — 26 October 2026

The existing demo restaurant `6ab34d0efa470d7fd97c00c3` was updated in the configured
database and verified through the public customer API. This is illustrative demo
content, including example prices in EUR, rather than a real restaurant menu.

| Signature dish | Example price |
| --- | ---: |
| Mutton Rezala | €18.90 |
| Morog Polao | €15.90 |
| Shahi Tukra | €6.50 |

Each dish has its own food photograph, description, ingredients and preparation
details. The restaurant has separate interior, exterior and additional-area photos.
The food photographs are not reused as restaurant photographs. All six selected
images were downloaded, visually inspected and checked for successful image responses.

Dish IDs were retained so existing reviews and saved links continue to refer to
the same dishes. Accounts, passwords, reviews and visit history were not modified.

## Repeating the targeted update

From the backend directory:

```sh
node scripts/update-demo-menu.js
node scripts/update-demo-menu.js --apply
```

The first command previews the target. The second checks all image URLs, writes a
timestamped backup under `../.demo-review/backups/`, then updates the one existing
demo restaurant and its three dishes within a database transaction. The script
refuses unexpected owners, restaurants, missing/duplicate dishes and extra
signature dishes. The general seed script also uses this curated manifest for
Old Town Kitchen; it does not need to be run for this update.

The pre-update backup is
`../.demo-review/backups/old-town-before-2026-10-26T04-15-24.941Z.json`.

## Photo sources and credits

The original food photos are displayed resized. Attribution, source and license
URLs are included in each dish's specialty description as well as this document.

- [Mutton Rezala](https://commons.wikimedia.org/wiki/File:Mutton_Rezala.JPG):
  Acoomar, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- [Morog Polao](https://commons.wikimedia.org/wiki/File:Morog_Polao_1.jpg):
  Great Hero32, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- [Shahi Tukra](https://commons.wikimedia.org/wiki/File:Shahi_Tukra.jpg):
  Sumit Surai, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).
- Interior: existing Unsplash image `photo-1517248135467-4c7edcad34c4`.
- [Exterior entrance](https://www.pexels.com/photo/outside-the-restaurant-18799489/):
  Handmrts / Pexels.
- Additional bar/service area: Unsplash image `photo-1514933651103-005eec06c04b`.

These restaurant images illustrate the gallery sections; they do not depict the
actual premises of a restaurant named Old Town Kitchen.
