import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeoDraft } from './seo-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'drafts', 'seo-content-draft.json');
const sermons = JSON.parse(await readFile(path.join(root, 'content', 'sermons.json'), 'utf8'));
const bulletins = JSON.parse(await readFile(path.join(root, 'content', 'bulletins.json'), 'utf8'));
const draft = createSeoDraft({ sermons, bulletins });
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
console.log(`SEO draft created for review: ${path.relative(root, output)}`);
console.log(`Status: ${draft.draftStatus}; sermons=${draft.items.sermons.length}; bulletins=${draft.items.bulletins.length}`);
