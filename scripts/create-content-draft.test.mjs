import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContentDraft } from './create-content-draft.mjs';

const load = async (name) => JSON.parse(await readFile(new URL(`../content/${name}.json`, import.meta.url), 'utf8'));
const sermons = await load('sermons');
const bulletins = await load('bulletins');

const newWeekInput = {
  source: {
    directory: 'REFERENCE/BULLETINS/2026-10-11',
    files: [
      'bulletin_2026-10-11_p01.jpg',
      'bulletin_2026-10-11_p02.jpg',
      'bulletin_2026-10-11_p03.jpg',
      'bulletin_2026-10-11_p04.jpg'
    ]
  },
  extracted: {
    bulletin: {
      date: '2026-10-11',
      issueNumber: '제14권 41호',
      title: '2026년 10월 11일 주보',
      description: '사용자 확인 후 공개할 주보 기본 정보입니다.',
      slug: '2026-10-11'
    },
    sermon: {
      date: '2026-10-11',
      title: '확인 대기 설교',
      scripture: '확인 필요',
      preacher: '확인 필요',
      slug: '2026-10-11-sermon'
    }
  },
  evidence: [{ field: 'bulletin.date', sourceFile: 'bulletin_2026-10-11_p01.jpg' }]
};

const cleanDraft = createContentDraft({ input: newWeekInput, sermons, bulletins });
assert.equal(cleanDraft.draftStatus, 'REVIEW_REQUIRED');
assert.equal(cleanDraft.approval.publicStatus, 'pending');
assert.equal(cleanDraft.approval.approvalStatus, 'pending');
assert.equal(cleanDraft.conflicts.length, 0);
assert.equal(cleanDraft.source.originalsCopied, false);
assert.equal(cleanDraft.publicFields.sermon.youtubeUrl, null);
assert.equal(cleanDraft.publicFields.bulletin.publicFile, null);
assert.equal(Object.hasOwn(cleanDraft.publicFields, 'privateNotes'), false);

const duplicateDraft = createContentDraft({
  input: {
    sourceDirectory: 'REFERENCE/BULLETINS/2026-10-04',
    source: { files: ['bulletin_2026-10-04_p01.jpg', 'bulletin_2026-10-04_p02.jpg', 'bulletin_2026-10-04_p03.jpg', 'bulletin_2026-10-04_p04.jpg'] },
    extracted: {
      bulletin: { date: '2026-10-04', issueNumber: '제14권 40호', title: '기존 주보', slug: '2026-10-04' },
      sermon: { date: '2026-10-04', title: '기존 설교', scripture: '확인 본문', preacher: '확인 설교자', slug: 'sae-saram-eul-ibeura' }
    }
  },
  sermons,
  bulletins
});
assert.ok(duplicateDraft.conflicts.some((item) => item.type === 'sermon-date'));
assert.ok(duplicateDraft.conflicts.some((item) => item.type === 'bulletin-issue'));
assert.ok(duplicateDraft.uncertainFields.some((item) => item.startsWith('conflict.')));

const incompleteDraft = createContentDraft({
  input: { sourceDirectory: 'REFERENCE/BULLETINS/2026-10-18', extracted: { bulletin: {}, sermon: {} } },
  sermons,
  bulletins
});
assert.equal(incompleteDraft.draftStatus, 'REVIEW_REQUIRED');
assert.ok(incompleteDraft.uncertainFields.includes('sermon.title'));
assert.ok(incompleteDraft.uncertainFields.includes('bulletin.issueNumber'));

const privateDraft = createContentDraft({
  input: {
    ...newWeekInput,
    privateNotes: '어린이 이름과 개인 연락처',
    extracted: {
      ...newWeekInput.extracted,
      bulletin: { ...newWeekInput.extracted.bulletin, description: '문의 010-1234-5678' }
    }
  },
  sermons,
  bulletins
});
assert.equal(privateDraft.publicFields.bulletin.description, null);
assert.ok(privateDraft.uncertainFields.includes('publicFields.bulletin.description'));
assert.ok(privateDraft.uncertainFields.includes('excluded.privateNotes'));

console.log('create-content-draft tests: PASS (new draft, 2026-10-04 conflict, incomplete review, privacy exclusion)');
