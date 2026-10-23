// Signing rewrites the installer, so the size and sha512 in latest.yml (made for the unsigned file) no longer
// match it and the updater would reject the download. Recompute them from the signed file.
// Usage: node scripts/finalize-signed.mjs <signed-installer.exe> <latest.yml>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [installer, yml] = process.argv.slice(2);
if (!installer || !yml) throw new Error('usage: finalize-signed.mjs <installer.exe> <latest.yml>');

const data = readFileSync(installer);
const sha512 = createHash('sha512').update(data).digest('base64');
let text = readFileSync(yml, 'utf8');
text = text.replace(/^(\s*(?:- )?sha512:).*$/gm, `$1 ${sha512}`).replace(/^(\s*size:).*$/gm, `$1 ${data.length}`);
writeFileSync(yml, text);
console.log(`latest.yml updated: ${data.length} bytes, sha512 ${sha512.slice(0, 16)}…`);
