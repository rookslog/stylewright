import { micromark } from 'micromark';
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table';

/**
 * Render Markdown the way a GFM reader does, and hand back the tables.
 *
 * Every claim this repository makes about how a matrix renders used to be read
 * from the specification and written into a comment. `micromark` with its GFM
 * table extension is the same dialect GitHub renders, so a test can put a
 * matrix through it and look at what comes out.
 *
 * The comparison this helper serves is structural. A cell arrives here as HTML,
 * so its backticks are `<code>` and its ampersands are escaped, and the raw
 * text a matrix row carries is not recoverable from it. What IS recoverable is
 * the shape a reader sees: how many tables, which headings, how many rows, how
 * many cells in each, and the plain-text identifier that opens every row. That
 * is what the rendered column being the one that counts actually needs.
 */
export function renderTables(markdown) {
  const html = micromark(markdown, {
    extensions: [gfmTable()],
    htmlExtensions: [gfmTableHtml()],
  });
  return [...html.matchAll(/<table>([\s\S]*?)<\/table>/g)].map(([, body]) => {
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map(([, cells]) => [...cells.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(([, c]) => c));
    const headings = /<thead>/.test(body) ? rows[0] : [];
    return { headings, rows: /<thead>/.test(body) ? rows.slice(1) : rows };
  });
}

/** The visible text of a rendered cell, with tags and entities resolved. */
export function cellText(html) {
  return html.replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
