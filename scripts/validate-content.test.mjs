import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContent } from './validate-content.mjs';
import { createBulletinDocument, renderBulletinDocument } from './bulletin-layout.mjs';

const load = async (name) => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), 'utf8'));
const baseSermons = await load('sermons');
const baseBulletins = await load('bulletins');
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorsFor = (sermons = baseSermons, bulletins = baseBulletins) => validateContent({ sermons, bulletins });

assert.deepEqual(errorsFor(), [], 'normal content must pass');
assert.equal(baseSermons.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 4);
assert.equal(baseBulletins.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 4);

const restoredBulletin = baseBulletins.find((item) => item.slug === '2026-10-04');
const restoredSermon = baseSermons.find((item) => item.id === restoredBulletin.relatedSermonId);
assert.equal(restoredBulletin.webEdition.publicStatus, 'published');
assert.equal(restoredBulletin.webEdition.approvalStatus, 'approved');
assert.deepEqual([...new Set(restoredBulletin.webEdition.sections.map((section) => section.sourcePage))], [1, 2, 3, 4]);
const restoredDocument = createBulletinDocument(restoredBulletin, restoredSermon);
const restoredHtml = renderBulletinDocument(restoredDocument).html;
assert.ok(restoredDocument.sourcePaths.length > 50, 'restored bulletin must retain item-level JSON provenance');
assert.match(restoredHtml, /bulletin-table-columns-2/, 'two-column bulletin tables must retain two cells per row');
assert.match(restoredHtml, /bulletin-table-columns-3/, 'three-column bulletin tables must retain three cells per row');
assert.match(restoredHtml, /bulletin-table-columns-4/, 'four-column bulletin tables must retain four cells per row');
const editionTables = restoredDocument.blocks.filter((block) => ['table', 'service'].includes(block.type));
const renderedColumnCounts = editionTables.map((block) => {
  const columnCount = Math.max(block.columns.length, ...block.rows.map((row) => row.length));
  assert.ok(block.rows.every((row) => row.length === columnCount), `${block.id} must retain ${columnCount} cells in every row`);
  assert.match(restoredHtml, new RegExp(`bulletin-table-columns-${columnCount}`), `${block.id} must render its ${columnCount}-column table class`);
  return columnCount;
});
assert.deepEqual([...new Set(renderedColumnCounts)].sort(), [2, 3, 4], 'restored bulletin must contain verified 2, 3, and 4 column tables');
assert.match(restoredHtml, /가을대심방이 시작됩니다/);
assert.match(restoredHtml, /성도들의 건강과 회복을 위해서/);
assert.match(restoredHtml, /아름다운 계절 가을이 왔습니다/);
assert.match(restoredHtml, /중고등부 성경공부 모임/);
assert.doesNotMatch(restoredHtml, /공개 승인된 기본 정보|주보 원본에서 확인된|관련 설교/);
assert.doesNotMatch(restoredHtml, /010-9292-3405|jmark@hanmail\.net|교통사고 회복/);

const octoberEleventhBulletin = baseBulletins.find((item) => item.slug === '2026-10-11');
assert.ok(octoberEleventhBulletin, 'approved 2026-10-11 bulletin must be present');
assert.equal(octoberEleventhBulletin.relatedSermonId, 'sermon-2026-10-11');
assert.equal(octoberEleventhBulletin.webEdition.sections.length, 21);
assert.equal(octoberEleventhBulletin.webEdition.sections.find((section) => section.id === 'sunday-school-schedule').rows.at(-1)[0], '11.04');
assert.equal(octoberEleventhBulletin.webEdition.sections.find((section) => section.id === 'church-event-schedule').rows[2][2], '정덕환 장로');
const octoberEleventhSermon = baseSermons.find((item) => item.id === octoberEleventhBulletin.relatedSermonId);
const octoberEleventhHtml = renderBulletinDocument(createBulletinDocument(octoberEleventhBulletin, octoberEleventhSermon)).html;
assert.match(octoberEleventhHtml, /삭개오/);
assert.match(octoberEleventhHtml, /11\.04/);
assert.match(octoberEleventhHtml, /정덕환 장로/);
assert.match(octoberEleventhHtml, /&lt;파주꽃동산교회의 기도제목&gt;/);
assert.match(octoberEleventhHtml, /&lt;신앙생활을 위한 10가지 믿음의 행동&gt;/);
assert.match(octoberEleventhHtml, /&lt;새사람이 된 삭개오&gt;/);
assert.equal((octoberEleventhHtml.match(/bulletin-table-head/g) || []).length, 2, 'only source tables with printed column headings should render headers');
assert.doesNotMatch(octoberEleventhHtml, /010-9292-3405|jmark@hanmail\.net|이로은|이로운|권한진|권예진|권은진|교통사고/);

const duplicateSermons = clone(baseSermons);
duplicateSermons.push({ ...clone(baseSermons[0]), id: 'sermon-duplicate' });
assert.ok(errorsFor(duplicateSermons).some((error) => error.includes('duplicate slug')));
assert.ok(errorsFor(duplicateSermons).some((error) => error.includes('duplicate date')));

const duplicateBulletins = clone(baseBulletins);
duplicateBulletins.push({ ...clone(baseBulletins[0]), id: 'bulletin-duplicate', slug: '2026-10-11', date: '2026-10-11' });
assert.ok(errorsFor(baseSermons, duplicateBulletins).some((error) => error.includes('duplicate issueNumber')));

const missingRequired = clone(baseSermons);
delete missingRequired[0].title;
assert.ok(errorsFor(missingRequired).some((error) => error.includes('missing title')));

const invalidDate = clone(baseSermons);
invalidDate[0].date = '2026-02-30';
assert.ok(errorsFor(invalidDate).some((error) => error.includes('invalid date')));

const invalidConnection = clone(baseBulletins);
invalidConnection[0].relatedSermonId = 'sermon-does-not-exist';
assert.ok(errorsFor(baseSermons, invalidConnection).some((error) => error.includes('relatedSermonId not found')));

const duplicateSchedule = clone(baseBulletins);
duplicateSchedule[0].worshipSchedule.push({ ...duplicateSchedule[0].worshipSchedule[0] });
assert.ok(errorsFor(baseSermons, duplicateSchedule).some((error) => error.includes('worshipSchedule duplicate date')));

const unapprovedNews = clone(baseBulletins);
unapprovedNews[0].churchNews[0].approvalStatus = 'pending';
assert.ok(errorsFor(baseSermons, unapprovedNews).some((error) => error.includes('churchNews[0] must be approved')));

const pendingSermons = clone(baseSermons);
const pendingBulletins = clone(baseBulletins);
pendingSermons[0].publicStatus = 'pending';
pendingSermons[0].approvalStatus = 'pending';
pendingBulletins[0].publicStatus = 'pending';
pendingBulletins[0].approvalStatus = 'pending';
assert.deepEqual(errorsFor(pendingSermons, pendingBulletins), [], 'pending content may be stored but must validate');
assert.equal(pendingSermons.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 3);
assert.equal(pendingBulletins.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 3);

const privateLeak = clone(baseSermons);
privateLeak[0].summary = '문의: 010-1234-5678';
assert.ok(errorsFor(privateLeak).some((error) => error.includes('phone-like')));

console.log('validate-content tests: PASS (normal, duplicate, schedule duplicate, approval gate, missing, invalid date, invalid connection, pending, privacy)');
