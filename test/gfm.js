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

/**
 * The HTML a GFM reader sees, raw HTML and all.
 *
 * The extractor's grammar rests on claims about which constructs interrupt a
 * paragraph, and those claims were read from the specification and written
 * into comments beside the code. This renders the shape so a test can ask the
 * parser instead. ADR-0028 records why a claim about a render answers to a
 * renderer, and ADR-0029 applies it to the grammar.
 *
 * Raw HTML is kept, and `renderTables` above drops it. An HTML block is the
 * construct the continuation grammar loses the most on, so a render that
 * silently deleted it would be an oracle that could not see the case.
 */
export function renderBlocks(markdown) {
  return micromark(markdown, {
    extensions: [gfmTable()],
    htmlExtensions: [gfmTableHtml()],
    allowDangerousHtml: true,
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
