import assert from 'node:assert/strict';
import { createBulletinSeo, createSeoDraft, createSermonSeo, prepareApprovedSeoRegistration, resolveSeo } from './seo-content.mjs';

const sermons = [{ id: 'sermon-1', slug: 'sermon-1', date: '2026-11-01', title: '위기 속의 감사', scripture: '다니엘 6:10', preacher: '최철민 목사', publicStatus: 'published', approvalStatus: 'approved' }];
const bulletins = [{ id: 'bulletin-1', slug: '2026-11-01', date: '2026-11-01', issueNumber: '제14권 44호', title: '2026년 11월 1일 주보', description: '2026년 11월 1일 파주꽃동산교회 주보', relatedSermonId: 'sermon-1', publicStatus: 'published', approvalStatus: 'approved' }];

const draft = createSeoDraft({ sermons, bulletins });
assert.equal(draft.draftStatus, 'REVIEW_REQUIRED');
assert.equal(draft.items.sermons[0].seo.approvalStatus, 'pending');
assert.match(draft.items.sermons[0].seo.title, /위기 속의 감사/);
assert.match(draft.items.sermons[0].seo.title, /다니엘 6:10/);
assert.equal(draft.items.sermons[0].seo.queryKeywords.length, 0);
assert.match(draft.items.bulletins[0].seo.title, /주보 \| 파주꽃동산교회$/);
assert.equal(draft.items.bulletins[0].seo.title.includes('주보 | 파주꽃동산교회 주보'), false);
assert.equal(draft.items.sermons[0].seo.internalLinks.some((link) => link.path.includes('://')), false);
assert.equal(resolveSeo({ seo: draft.items.sermons[0].seo }, { title: '기존 제목', description: '기존 설명' }).title, '기존 제목');
assert.match(createSermonSeo(sermons[0], bulletins[0]).description, /2026년 11월 1일/);
assert.match(createBulletinSeo(bulletins[0], sermons[0]).description, /설교: 위기 속의 감사/);

const unapproved = prepareApprovedSeoRegistration({ draft, sermons, bulletins });
assert.ok(unapproved.errors.some((error) => error.includes('APPROVED')));

const approved = structuredClone(draft);
approved.draftStatus = 'APPROVED';
approved.approval = { approved: true, approvedBy: 'user-confirmed', approvedAt: '2026-11-03T10:00:00+09:00' };
for (const group of [approved.items.sermons, approved.items.bulletins]) for (const item of group) {
  item.seo.publicStatus = 'published';
  item.seo.approvalStatus = 'approved';
}
const prepared = prepareApprovedSeoRegistration({ draft: approved, sermons, bulletins });
assert.equal(prepared.errors.length, 0);
assert.equal(prepared.data.sermons[0].seo.title, '위기 속의 감사 | 다니엘 6:10 | 파주꽃동산교회 설교');
assert.equal(resolveSeo(prepared.data.sermons[0], { title: '기존 제목', description: '기존 설명' }).title, '위기 속의 감사 | 다니엘 6:10 | 파주꽃동산교회 설교');

const privateCandidate = structuredClone(approved);
privateCandidate.items.sermons[0].seo.description = '문의 010-1234-5678';
assert.ok(prepareApprovedSeoRegistration({ draft: privateCandidate, sermons, bulletins }).errors.some((error) => error.includes('private')));

console.log('seo-content tests: PASS (draft, approval gate, approved metadata, privacy, relative links)');
