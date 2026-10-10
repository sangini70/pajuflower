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
const newestFirst = (a, b) => b.date.localeCompare(a.date) || String(a.id || a.slug).localeCompare(String(b.id || b.slug));
const publicSermons = sermons.filter(isPublic).sort(newestFirst);
const publicBulletins = bulletins.filter(isPublic).sort(newestFirst);

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const canonical = (pathname) => `${siteOrigin}${pathname}`;
const isoDate = (date) => `${date}T00:00:00+09:00`;
const structuredData = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const youtubeIdFromUrl = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    let id = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) && url.pathname === '/watch') id = url.searchParams.get('v');
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
};
const youtubeEmbed = (sermon, compact = false) => {
  const videoId = youtubeIdFromUrl(sermon.youtubeUrl);
  if (!videoId) return '';
  const title = `${sermon.title} YouTube video`;
  return `<div class="sermon-video${compact ? ' sermon-video-compact' : ''}"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${escapeHtml(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
};

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
  const videoId = youtubeIdFromUrl(sermon.youtubeUrl);
  const video = videoId ? `${youtubeEmbed(sermon)}<a class="content-button" href="${escapeHtml(sermon.youtubeUrl)}" target="_blank" rel="noopener noreferrer">유튜브에서 보기</a>` : '';
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

const approvedDetail = (item) => item?.publicStatus === 'published' && item?.approvalStatus === 'approved';
const approvedSectionItems = (section) => {
  if (Array.isArray(section)) return section.filter(approvedDetail);
  if (!approvedDetail(section) || !Array.isArray(section.items)) return [];
  return section.items.filter(approvedDetail);
};
const bulletinSection = (title, content) => content ? `<section class="bulletin-section"><h2>${escapeHtml(title)}</h2>${content}</section>` : '';
const bulletinPage = (number, title, content) => `<section class="bulletin-page" aria-labelledby="bulletin-page-${number}"><p class="bulletin-page-label">PAGE ${number}</p><h2 id="bulletin-page-${number}">${escapeHtml(title)}</h2>${content}</section>`;
const bulletinList = (items, renderer) => items.length ? `<ul class="bulletin-list">${items.map((item) => `<li>${renderer(item)}</li>`).join('')}</ul>` : '';
const bulletinOrderSection = (bulletin) => {
  const items = approvedSectionItems(bulletin.worshipOrder);
  return bulletinSection('주일예배 순서', bulletinList(items, (item) => `<strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.content)}${item.response ? ` · ${escapeHtml(item.response)}` : ''}</span>`));
};
const bulletinNewsSection = (bulletin) => {
  const items = approvedSectionItems(bulletin.churchNews);
  return bulletinSection('교회 소식', bulletinList(items, (item) => `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span>`));
};
const bulletinScheduleSection = (bulletin) => {
  const items = approvedSectionItems(bulletin.worshipSchedule);
  if (!items.length) return '';
  const rows = items.map((item) => `<div class="bulletin-table-row"><span>${escapeHtml(item.date)}</span><span>${escapeHtml(item.prayer)}</span><span>${escapeHtml(item.specialSong)}</span></div>`).join('');
  return bulletinSection('예배 기도 및 특송 일정', `<div class="bulletin-table" role="table" aria-label="예배 기도 및 특송 일정"><div class="bulletin-table-row bulletin-table-head" role="row"><span>날짜</span><span>기도</span><span>특송</span></div>${rows}</div>`);
};
const bulletinTextSection = (bulletin, field, title) => {
  const items = approvedSectionItems(bulletin[field]);
  return bulletinSection(title, bulletinList(items, (item) => `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span>`));
};

const bulletinDetail = (bulletin) => {
  const sermon = sermonById.get(bulletin.relatedSermonId);
  const sermonSection = sermon ? bulletinSection('설교', `<dl class="content-meta bulletin-sermon-meta"><div><dt>제목</dt><dd>${escapeHtml(sermon.title)}</dd></div><div><dt>성경 본문</dt><dd>${escapeHtml(sermon.scripture)}</dd></div><div><dt>설교자</dt><dd>${escapeHtml(sermon.preacher)}</dd></div></dl>`) : '';
  const theme = approvedDetail(bulletin.monthlyTheme) ? bulletinSection('이번 달 안내', `<div class="bulletin-theme"><strong>${escapeHtml(bulletin.monthlyTheme.month)}</strong><span>${escapeHtml(bulletin.monthlyTheme.title)}</span></div>`) : '';
  const page1 = bulletinPage(1, '교회 및 주보 기본 정보', `<dl class="content-meta"><div><dt>주보 날짜</dt><dd>${escapeHtml(bulletin.date)}</dd></div><div><dt>호수</dt><dd>${escapeHtml(bulletin.issueNumber)}</dd></div></dl><p>${escapeHtml(bulletin.description)}</p>`);
  const page2 = bulletinPage(2, '교회 소식과 안내', [theme, bulletinNewsSection(bulletin), bulletinScheduleSection(bulletin), bulletinTextSection(bulletin, 'faithGuide', '신앙생활을 위한 10가지 믿음의 행동')].join(''));
  const page3 = bulletinPage(3, '설교 말씀', `${sermonSection}${sermon ? `<p class="bulletin-sermon-summary">${escapeHtml(sermon.summary)}</p>` : ''}`);
  const page4 = bulletinPage(4, '예배 순서와 기도 안내', [bulletinOrderSection(bulletin), bulletinTextSection(bulletin, 'prayerTopics', '교회 기도 제목')].join(''));
  const details = `${page1}${page2}${page3}${page4}`;
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
    body: `<article class="content-detail bulletin-detail"><p class="content-eyebrow">주보 · ${escapeHtml(bulletin.date)}</p><h1>${escapeHtml(bulletin.title)}</h1><p class="bulletin-related">관련 설교: ${sermon ? escapeHtml(sermon.title) : '확인 중'}</p>${details}</article>`
  });
};

const bulletinNewsCard = (bulletin) => {
  const featured = approvedDetail(bulletin?.featuredChurchNews) ? bulletin.featuredChurchNews : null;
  if (!featured) return '';
  return `<article class="church-news-card"><h3>이번 주 교회 소식</h3><div class="church-news-item"><strong>${escapeHtml(featured.title)}</strong><p>${escapeHtml(featured.description)}</p></div></article>`;
};

const writePage = async (relative, content) => {
  const target = path.join(dist, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
};

await writePage('sermons/index.html', listPage('sermons', publicSermons, '설교 목록', '파주꽃동산교회의 지난 설교를 모아 놓은 목록입니다.', sermonCard, '/sermons/'));
await writePage('bulletins/index.html', listPage('bulletins', publicBulletins, '지난 주보', '파주꽃동산교회의 지난 주보를 확인하실 수 있습니다.', bulletinCard, '/bulletins/'));

for (const sermon of publicSermons) await writePage(`sermons/${sermon.slug}/index.html`, sermonDetail(sermon));
for (const bulletin of publicBulletins) await writePage(`bulletins/${bulletin.slug}/index.html`, bulletinDetail(bulletin));

const latestSermon = publicSermons[0];
const latestSermonVideo = latestSermon ? youtubeEmbed(latestSermon, true) : '';
const latest = `<div class="sermon-layout"><article class="sermon-feature"><p class="eyebrow">최근 설교</p><h3>${escapeHtml(latestSermon?.title || '설교 목록')}</h3><p>${escapeHtml(latestSermon ? `${latestSermon.date} · ${latestSermon.scripture} · ${latestSermon.preacher}` : '공개 승인된 설교 자료를 준비하고 있습니다.')}</p>${latestSermonVideo}<a class="btn btn-primary" href="${latestSermon ? `/sermons/${escapeHtml(latestSermon.slug)}/` : '/sermons/'}">설교 보기</a></article><div class="sermon-side"><div class="sermon-empty"><div class="bulletin-card-content"><p class="eyebrow">최근 주보</p><h3>${escapeHtml(publicBulletins[0]?.title || '지난 주보')}</h3><p class="muted">${escapeHtml(publicBulletins[0] ? `${publicBulletins[0].issueNumber} · ${publicBulletins[0].date}` : '공개 승인된 주보 자료를 준비하고 있습니다.')}</p><a class="btn btn-outline" href="/bulletins/">주보 보기</a></div></div>${bulletinNewsCard(publicBulletins[0])}</div></div>`;
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
