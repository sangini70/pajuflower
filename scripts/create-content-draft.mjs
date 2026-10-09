import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from './validate-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftRoot = path.join(root, 'drafts');
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:01[016789][ -]?\d{3,4}[ -]?\d{4})/;
const PRIVATE_FIELD_NAMES = new Set(['privateNotes', 'rawText', 'childrenNames', 'attendees', 'contact', 'personalNames']);

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const addReview = (review, value) => {
  if (value && !review.includes(value)) review.push(value);
};

const safePublicText = (value, field, review) => {
  if (!isText(value)) return null;
  if (EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value) || /REFERENCE[\\/]/i.test(value)) {
    addReview(review, `publicFields.${field}`);
    return null;
  }
  return value.trim();
};

const getConflicts = ({ sermons, bulletins }, sermon, bulletin) => {
  const conflicts = [];
  const compare = (type, field, value, items) => {
    if (!isText(value)) return;
    const matches = items.filter((item) => item[field] === value).map((item) => item.id);
    if (matches.length) conflicts.push({ type, field, value, existingIds: matches });
  };
  compare('sermon-id', 'id', sermon.id, sermons);
  compare('sermon-slug', 'slug', sermon.slug, sermons);
  compare('sermon-date', 'date', sermon.date, sermons);
  compare('bulletin-id', 'id', bulletin.id, bulletins);
  compare('bulletin-slug', 'slug', bulletin.slug, bulletins);
  compare('bulletin-date', 'date', bulletin.date, bulletins);
  compare('bulletin-issue', 'issueNumber', bulletin.issueNumber, bulletins);
  return conflicts;
};

const requiredDraftFields = (input) => {
  const review = [];
  const sermon = input.extracted?.sermon || {};
  const bulletin = input.extracted?.bulletin || {};
  for (const [name, value] of Object.entries({
    'sermon.date': sermon.date,
    'sermon.title': sermon.title,
    'sermon.scripture': sermon.scripture,
    'sermon.preacher': sermon.preacher,
    'bulletin.date': bulletin.date,
    'bulletin.issueNumber': bulletin.issueNumber,
    'bulletin.title': bulletin.title
  })) if (!isText(value)) addReview(review, name);
  if (!isText(input.sourceDirectory) && !isText(input.source?.directory)) addReview(review, 'source.directory');
  return review;
};

