import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidContent } from './validate-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const siteOrigin = (process.env.SITE_ORIGIN || 'https://pajuflower.vercel.app').replace(/\/$/, '');

const sermons = JSON.parse(await readFile(path.join(root, 'content', 'sermons.json'), 'utf8'));
const bulletins = JSON.parse(await readFile(path.join(root, 'content', 'bulletins.json'), 'utf8'));
const shellTemplate = await readFile(path.join(root, 'templates', 'content-shell.html'), 'utf8');

assertValidContent({ sermons, bulletins });

const isPublic = (item) => item.publicStatus === 'published' && item.approvalStatus === 'approved';
const publicSermons = sermons.filter(isPublic).sort((a, b) => b.date.localeCompare(a.date));
const publicBulletins = bulletins.filter(isPublic).sort((a, b) => b.date.localeCompare(a.date));

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const canonical = (pathname) => `${siteOrigin}${pathname}`;
const isoDate = (date) => `${date}T00:00:00+09:00`;
const structuredData = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

const shell = ({ title, description, pathname, body, ogType = 'website', jsonLd = [] }) => shellTemplate
  .replaceAll('{{TITLE}}', escapeHtml(title))
  .replaceAll('{{DESCRIPTION}}', escapeHtml(description))
  .replaceAll('{{CANONICAL}}', escapeHtml(canonical(pathname)))
  .replaceAll('{{OG_TYPE}}', escapeHtml(ogType))
  .replaceAll('{{OG_IMAGE}}', escapeHtml(canonical('/assets/paju-flower-logo.png')))
  .replaceAll('{{STRUCTURED_DATA}}', structuredData(jsonLd))
  .replaceAll('{{BODY}}', body);

const sermonById = new Map(publicSermons.map((sermon) => [sermon.id, sermon]));
const bulletinBySermonId = new Map(publicBulletins.map((bulletin) => [bulletin.relatedSermonId, bulletin]));

const breadcrumbJsonLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.pathname === '/' ? 'Home' : item.pathname === '/sermons/' ? 'Sermon archive' : item.pathname === '/bulletins/' ? 'Bulletin archive' : item.name,
    item: canonical(item.pathname)
  }))
});

const sermonCard = (sermon) => `<article class="content-card"><p class="content-eyebrow">설교 · ${escapeHtml(sermon.date)}</p><h2><a href="/sermons/${escapeHtml(sermon.slug)}/">${escapeHtml(sermon.title)}</a></h2><p>${escapeHtml(sermon.scripture)} · ${escapeHtml(sermon.preacher)}</p><a class="content-link" href="/sermons/${escapeHtml(sermon.slug)}/">상세 보기 →</a></article>`;
const bulletinCard = (bulletin) => `<article class="content-card"><p class="content-eyebrow">주보 · ${escapeHtml(bulletin.date)}</p><h2><a href="/bulletins/${escapeHtml(bulletin.slug)}/">${escapeHtml(bulletin.title)}</a></h2><p>${escapeHtml(bulletin.issueNumber)}</p><a class="content-link" href="/bulletins/${escapeHtml(bulletin.slug)}/">상세 보기 →</a></article>`;

const listPage = (kind, items, title, description, cardRenderer, pathname) => shell({
  title,
  description,
  pathname,
  ogType: 'website',
  jsonLd: [breadcrumbJsonLd([
    { name: '홈', pathname: '/' },
    { name: title, pathname }
  ])],
  body: `<section class="content-hero"><p class="content-eyebrow">파주꽃동산교회</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></section><section class="content-grid" aria-label="${escapeHtml(title)} 목록">${items.length ? items.map(cardRenderer).join('') : '<p>공개 승인된 자료가 없습니다.</p>'}</section>`
});

const sermonDetail = (sermon) => {
  const bulletin = bulletinBySermonId.get(sermon.id);
  const video = sermon.youtubeUrl ? `<a class="content-button" href="${escapeHtml(sermon.youtubeUrl)}">YouTube 원본 보기</a>` : '<p class="content-note">공식 YouTube 원본 URL은 확인 후 연결합니다.</p>';
  const bulletinLink = bulletin ? `<a class="content-link" href="/bulletins/${escapeHtml(bulletin.slug)}/">관련 주보 보기 →</a>` : '';
  return shell({
    title: `${sermon.title} | 파주꽃동산교회 설교`,
    description: `${sermon.date} 파주꽃동산교회 설교: ${sermon.title} · ${sermon.scripture}`,
    pathname: `/sermons/${sermon.slug}/`,
    ogType: 'article',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: sermon.title,
        datePublished: isoDate(sermon.date),
        author: { '@type': 'Person', name: sermon.preacher },
        about: { '@type': 'Thing', name: sermon.scripture },
        mainEntityOfPage: canonical(`/sermons/${sermon.slug}/`)
      },
      breadcrumbJsonLd([
        { name: '홈', pathname: '/' },
        { name: '설교 아카이브', pathname: '/sermons/' },
        { name: sermon.title, pathname: `/sermons/${sermon.slug}/` }
      ])
    ],
    body: `<article class="content-detail"><p class="content-eyebrow">설교 · ${escapeHtml(sermon.date)}</p><h1>${escapeHtml(sermon.title)}</h1><dl class="content-meta"><div><dt>성경 본문</dt><dd>${escapeHtml(sermon.scripture)}</dd></div><div><dt>설교자</dt><dd>${escapeHtml(sermon.preacher)}</dd></div></dl><p>${escapeHtml(sermon.summary)}</p><div class="content-actions">${video}${bulletinLink}</div></article>`
  });
};

