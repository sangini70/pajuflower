import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerApprovedDraft, writeContentFiles } from './register-approved-content.mjs';

const load = async (name) => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const sermons = await load('sermons');
const bulletins = await load('bulletins');

const approvedDraft = () => ({
  draftStatus: 'APPROVED',
  approval: {
    approved: true,
    approvedBy: 'user-confirmed',
    approvedAt: '2026-10-11T10:00:00+09:00',
    publicStatus: 'published',
    approvalStatus: 'approved'
  },
  source: { directory: 'REFERENCE/BULLETINS/2026-10-11', files: ['private.jpg'] },
  evidence: [{ field: 'sermon.title', sourceFile: 'private.jpg' }],
  publicFields: {
    sermon: {
      id: 'sermon-2026-10-11', slug: 'new-sermon-2026-10-11', date: '2026-10-11',
      title: '새 주일 설교', scripture: '에베소서 4:25', preacher: '확인된 설교자',
      summary: '공개 승인된 설교 설명', youtubeUrl: null, thumbnail: null
    },
    bulletin: {
      id: 'bulletin-2026-10-11-41', slug: '2026-10-11', date: '2026-10-11',
      issueNumber: '제14권 41호', title: '2026년 10월 11일 주보', description: '공개 승인된 주보 설명',
      publicFile: null, relatedSermonId: 'sermon-2026-10-11'
    }
  }
});

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'paju-register-'));
const sermonsFile = path.join(tempRoot, 'sermons.json');
const bulletinsFile = path.join(tempRoot, 'bulletins.json');
await writeFile(sermonsFile, `${JSON.stringify(sermons, null, 2)}\n`, 'utf8');
await writeFile(bulletinsFile, `${JSON.stringify(bulletins, null, 2)}\n`, 'utf8');
const writeTemp = (data) => writeContentFiles({ ...data, sermonsFile, bulletinsFile });

try {
  await registerApprovedDraft({ draft: approvedDraft(), sermons, bulletins, writeFiles: writeTemp });
  const registeredSermons = JSON.parse(await readFile(sermonsFile, 'utf8'));
  const registeredBulletins = JSON.parse(await readFile(bulletinsFile, 'utf8'));
  assert.equal(registeredSermons.length, sermons.length + 1);
  assert.equal(registeredBulletins.length, bulletins.length + 1);
  assert.equal(Object.hasOwn(registeredSermons.at(-1), 'sourceReference'), false);
  assert.equal(Object.hasOwn(registeredBulletins.at(-1), 'evidence'), false);

  const unchangedSermons = await readFile(sermonsFile, 'utf8');
  const unchangedBulletins = await readFile(bulletinsFile, 'utf8');
  let writes = 0;
  await assert.rejects(
    registerApprovedDraft({ draft: { ...approvedDraft(), draftStatus: 'REVIEW_REQUIRED', approval: { ...approvedDraft().approval, approved: false, publicStatus: 'pending', approvalStatus: 'pending' } }, sermons, bulletins, writeFiles: async () => { writes += 1; } }),
    /registration failed/
  );
  assert.equal(writes, 0);

  const duplicate = approvedDraft();
  duplicate.publicFields.sermon.date = '2026-10-04';
  duplicate.publicFields.sermon.slug = 'sae-saram-eul-ibeura';
  duplicate.publicFields.bulletin.date = '2026-10-04';
  duplicate.publicFields.bulletin.slug = '2026-10-04';
  duplicate.publicFields.bulletin.issueNumber = '제14권 40호';
  await assert.rejects(registerApprovedDraft({ draft: duplicate, sermons, bulletins, writeFiles: writeTemp }), /duplicate/);

  const privacy = approvedDraft();
  privacy.publicFields.bulletin.description = '문의 010-1234-5678';
  await assert.rejects(registerApprovedDraft({ draft: privacy, sermons, bulletins, writeFiles: writeTemp }), /phone-like/);

  const linkError = approvedDraft();
  linkError.publicFields.bulletin.relatedSermonId = 'sermon-not-linked';
  await assert.rejects(registerApprovedDraft({ draft: linkError, sermons, bulletins, writeFiles: writeTemp }), /must link/);

  const failure = approvedDraft();
  await assert.rejects(registerApprovedDraft({ draft: failure, sermons, bulletins, writeFiles: async () => { throw new Error('simulated write failure'); } }), /simulated write failure/);
  assert.equal(await readFile(sermonsFile, 'utf8'), unchangedSermons);
  assert.equal(await readFile(bulletinsFile, 'utf8'), unchangedBulletins);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log('register-approved-content tests: PASS (normal, unapproved, duplicate, privacy, link, write failure)');