export const createContentDraft = ({ input, sermons, bulletins }) => {
  const source = input.source || {};
  const extracted = input.extracted || {};
  const sermonInput = extracted.sermon || {};
  const bulletinInput = extracted.bulletin || {};
  const uncertainFields = [...(Array.isArray(input.uncertainFields) ? input.uncertainFields : [])];
  for (const field of requiredDraftFields(input)) addReview(uncertainFields, field);

  const sermonId = isText(sermonInput.id) ? sermonInput.id.trim() : (isText(sermonInput.date) ? `sermon-${sermonInput.date}` : null);
  const bulletinId = isText(bulletinInput.id) ? bulletinInput.id.trim() : (isText(bulletinInput.date) ? `bulletin-${bulletinInput.date}` : null);
  const sermonSlug = isText(sermonInput.slug) ? sermonInput.slug.trim() : null;
  const bulletinSlug = isText(bulletinInput.slug) ? bulletinInput.slug.trim() : (isText(bulletinInput.date) ? bulletinInput.date.trim() : null);
  if (!sermonSlug) addReview(uncertainFields, 'sermon.slug');
  if (!bulletinSlug) addReview(uncertainFields, 'bulletin.slug');
  if (sermonSlug && !slugPattern.test(sermonSlug)) addReview(uncertainFields, 'sermon.slug');
  if (bulletinSlug && !slugPattern.test(bulletinSlug)) addReview(uncertainFields, 'bulletin.slug');

  const sermon = {
    id: sermonId,
    slug: sermonSlug,
    date: isText(sermonInput.date) ? sermonInput.date.trim() : null,
    title: safePublicText(sermonInput.title, 'sermon.title', uncertainFields),
    scripture: safePublicText(sermonInput.scripture, 'sermon.scripture', uncertainFields),
    preacher: safePublicText(sermonInput.preacher, 'sermon.preacher', uncertainFields),
    summary: safePublicText(sermonInput.summary, 'sermon.summary', uncertainFields),
    youtubeUrl: null,
    thumbnail: null,
    publicStatus: 'pending',
    approvalStatus: 'pending'
  };
  const bulletin = {
    id: bulletinId,
    slug: bulletinSlug,
    date: isText(bulletinInput.date) ? bulletinInput.date.trim() : null,
    issueNumber: safePublicText(bulletinInput.issueNumber, 'bulletin.issueNumber', uncertainFields),
    title: safePublicText(bulletinInput.title, 'bulletin.title', uncertainFields),
    description: safePublicText(bulletinInput.description, 'bulletin.description', uncertainFields),
    publicFile: null,
    relatedSermonId: sermon.id,
    privacyReview: 'REVIEW_REQUIRED',
    publicStatus: 'pending',
    approvalStatus: 'pending',
    archiveStatus: 'draft'
  };

  const conflicts = getConflicts({ sermons, bulletins }, sermon, bulletin);
  for (const conflict of conflicts) addReview(uncertainFields, `conflict.${conflict.type}`);

  const candidateComplete = [sermon, bulletin].every((item) => Object.entries(item).every(([field, value]) => ['summary', 'youtubeUrl', 'thumbnail', 'publicFile'].includes(field) || value !== null));
  const validationErrors = candidateComplete
    ? validateContent({ sermons: [...sermons, sermon], bulletins: [...bulletins, bulletin] })
    : ['Draft is incomplete; approval review is required before validation against public content.'];
  for (const error of validationErrors) addReview(uncertainFields, `validator: ${error}`);

  const ignoredPrivateFields = Object.keys(input).filter((key) => PRIVATE_FIELD_NAMES.has(key));
  for (const field of ignoredPrivateFields) addReview(uncertainFields, `excluded.${field}`);

  return {
    schemaVersion: 1,
    draftStatus: 'REVIEW_REQUIRED',
    extractionMethod: 'human-confirmed-text-input',
    source: {
      directory: source.directory || input.sourceDirectory || null,
      files: Array.isArray(source.files) ? source.files : [],
      originalsReadOnly: true,
      originalsCopied: false
    },
    extracted: {
      bulletin: clone(bulletinInput),
      sermon: clone(sermonInput)
    },
    evidence: Array.isArray(input.evidence) ? clone(input.evidence) : [],
    uncertainFields,
    conflicts,
    publicFields: { sermon, bulletin },
    approval: {
      publicStatus: 'pending',
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null
    },
    validation: {
      status: validationErrors.length || conflicts.length || uncertainFields.length ? 'REVIEW_REQUIRED' : 'READY_FOR_USER_REVIEW',
      errors: validationErrors
    }
  };
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') args.input = argv[++index];
    else if (argv[index] === '--output') args.output = argv[++index];
    else if (argv[index] === '--help') args.help = true;
  }
  return args;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
  console.log('Usage: npm run draft -- --input <private-review-input.json> [--output drafts/<name>.json]');
  console.log('The input must contain human-confirmed text; this command does not perform OCR or read image pixels.');
  if (!args.help) process.exitCode = 2;
  } else {
  const inputPath = path.resolve(root, args.input);
  const outputPath = path.resolve(root, args.output || path.join('drafts', `content-draft-${Date.now()}.json`));
  const relativeOutput = path.relative(draftRoot, outputPath);
  if (relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) throw new Error('Draft output must remain under drafts/.');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const sermons = JSON.parse(await readFile(path.join(root, 'content', 'sermons.json'), 'utf8'));
  const bulletins = JSON.parse(await readFile(path.join(root, 'content', 'bulletins.json'), 'utf8'));
  const draft = createContentDraft({ input, sermons, bulletins });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  console.log(`Draft created for review: ${path.relative(root, outputPath)}`);
  console.log(`Status: ${draft.draftStatus}; conflicts=${draft.conflicts.length}; uncertain=${draft.uncertainFields.length}`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
