import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createContentDraft } from './create-content-draft.mjs';
import { registerApprovedDraft, writeContentFiles } from './register-approved-content.mjs';
import { validateContent } from './validate-content.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'paju-weekly-e2e-'));
const tempContent = path.join(tempRoot, 'content');
const tempDist = path.join(tempRoot, 'dist');
const tempScripts = path.join(tempRoot, 'scripts');

const loadJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const saveJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const fakeInput = {
  source: {
    directory: 'TEST_ONLY_PRIVATE_INPUT/2026-10-11',
    files: ['private-p01.jpg', 'private-p02.jpg', 'private-p03.jpg', 'private-p04.jpg']
  },
  extracted: {
    bulletin: {
      date: '2026-10-11',
      issueNumber: 'E2E TEST ONLY ISSUE 999',
      title: 'E2E TEST ONLY Bulletin',
      description: 'E2E TEST ONLY public bulletin description',
      slug: '2026-10-11'
    },
    sermon: {
      date: '2026-10-11',
      title: 'E2E TEST ONLY Sermon',
      scripture: 'E2E TEST ONLY 1:1',
      preacher: 'E2E TEST ONLY Speaker',
      summary: 'E2E TEST ONLY summary',
      slug: 'e2e-test-only-sermon-2026-10-11'
    }
  },
  evidence: [{ field: 'sermon.title', sourceFile: 'private-p03.jpg' }]
};

const approveForTest = (draft) => ({
  ...draft,
  draftStatus: 'APPROVED',
  approval: {
    approved: true,
    approvedBy: 'E2E TEST ONLY reviewer',
    approvedAt: '2026-10-11T10:00:00+09:00',
    publicStatus: 'published',
    approvalStatus: 'approved'
  }
});

const copyFixture = async () => {
  await cp(path.join(projectRoot, 'dist'), tempDist, { recursive: true });
  await cp(path.join(projectRoot, 'templates'), path.join(tempRoot, 'templates'), { recursive: true });
  await cp(path.join(projectRoot, 'scripts', 'generate-static-content.mjs'), path.join(tempScripts, 'generate-static-content.mjs'));
  await cp(path.join(projectRoot, 'scripts', 'validate-content.mjs'), path.join(tempScripts, 'validate-content.mjs'));
  await cp(path.join(projectRoot, 'scripts', 'copy-static-content.mjs'), path.join(tempScripts, 'copy-static-content.mjs'));
};

const readPublicFiles = async () => {
  const files = [
    'index.html',
    'sermons/index.html',
    'sermons/e2e-test-only-sermon-2026-10-11/index.html',
    'bulletins/index.html',
    'bulletins/2026-10-11/index.html',
    'sitemap.xml',
    'robots.txt'
  ];
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(path.join(tempDist, file), 'utf8')])));
};

