// GET /api/shelf?user=<goodreads id, profile URL or username>&shelf=read
//
// Goodreads has no public API any more, but every public profile exposes an
// RSS feed per shelf. Browsers can't read it directly (no CORS headers), so
// this function fetches it server-side and returns clean JSON.

const SHELVES = new Set(['read', 'currently-reading', 'to-read']);
const MAX_PAGES = 10; // ~100 books per page → up to ~1000 books
const UA = 'Mozilla/5.0 (compatible; bookshelf-wall/1.0)';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rawUser = (url.searchParams.get('user') || '').trim();
  const shelf = SHELVES.has(url.searchParams.get('shelf')) ? url.searchParams.get('shelf') : 'read';

  if (!rawUser) return send(res, 400, { error: 'Missing ?user=' });

  try {
    const userId = await resolveUserId(rawUser);
    if (!userId) return send(res, 404, { error: "Couldn't find that Goodreads user." });

    const books = [];
    let ownerName = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const feed = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${shelf}&page=${page}`;
      const r = await fetch(feed, { headers: { 'User-Agent': UA } });
      if (r.status === 404) return send(res, 404, { error: "Couldn't find that Goodreads user." });
      if (!r.ok) {
        if (page === 1) return send(res, 502, { error: `Goodreads returned ${r.status}.` });
        break;
      }
      const xml = await r.text();
      if (page === 1) {
        if (!xml.includes('<rss')) {
          return send(res, 403, { error: 'This profile is private, so its shelves can’t be read.' });
        }
        ownerName = parseOwner(xml);
      }
      const items = parseItems(xml);
      books.push(...items);
      if (items.length < 100) break;
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return send(res, 200, { user: { id: userId, name: ownerName }, shelf, books });
  } catch (err) {
    return send(res, 500, { error: 'Something went wrong talking to Goodreads.' });
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Accepts "22395023", "22395023-dila", a full profile URL, or a vanity username.
async function resolveUserId(input) {
  const fromUrl = input.match(/goodreads\.com\/(?:user\/show|review\/list(?:_rss)?)\/(\d+)/i);
  if (fromUrl) return fromUrl[1];
  const leading = input.match(/^(\d+)(?:-|$)/);
  if (leading) return leading[1];

  const name = input.replace(/^https?:\/\/(www\.)?goodreads\.com\//i, '').replace(/[/?#].*$/, '');
  if (!/^[\w.-]+$/.test(name)) return null;
  // goodreads.com/<username> redirects to /user/show/<id>-<name>
  const r = await fetch(`https://www.goodreads.com/${encodeURIComponent(name)}`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  const m = r.url.match(/\/user\/show\/(\d+)/);
  return m ? m[1] : null;
}

function parseOwner(xml) {
  const channelTitle = tag(xml.split('<item>')[0], 'title') || '';
  const m = channelTitle.match(/^(.*?)['’]s bookshelf/i);
  return m ? m[1].trim() : null;
}

function parseItems(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const it = m[1];
    const bookBlock = (it.match(/<book\b[^>]*>([\s\S]*?)<\/book>/) || [])[1] || '';
    const pages = parseInt(tag(bookBlock, 'num_pages'), 10);
    out.push({
      id: tag(it, 'book_id'),
      title: tag(it, 'title'),
      author: tag(it, 'author_name'),
      cover: bigCover(tag(it, 'book_large_image_url') || tag(it, 'book_image_url')),
      pages: Number.isFinite(pages) ? pages : null,
      rating: parseInt(tag(it, 'user_rating'), 10) || 0,
      avgRating: parseFloat(tag(it, 'average_rating')) || null,
      published: parseInt(tag(it, 'book_published'), 10) || null,
      readAt: toISO(tag(it, 'user_read_at')),
      addedAt: toISO(tag(it, 'user_date_added')),
      review: stripHtml(tag(it, 'user_review')),
      link: `https://www.goodreads.com/book/show/${tag(it, 'book_id')}`,
    });
  }
  return out;
}

function tag(src, name) {
  const m = src.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1];
  return decode(v.trim());
}

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function stripHtml(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

function toISO(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Goodreads serves thumbnails like ..._SY75_.jpg; strip the size suffix for a sharper cover.
function bigCover(u) {
  if (!u || /nophoto/.test(u)) return null;
  return u.replace(/\._S[XY]\d+_\./, '.');
}
