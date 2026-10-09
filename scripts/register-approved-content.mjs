import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from './validate-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftRoot = path.join(root, 'drafts');
const sermonsPath = path.join(root, 'content', 'sermons.json');
const bulletinsPath = path.join(root, 'content', 'bulletins.json');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const APPROVAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/;
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const clone = (value) => JSON.parse(JSON.stringify(value));

const approvalErrors = (draft) => {
  const errors = [];
  if (draft?.draftStatus !== 'APPROVED') errors.push('draftStatus must be APPROVED');
  if (draft?.approval?.approved !== true) errors.push('approval.approved must be true');
  if (!isText(draft?.approval?.approvedBy)) errors.push('approval.approvedBy is required');
  if (!isText(draft?.approval?.approvedAt) || !APPROVAL_DATE_PATTERN.test(draft.approval.approvedAt)) errors.push('approval.approvedAt must be an ISO timestamp');
  if (draft?.approval?.publicStatus !== 'published') errors.push('approval.publicStatus must be published');
  if (draft?.approval?.approvalStatus !== 'approved') errors.push('approval.approvalStatus must be approved');
  if (draft?.draftStatus === 'REVIEW_REQUIRED') errors.push('REVIEW_REQUIRED draft cannot be registered');
  return errors;
};

const requiredPublicFields = (draft) => {
  const errors = [];
  const sermon = draft?.publicFields?.sermon;
  const bulletin = draft?.publicFields?.bulletin;
  for (const field of ['id', 'slug', 'date', 'title', 'scripture', 'preacher']) if (!isText(sermon?.[field])) errors.push(`publicFields.sermon.${field} is required`);
  for (const field of ['id', 'slug', 'date', 'issueNumber', 'title', 'description', 'relatedSermonId']) if (!isText(bulletin?.[field])) errors.push(`publicFields.bulletin.${field} is required`);
  if (sermon?.date && !DATE_PATTERN.test(sermon.date)) errors.push('publicFields.sermon.date is invalid');
  if (bulletin?.date && !DATE_PATTERN.test(bulletin.date)) errors.push('publicFields.bulletin.date is invalid');
  if (sermon?.date && bulletin?.date && sermon.date !== bulletin.date) errors.push('sermon and bulletin dates must match');
  if (sermon?.id && bulletin?.relatedSermonId && sermon.id !== bulletin.relatedSermonId) errors.push('bulletin must link to the registered sermon');
  return errors;
};

const publicOnly = (draft) => {
  const sourceSermon = draft.publicFields.sermon;
  const sourceBulletin = draft.publicFields.bulletin;
  const sermon = {
    id: sourceSermon.id,
    slug: sourceSermon.slug,
    date: sourceSermon.date,
    title: sourceSermon.title,
    scripture: sourceSermon.scripture,
    preacher: sourceSermon.preacher,
    summary: sourceSermon.summary ?? null,
    youtubeUrl: sourceSermon.youtubeUrl ?? null,
    thumbnail: sourceSermon.thumbnail ?? null,
    publicStatus: 'published',
    approvalStatus: 'approved',
    updatedAt: draft.approval.approvedAt.slice(0, 10)
  };
  const bulletin = {
    id: sourceBulletin.id,
    slug: sourceBulletin.slug,
    date: sourceBulletin.date,
    issueNumber: sourceBulletin.issueNumber,
    title: sourceBulletin.title,
    description: sourceBulletin.description,
    publicFile: sourceBulletin.publicFile ?? null,
    relatedSermonId: sourceBulletin.relatedSermonId,
    privacyReview: 'approved-for-publication',
    publicStatus: 'published',
    approvalStatus: 'approved',
    archiveStatus: 'current',
    updatedAt: draft.approval.approvedAt.slice(0, 10)
  };
  return { sermon, bulletin };
};

const internalLeakErrors = (draft, publicOnlyData) => {
  const errors = [];
  const serialized = JSON.stringify(publicOnlyData);
  if (/REFERENCE[\\/]/i.test(serialized)) errors.push('public registration contains REFERENCE path');
  if (/sourceReference|privateNotes|rawText|childrenNames|attendees|personalNames|evidence|uncertainFields|conflicts/i.test(serialized)) errors.push('public registration contains internal draft fields');
  if (draft.publicFields.sermon.youtubeUrl) errors.push('unverified YouTube URL must not be registered');
  return errors;
};