try {
  await copyFixture();
  await mkdir(tempContent, { recursive: true });
  const sermonsFile = path.join(tempContent, 'sermons.json');
  const bulletinsFile = path.join(tempContent, 'bulletins.json');
  const originalSermons = await loadJson(path.join(projectRoot, 'content', 'sermons.json'));
  const originalBulletins = await loadJson(path.join(projectRoot, 'content', 'bulletins.json'));

  const draft = createContentDraft({ input: fakeInput, sermons: originalSermons, bulletins: originalBulletins });
  assert.equal(draft.draftStatus, 'REVIEW_REQUIRED');
  assert.equal(draft.approval.approved, undefined);
  assert.equal(draft.source.originalsCopied, false);
  assert.equal(draft.publicFields.sermon.youtubeUrl, null);
  assert.ok(draft.source.directory.includes('TEST_ONLY_PRIVATE_INPUT'));

  await saveJson(sermonsFile, originalSermons);
  await saveJson(bulletinsFile, originalBulletins);
  const tempWrite = (data) => writeContentFiles({ ...data, sermonsFile, bulletinsFile });
  let writerCalls = 0;
  await assert.rejects(
    registerApprovedDraft({
      draft,
      sermons: originalSermons,
      bulletins: originalBulletins,
      writeFiles: async () => { writerCalls += 1; }
    }),
    /registration failed/
  );
  assert.equal(writerCalls, 0);

  const approvedDraft = approveForTest(draft);
  const registered = await registerApprovedDraft({
    draft: approvedDraft,
    sermons: originalSermons,
    bulletins: originalBulletins,
    writeFiles: tempWrite
  });
  assert.equal(registered.sermons.length, originalSermons.length + 1);
  assert.equal(registered.bulletins.length, originalBulletins.length + 1);
  assert.equal(registered.sermons.at(-1).title, 'E2E TEST ONLY Sermon');
  assert.equal(registered.bulletins.at(-1).relatedSermonId, registered.sermons.at(-1).id);
  assert.equal(Object.hasOwn(registered.sermons.at(-1), 'sourceReference'), false);
  assert.equal(Object.hasOwn(registered.bulletins.at(-1), 'evidence'), false);
  assert.deepEqual(validateContent({ sermons: registered.sermons, bulletins: registered.bulletins }), []);

  await assert.rejects(
    registerApprovedDraft({ draft: approvedDraft, sermons: registered.sermons, bulletins: registered.bulletins, writeFiles: tempWrite }),
    /duplicate/
  );

  await saveJson(sermonsFile, registered.sermons);
  await saveJson(bulletinsFile, registered.bulletins);
  await execFileAsync(process.execPath, [path.join(tempScripts, 'generate-static-content.mjs')], {
    cwd: tempRoot,
    env: { ...process.env, SITE_ORIGIN: 'https://pajuflower.vercel.app' }
  });
  const publicFiles = await readPublicFiles();
  assert.match(publicFiles['sermons/index.html'], /e2e-test-only-sermon-2026-10-11/);
  assert.match(publicFiles['sermons/e2e-test-only-sermon-2026-10-11/index.html'], /E2E TEST ONLY Sermon/);
  assert.match(publicFiles['bulletins/index.html'], /2026-10-11/);
  assert.match(publicFiles['bulletins/2026-10-11/index.html'], /E2E TEST ONLY Bulletin/);
  assert.match(publicFiles['index.html'], /E2E TEST ONLY Sermon/);
  assert.match(publicFiles['index.html'], /E2E TEST ONLY Bulletin/);
  assert.match(publicFiles['sermons/e2e-test-only-sermon-2026-10-11/index.html'], /rel="canonical" href="https:\/\/pajuflower\.vercel\.app\/sermons\/e2e-test-only-sermon-2026-10-11\//);
  assert.match(publicFiles['sermons/e2e-test-only-sermon-2026-10-11/index.html'], /property="og:title"/);
  assert.match(publicFiles['sermons/e2e-test-only-sermon-2026-10-11/index.html'], /Article/);
  assert.match(publicFiles['sermons/e2e-test-only-sermon-2026-10-11/index.html'], /BreadcrumbList/);
  assert.match(publicFiles['bulletins/2026-10-11/index.html'], /BreadcrumbList/);
  assert.match(publicFiles['sitemap.xml'], /https:\/\/pajuflower\.vercel\.app\/sermons\/e2e-test-only-sermon-2026-10-11\//);
  assert.match(publicFiles['sitemap.xml'], /https:\/\/pajuflower\.vercel\.app\/bulletins\/2026-10-11\//);
  assert.match(publicFiles['robots.txt'], /Sitemap: https:\/\/pajuflower\.vercel\.app\/sitemap\.xml/);
  for (const [file, content] of Object.entries(publicFiles)) {
    assert.doesNotMatch(content, /TEST_ONLY_PRIVATE_INPUT|private-p0|sourceReference|evidence/i, `private data leaked in ${file}`);
    if (file !== 'index.html') assert.doesNotMatch(content, /010-\d{4}-\d{4}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, `private contact leaked in ${file}`);
  }

  await execFileAsync(process.execPath, [
    path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
    tempDist,
    '--outDir',
    path.join(tempRoot, 'vercel-build'),
    '--emptyOutDir'
  ], { cwd: tempRoot });
  await execFileAsync(process.execPath, [path.join(tempScripts, 'copy-static-content.mjs')], { cwd: tempRoot });
  assert.ok(await readFile(path.join(tempRoot, 'vercel-build', 'index.html'), 'utf8'));
  assert.ok(await readFile(path.join(tempRoot, 'vercel-build', 'sermons', 'e2e-test-only-sermon-2026-10-11', 'index.html'), 'utf8'));

  console.log('weekly-content-e2e: PASS (draft, approval gate, registration, duplicate guard, static pages, metadata, sitemap, privacy)');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
