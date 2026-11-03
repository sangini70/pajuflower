const isText = (value) => typeof value === 'string' && value.trim().length > 0;

export const isApprovedSeo = (seo) => seo?.publicStatus === 'published' && seo?.approvalStatus === 'approved';
export const resolveSeo = (item, fallback) => isApprovedSeo(item?.seo) ? item.seo : fallback;

const archiveLinks = (kind) => [{ label: kind === 'sermon' ? '설교 목록' : '주보 목록', path: `/${kind === 'sermon' ? 'sermons' : 'bulletins'}/` }];
const koreanDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일` : value;
};
const uniqueKeywords = (values, primary = '') => [...new Set(values.filter(isText).map((value) => value.trim()))]
  .filter((value) => value !== primary);
const summaryExcerpt = (summary) => {
  if (!isText(summary)) return null;
  const normalized = summary.replace(/\s+/g, ' ').trim();
  return normalized.length > 160 ? `${normalized.slice(0, 157).trimEnd()}…` : normalized;
};
const questionCandidates = (summary) => isText(summary)
  ? [...summary.matchAll(/[^.!?。！？]*[?？]/g)].map((match) => match[0].replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 3)
  : [];
const firstChurchNewsLine = (bulletin) => {
  const sections = bulletin?.webEdition?.sections || [];
  for (const section of sections) {
    if (!['church-news', 'church-news-after-schedule'].includes(section.id)) continue;
    for (const item of section.items || []) {
      const line = Array.isArray(item.lines) ? item.lines.find(isText) : null;
      if (line) return line.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
};

const sermonSeo = (sermon, bulletin) => ({
  primaryKeyword: sermon.title,
  secondaryKeywords: uniqueKeywords([sermon.scripture, `${sermon.title} 설교`, '파주꽃동산교회 설교'], sermon.title).slice(0, 5),
  queryKeywords: questionCandidates(sermon.summary),
  title: `${sermon.title} | ${sermon.scripture} | 파주꽃동산교회 설교`,
  description: summaryExcerpt(sermon.summary)
    ? `${koreanDate(sermon.date)} 파주꽃동산교회 설교 「${sermon.title}」. ${summaryExcerpt(sermon.summary)}`
    : `${koreanDate(sermon.date)} 파주꽃동산교회 설교: ${sermon.title} · ${sermon.scripture}`,
  internalLinks: [...archiveLinks('sermon'), ...(bulletin ? [{ label: bulletin.title, path: `/bulletins/${bulletin.slug}/` }] : [])],
  searchDataStatus: '미검증',
  reviewRequired: [!isText(sermon.summary) ? 'sermon.summary' : null, questionCandidates(sermon.summary).length ? null : 'sermon.queryKeywords'].filter(Boolean),
  publicStatus: 'pending',
  approvalStatus: 'pending'
});

const bulletinSeo = (bulletin, sermon) => {
  const date = koreanDate(bulletin.date);
  const newsLine = firstChurchNewsLine(bulletin);
  const descriptionParts = [
    `${date} 파주꽃동산교회 주보`,
    sermon ? `설교: ${sermon.title}(${sermon.scripture})` : null,
    newsLine ? `교회 소식: ${newsLine}` : null
  ].filter(Boolean);
  return {
  primaryKeyword: `${date} 주보`,
  secondaryKeywords: uniqueKeywords([bulletin.issueNumber, '파주꽃동산교회 주보'], `${date} 주보`).slice(0, 5),
  queryKeywords: uniqueKeywords([`${date} 주보`, `${bulletin.issueNumber} 주보`], `${date} 주보`),
  title: `${date} 주보 | 파주꽃동산교회`,
  description: descriptionParts.join('. '),
  internalLinks: [...archiveLinks('bulletin'), ...(sermon ? [{ label: sermon.title, path: `/sermons/${sermon.slug}/` }] : [])],
  searchDataStatus: '미검증',
  reviewRequired: [!sermon ? 'bulletin.relatedSermonId' : null, !newsLine ? 'bulletin.webEdition.churchNews' : null].filter(Boolean),
  publicStatus: 'pending',
  approvalStatus: 'pending'
  };
};

export const createSeoDraft = ({ sermons, bulletins }) => {
  const publicSermons = sermons.filter((item) => item?.publicStatus === 'published' && item?.approvalStatus === 'approved');
  const publicBulletins = bulletins.filter((item) => item?.publicStatus === 'published' && item?.approvalStatus === 'approved');
  const sermonsById = new Map(publicSermons.map((item) => [item.id, item]));
  const bulletinsBySermonId = new Map(publicBulletins.map((item) => [item.relatedSermonId, item]));
  return {
    schemaVersion: 1,
    draftType: 'seo',
    draftStatus: 'REVIEW_REQUIRED',
    generatedAt: new Date().toISOString(),
    source: { contentFiles: ['content/sermons.json', 'content/bulletins.json'] },
    items: {
      sermons: publicSermons.map((item) => ({ id: item.id, date: item.date, seo: sermonSeo(item, bulletinsBySermonId.get(item.id)) })),
      bulletins: publicBulletins.map((item) => ({ id: item.id, date: item.date, seo: bulletinSeo(item, sermonsById.get(item.relatedSermonId)) }))
    },
    approval: { approved: false, approvedBy: null, approvedAt: null }
  };
};

const validPath = (value, knownPaths) => isText(value) && knownPaths.has(value);
const validateSeo = (seo, path, knownPaths) => {
  const errors = [];
  for (const field of ['primaryKeyword', 'title', 'description']) if (!isText(seo?.[field])) errors.push(`${path}.${field} is required`);
  for (const field of ['secondaryKeywords', 'queryKeywords', 'internalLinks']) if (!Array.isArray(seo?.[field])) errors.push(`${path}.${field} must be an array`);
  if (Array.isArray(seo?.internalLinks)) for (const [index, link] of seo.internalLinks.entries()) {
    if (!isText(link?.label) || !validPath(link?.path, knownPaths)) errors.push(`${path}.internalLinks[${index}] must use an existing relative path`);
  }
  if (seo?.searchDataStatus !== '미검증') errors.push(`${path}.searchDataStatus must remain 미검증 without external search data`);
  if (seo?.publicStatus !== 'published' || seo?.approvalStatus !== 'approved') errors.push(`${path} must be approved`);
  if (/REFERENCE[\\/]|(?:01[016789][ -]?\d{3,4}[ -]?\d{4})|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(JSON.stringify(seo))) errors.push(`${path} contains private data`);
  return errors;
};

export const prepareApprovedSeoRegistration = ({ draft, sermons, bulletins, scope = 'both' }) => {
  const errors = [];
  if (draft?.draftType !== 'seo') errors.push('draftType must be seo');
  if (draft?.draftStatus !== 'APPROVED') errors.push('draftStatus must be APPROVED');
  if (draft?.approval?.approved !== true) errors.push('approval.approved must be true');
  if (!isText(draft?.approval?.approvedBy)) errors.push('approval.approvedBy is required');
  if (!isText(draft?.approval?.approvedAt)) errors.push('approval.approvedAt is required');
  if (!['both', 'sermon', 'bulletin'].includes(scope)) errors.push(`unsupported scope: ${scope}`);
  const items = draft?.items || {};
  const sermonMap = new Map(sermons.map((item) => [item.id, item]));
  const bulletinMap = new Map(bulletins.map((item) => [item.id, item]));
  const knownPaths = new Set(['/', '/sermons/', '/bulletins/']);
  for (const item of sermons) knownPaths.add(`/sermons/${item.slug}/`);
  for (const item of bulletins) knownPaths.add(`/bulletins/${item.slug}/`);
  const update = (source, map, key, label) => {
    if (!Array.isArray(source)) return;
    for (const [index, item] of source.entries()) {
      const current = map.get(item?.id);
      if (!current) { errors.push(`${label}[${index}] unknown content id`); continue; }
      errors.push(...validateSeo(item.seo, `${label}[${index}].seo`, knownPaths));
    }
  };
  if (scope !== 'bulletin') update(items.sermons, sermonMap, 'id', 'items.sermons');
  if (scope !== 'sermon') update(items.bulletins, bulletinMap, 'id', 'items.bulletins');
  if (errors.length) return { errors, data: null };
  const approvedAt = draft.approval.approvedAt.slice(0, 10);
  const sermonsNext = scope === 'bulletin' ? sermons : sermons.map((item) => {
    const candidate = items.sermons.find((entry) => entry.id === item.id);
    return candidate ? { ...item, seo: { ...candidate.seo, updatedAt: approvedAt } } : item;
  });
  const bulletinsNext = scope === 'sermon' ? bulletins : bulletins.map((item) => {
    const candidate = items.bulletins.find((entry) => entry.id === item.id);
    return candidate ? { ...item, seo: { ...candidate.seo, updatedAt: approvedAt } } : item;
  });
  return { errors: [], data: { sermons: sermonsNext, bulletins: bulletinsNext } };
};
