import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContent } from './validate-content.mjs';

const load = async (name) => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), 'utf8'));
const baseSermons = await load('sermons');
const baseBulletins = await load('bulletins');
const clone = (value) => JSON.parse(JSON.stringify(value));
const errorsFor = (sermons = baseSermons, bulletins = baseBulletins) => validateContent({ sermons, bulletins });

assert.deepEqual(errorsFor(), [], 'normal content must pass');
assert.equal(baseSermons.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 1);
assert.equal(baseBulletins.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 1);

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

const pendingSermons = clone(baseSermons);
const pendingBulletins = clone(baseBulletins);
pendingSermons[0].publicStatus = 'pending';
pendingSermons[0].approvalStatus = 'pending';
pendingBulletins[0].publicStatus = 'pending';
pendingBulletins[0].approvalStatus = 'pending';
assert.deepEqual(errorsFor(pendingSermons, pendingBulletins), [], 'pending content may be stored but must validate');
assert.equal(pendingSermons.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 0);
assert.equal(pendingBulletins.filter((item) => item.publicStatus === 'published' && item.approvalStatus === 'approved').length, 0);

const privateLeak = clone(baseSermons);
privateLeak[0].summary = '문의: 010-1234-5678';
assert.ok(errorsFor(privateLeak).some((error) => error.includes('phone-like')));

console.log('validate-content tests: PASS (normal, duplicate, missing, invalid date, invalid connection, pending, privacy)');