export const prepareApprovedRegistration = ({ draft, sermons, bulletins }) => {
  const errors = [...approvalErrors(draft), ...requiredPublicFields(draft)];
  if (errors.length) return { errors, data: null };
  const data = publicOnly(draft);
  errors.push(...internalLeakErrors(draft, data));
  const validationErrors = validateContent({ sermons: [...sermons, data.sermon], bulletins: [...bulletins, data.bulletin] });
  errors.push(...validationErrors);
  return { errors, data: errors.length ? null : { sermons: [...sermons, data.sermon], bulletins: [...bulletins, data.bulletin] } };
};

const safeUnlink = async (file) => {
  try { await unlink(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
};

export const writeContentFiles = async ({ sermons, bulletins, sermonsFile = sermonsPath, bulletinsFile = bulletinsPath }) => {
  const token = randomUUID();
  const sermonTemp = `${sermonsFile}.${token}.tmp`;
  const bulletinTemp = `${bulletinsFile}.${token}.tmp`;
  const sermonBackup = `${sermonsFile}.${token}.bak`;
  const bulletinBackup = `${bulletinsFile}.${token}.bak`;
  let sermonBackedUp = false;
  let bulletinBackedUp = false;
  let sermonInstalled = false;
  let bulletinInstalled = false;
  await mkdir(path.dirname(sermonsFile), { recursive: true });
  try {
    await writeFile(sermonTemp, `${JSON.stringify(sermons, null, 2)}\n`, 'utf8');
    await writeFile(bulletinTemp, `${JSON.stringify(bulletins, null, 2)}\n`, 'utf8');
    await rename(sermonsFile, sermonBackup); sermonBackedUp = true;
    await rename(bulletinsFile, bulletinBackup); bulletinBackedUp = true;
    await rename(sermonTemp, sermonsFile); sermonInstalled = true;
    await rename(bulletinTemp, bulletinsFile); bulletinInstalled = true;
    await safeUnlink(sermonBackup);
    await safeUnlink(bulletinBackup);
  } catch (error) {
    if (sermonInstalled) await safeUnlink(sermonsFile);
    if (bulletinInstalled) await safeUnlink(bulletinsFile);
    if (sermonBackedUp) await rename(sermonBackup, sermonsFile);
    if (bulletinBackedUp) await rename(bulletinBackup, bulletinsFile);
    await safeUnlink(sermonTemp);
    await safeUnlink(bulletinTemp);
    throw error;
  }
};

export const registerApprovedDraft = async ({ draft, sermons, bulletins, writeFiles = writeContentFiles }) => {
  const prepared = prepareApprovedRegistration({ draft, sermons, bulletins });
  if (prepared.errors.length) throw new Error(`Approved draft registration failed:\n- ${prepared.errors.join('\n- ')}`);
  await writeFiles(prepared.data);
  return prepared.data;
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') args.input = argv[++index];
    else if (argv[index] === '--help') args.help = true;
    else throw new Error(`Unsupported option: ${argv[index]}`);
  }
  return args;
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    console.log('Usage: npm run register -- --input drafts/approved-content-draft.json');
    console.log('Approval is read from the draft and cannot be supplied as a command-line option.');
    if (!args.help) process.exitCode = 2;
    return;
  }
  const inputPath = path.resolve(root, args.input);
  const relativeInput = path.relative(draftRoot, inputPath);
  if (relativeInput.startsWith('..') || path.isAbsolute(relativeInput)) throw new Error('Approved draft input must remain under drafts/.');
  const draft = JSON.parse(await readFile(inputPath, 'utf8'));
  const sermons = JSON.parse(await readFile(sermonsPath, 'utf8'));
  const bulletins = JSON.parse(await readFile(bulletinsPath, 'utf8'));
  await registerApprovedDraft({ draft, sermons, bulletins });
  console.log('Approved draft registered in content/sermons.json and content/bulletins.json.');
  console.log('No Git commit, push, or deployment was performed.');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
