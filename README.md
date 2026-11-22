# bookshlf

Any public Goodreads shelf, shown as a wall of book spines.

- `/bookshelf` shows Dila's shelf
- `/bookshelf/<goodreads id or profile slug>` shows anyone else's (e.g. `/bookshelf/22395023-dila`)
- `?shelf=currently-reading|to-read` switches shelf; `?by=year|rating|colour` changes how books are grouped
- Spine width comes from page count. Height, colour and binding details are generated from the book, so a spine always looks the same.
- Tap a spine to pull the book out: cover, your rating, date finished, review and a Goodreads link.

## How it works

Goodreads retired its public API, but every public profile still has an RSS feed per shelf
(`goodreads.com/review/list_rss/<id>?shelf=read`). Browsers can't read that feed directly
because it sends no CORS headers, so `api/shelf.js` (a Vercel serverless function) fetches it
server-side, follows pages (up to ~1000 books), and returns JSON. Responses are cached at the
edge for an hour.

Private Goodreads profiles can't be read.

## Run locally

```bash
npm run dev
```

Then open http://localhost:3000/bookshelf. There are no dependencies; it needs Node 18+.

## Deploy

Import the repo into Vercel with the framework preset set to "Other". No build step is needed:
`vercel.json` routes `/bookshelf/*` to `index.html` and `api/` becomes the function.
