// Minifies cast-bookmarklet.js into cast-bookmarklet.txt (a ready-to-use bookmark URL).
// Usage: npm install && npm run build
import { minify } from 'terser';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./cast-bookmarklet.js', import.meta.url), 'utf8');
const { code } = await minify(src, {
  compress: { passes: 2 },
  mangle: true,
  format: { ascii_only: true, comments: false },
});

if (/[^\x20-\x7e]/.test(code)) throw new Error('Output contains non-ASCII characters');

// Chrome percent-decodes javascript: URLs, so encode %, and spaces and quotes to be safe.
const url = 'javascript:' + code.replace(/%/g, '%25').replace(/ /g, '%20').replace(/"/g, '%22');
fs.writeFileSync(new URL('./cast-bookmarklet.txt', import.meta.url), url + '\n');
console.log(`cast-bookmarklet.txt: ${url.length} characters`);