const bulletinDetail = (bulletin) => {
  const sermon = sermonById.get(bulletin.relatedSermonId);
  const related = sermon ? `<a class="content-link" href="/sermons/${escapeHtml(sermon.slug)}/">관련 설교 보기 →</a>` : '';
  return shell({
    title: `${bulletin.title} | 파주꽃동산교회 주보`,
    description: `${bulletin.date} ${bulletin.issueNumber} 파주꽃동산교회 주보`,
    pathname: `/bulletins/${bulletin.slug}/`,
    ogType: 'article',
    jsonLd: [breadcrumbJsonLd([
      { name: '홈', pathname: '/' },
      { name: '주보 아카이브', pathname: '/bulletins/' },
      { name: bulletin.title, pathname: `/bulletins/${bulletin.slug}/` }
    ])],
    body: `<article class="content-detail"><p class="content-eyebrow">주보 · ${escapeHtml(bulletin.date)}</p><h1>${escapeHtml(bulletin.title)}</h1><dl class="content-meta"><div><dt>호수</dt><dd>${escapeHtml(bulletin.issueNumber)}</dd></div><div><dt>관련 설교</dt><dd>${sermon ? escapeHtml(sermon.title) : '확인 중'}</dd></div></dl><p>${escapeHtml(bulletin.description)}</p><p class="content-note">주보 원본 이미지와 PDF, 개인정보가 포함된 원본 자료는 공개하지 않습니다. 공개 승인된 기본 정보만 제공합니다.</p><div class="content-actions">${related}</div></article>`
  });
};

const writePage = async (relative, content) => {
  const target = path.join(dist, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
};

await writePage('sermons/index.html', listPage('sermons', publicSermons, '설교 아카이브', '파주꽃동산교회의 공개 승인된 설교 목록입니다.', sermonCard, '/sermons/'));
await writePage('bulletins/index.html', listPage('bulletins', publicBulletins, '주보 아카이브', '파주꽃동산교회의 공개 승인된 주보 기본 정보입니다.', bulletinCard, '/bulletins/'));

for (const sermon of publicSermons) await writePage(`sermons/${sermon.slug}/index.html`, sermonDetail(sermon));
for (const bulletin of publicBulletins) await writePage(`bulletins/${bulletin.slug}/index.html`, bulletinDetail(bulletin));

const latest = `<div class="sermon-layout"><article class="sermon-feature"><p class="eyebrow">Message library</p><h3>${escapeHtml(publicSermons[0]?.title || '설교 아카이브')}</h3><p>${escapeHtml(publicSermons[0] ? `${publicSermons[0].scripture} · ${publicSermons[0].preacher}` : '공개 승인된 설교 자료를 준비하고 있습니다.')}</p><a class="btn btn-primary" href="/sermons/">설교 아카이브 보기</a></article><div class="sermon-empty"><p class="eyebrow">Bulletin archive</p><h3>${escapeHtml(publicBulletins[0]?.title || '주보 아카이브')}</h3><p class="muted">${escapeHtml(publicBulletins[0] ? `${publicBulletins[0].issueNumber} · ${publicBulletins[0].date}` : '공개 승인된 주보 자료를 준비하고 있습니다.')}</p><a class="btn btn-outline" href="/bulletins/">주보 아카이브 보기</a></div></div>`;
const homePath = path.join(dist, 'index.html');
const home = await readFile(homePath, 'utf8');
const start = '<!-- GENERATED:latest-content:start -->';
const end = '<!-- GENERATED:latest-content:end -->';
if (!home.includes(start) || !home.includes(end)) throw new Error('dist/index.html is missing latest-content markers');
const updatedHome = home.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n          ${latest}\n          ${end}`);
await writeFile(homePath, updatedHome, 'utf8');

const publicUrls = [
  '/',
  '/sermons/',
  ...publicSermons.map((sermon) => `/sermons/${sermon.slug}/`),
  '/bulletins/',
  ...publicBulletins.map((bulletin) => `/bulletins/${bulletin.slug}/`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicUrls.map((url) => `  <url><loc>${escapeHtml(canonical(url))}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${canonical('/sitemap.xml')}\n`, 'utf8');

console.log(`Generated ${publicSermons.length} sermon(s), ${publicBulletins.length} bulletin(s), and ${publicUrls.length} sitemap URL(s).`);
