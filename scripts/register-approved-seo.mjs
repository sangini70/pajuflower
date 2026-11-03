import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareApprovedSeoRegistration } from './seo-content.mjs';
import { writeContentFiles } from './register-approved-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftsRoot = path.join(root, 'drafts');
const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') args.input = argv[++index];
    else if (argv[index] === '--scope') args.scope = argv[++index];
    else if (argv[index] === '--help') args.help = true;
    else throw new Error(`Unsupported option: ${argv[index]}`);
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.input) {
  console.log('Usage: npm run seo:register -- --input drafts/approved-seo-content.json [--scope both|sermon|bulletin]');
  console.log('Approval is read from the draft and cannot be supplied as a command-line option.');
  if (!args.help) process.exitCode = 2;
} else {
  const inputPath = path.resolve(root, args.input);
  const relativeInput = path.relative(draftsRoot, inputPath);
  if (relativeInput.startsWith('..') || path.isAbsolute(relativeInput)) throw new Error('SEO draft input must remain under drafts/.');
  const draft = JSON.parse(await readFile(inputPath, 'utf8'));
  const sermons = JSON.parse(await readFile(path.join(root, 'content', 'sermons.json'), 'utf8'));
  const bulletins = JSON.parse(await readFile(path.join(root, 'content', 'bulletins.json'), 'utf8'));
  const prepared = prepareApprovedSeoRegistration({ draft, sermons, bulletins, scope: args.scope || 'both' });
  if (prepared.errors.length) throw new Error(`Approved SEO registration failed:\n- ${prepared.errors.join('\n- ')}`);
  await writeContentFiles(prepared.data);
  console.log('Approved SEO metadata registered in content JSON.');
  console.log('No Git commit, push, or deployment was performed.');
}
