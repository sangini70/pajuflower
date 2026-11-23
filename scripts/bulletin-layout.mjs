const isApproved = (item) => item?.publicStatus === 'published' && item?.approvalStatus === 'approved';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const approvedItems = (section) => {
  if (Array.isArray(section)) return section.filter(isApproved);
  if (!isApproved(section) || !Array.isArray(section.items)) return [];
  return section.items.filter(isApproved);
};

const listBlock = (id, type, title, items, sourcePaths, format = 'list') => ({
  id, type, title, preferredFormat: format, splittable: true, sourcePaths,
  approvalState: 'published-approved', items, estimatedHeight: items.length
});

const editionSourcePaths = (section, index) => {
  const base = `webEdition.sections[${index}]`;
  if (Array.isArray(section.rows)) return section.rows.map((_, rowIndex) => `${base}.rows[${rowIndex}]`);
  if (Array.isArray(section.items)) return section.items.map((_, itemIndex) => `${base}.items[${itemIndex}]`);
  if (Array.isArray(section.paragraphs) || Array.isArray(section.subsections)) return [
    ...(section.paragraphs || []).map((_, itemIndex) => `${base}.paragraphs[${itemIndex}]`),
    ...(section.subsections || []).map((_, itemIndex) => `${base}.subsections[${itemIndex}]`),
    ...(section.conclusion ? [`${base}.conclusion`] : [])
  ];
  return Object.keys(section).filter((key) => !['id', 'sourcePage', 'sourceOrder', 'type', 'publicStatus', 'approvalStatus', 'title'].includes(key)).map((key) => `${base}.${key}`);
};

const createWebEditionDocument = (bulletin, sermon) => {
  const edition = bulletin.webEdition;
  const rawSections = edition.sections
    .filter(isApproved)
    .sort((a, b) => a.sourcePage - b.sourcePage || a.sourceOrder - b.sourceOrder);
  const sundaySchool = rawSections.find((section) => section.id === 'sunday-school');
  const sundaySchedule = rawSections.find((section) => section.id === 'sunday-schedule');
  const normalizedSections = rawSections.map((section) => {
    if (section.id === 'sunday-school' && sundaySchedule) {
      return {
        ...section,
        title: section.title || '주일학교 오전 9:30',
        subtitle: section.subtitle || '오전 9:30 / 최민솔 전도사',
        columns: sundaySchedule.columns,
        rows: sundaySchedule.rows,
        sourcePaths: [
          ...editionSourcePaths(section, edition.sections.indexOf(section)),
          ...editionSourcePaths(sundaySchedule, edition.sections.indexOf(sundaySchedule))
        ]
      };
    }
    if (section.id === 'sunday-schedule' && sundaySchool) {
      return {
        ...section,
        title: '',
        columns: undefined,
        rows: sundaySchool.rows,
        sourcePaths: [
          ...editionSourcePaths(section, edition.sections.indexOf(section)),
          ...editionSourcePaths(sundaySchool, edition.sections.indexOf(sundaySchool))
        ]
      };
    }
    return section;
  });
  const blocks = normalizedSections
    .map((section) => ({
      ...section,
      sourcePaths: section.sourcePaths || editionSourcePaths(section, bulletin.webEdition.sections.indexOf(section)),
      approvalState: 'published-approved',
      preferredFormat: section.type,
      splittable: ['table', 'numbered-list', 'text-list'].includes(section.type)
    }));
  return {
    metadata: { date: bulletin.date, issueNumber: bulletin.issueNumber, title: bulletin.title },
    blocks,
    relatedSermon: sermon ? { id: sermon.id, slug: sermon.slug } : null,
    sourcePaths: blocks.flatMap((block) => block.sourcePaths),
    validation: { sourceBulletinId: bulletin.id, approvedOnly: true, edition: 'webEdition' }
  };
};

const createLegacyDocument = (bulletin, sermon) => {
  const blocks = [{
    id: 'metadata.identity', type: 'metadata', title: '주보 기본 정보', preferredFormat: 'header', splittable: false,
    sourcePaths: ['date', 'issueNumber', 'title', 'description'], approvalState: 'published-approved',
    items: [{ date: bulletin.date, issueNumber: bulletin.issueNumber, title: bulletin.title, description: bulletin.description }], estimatedHeight: 1
  }];
  const worshipOrder = approvedItems(bulletin.worshipOrder).map((item) => ({ ...item, sourcePath: `worshipOrder.items[${bulletin.worshipOrder.items.indexOf(item)}]` }));
  if (worshipOrder.length) blocks.push(listBlock('worship-order', 'worship-order', '주일예배 순서', worshipOrder, worshipOrder.map((item) => item.sourcePath), 'table'));
  if (sermon) blocks.push({ id: 'sermon-summary', type: 'sermon', title: '설교 말씀', preferredFormat: 'info', splittable: false, sourcePaths: [`sermon:${sermon.id}`], approvalState: 'published-approved', items: [sermon], estimatedHeight: 1 });
  if (isApproved(bulletin.monthlyTheme)) blocks.push({ id: 'monthly-theme', type: 'theme', title: '이번 달 안내', preferredFormat: 'info', splittable: false, sourcePaths: ['monthlyTheme'], approvalState: 'published-approved', items: [{ ...bulletin.monthlyTheme }], estimatedHeight: 1 });
  const churchNews = approvedItems(bulletin.churchNews).map((item) => ({ ...item, sourcePath: `churchNews[${bulletin.churchNews.indexOf(item)}]` }));
  if (churchNews.length) blocks.push(listBlock('church-news', 'church-news', '교회 소식', churchNews, churchNews.map((item) => item.sourcePath)));
  const schedule = approvedItems(bulletin.worshipSchedule).map((item) => ({ ...item, sourcePath: `worshipSchedule[${bulletin.worshipSchedule.indexOf(item)}]` }));
  if (schedule.length) blocks.push(listBlock('worship-schedule', 'schedule', '예배 기도 및 특송 일정', schedule, schedule.map((item) => item.sourcePath), 'table'));
  for (const [field, id, type, title] of [['faithGuide', 'faith-guide', 'faith-guide', '신앙생활을 위한 10가지 믿음의 행동'], ['prayerTopics', 'prayer-topics', 'prayer-topics', '교회 기도 제목']]) {
    const items = approvedItems(bulletin[field]).map((item) => ({ ...item, sourcePath: `${field}.items[${bulletin[field].items.indexOf(item)}]` }));
    if (items.length) blocks.push(listBlock(id, type, title, items, items.map((item) => item.sourcePath)));
  }
  return { metadata: { date: bulletin.date, issueNumber: bulletin.issueNumber, title: bulletin.title }, blocks, relatedSermon: sermon ? { id: sermon.id, slug: sermon.slug } : null, sourcePaths: blocks.flatMap((block) => block.sourcePaths), validation: { sourceBulletinId: bulletin.id, approvedOnly: true, edition: 'legacy' } };
};

export const createBulletinDocument = (bulletin, sermon) => isApproved(bulletin.webEdition) ? createWebEditionDocument(bulletin, sermon) : createLegacyDocument(bulletin, sermon);

const section = (title, content, className = '') => content ? `<section class="bulletin-section bulletin-block-${className || 'section'}">${title ? `<h2>${escapeHtml(title)}</h2>` : ''}${content}</section>` : '';
const compactList = (items, renderer, ordered = false) => `<${ordered ? 'ol' : 'ul'} class="bulletin-list">${items.map((item) => `<li>${renderer(item)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const tableColumnCount = (columns, rows) => {
  const widths = [Array.isArray(columns) ? columns.length : 0, ...rows.map((row) => row.length)].filter(Boolean);
  const columnCount = Math.max(...widths, 0);
  if (columnCount < 1 || widths.some((width) => width !== columnCount)) throw new Error('Bulletin table has inconsistent column counts');
  return columnCount;
};
const table = (columns, rows, leadingMarker = false) => {
  const columnCount = tableColumnCount(columns, rows);
  const markerClass = leadingMarker || columns?.[0] === '' ? ' bulletin-table-leading-marker' : '';
  return `<div class="bulletin-table bulletin-table-columns-${columnCount}${markerClass}" role="table">${columns?.length ? `<div class="bulletin-table-row bulletin-table-head" role="row">${columns.map((column) => `<span>${escapeHtml(column)}</span>`).join('')}</div>` : ''}${rows.map((row) => `<div class="bulletin-table-row" role="row">${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join('')}</div>`).join('')}</div>`;
};

const renderMetadata = (block) => {
  const item = block.items[0];
  return `<header class="bulletin-identity"><h1>${escapeHtml(item.title)}</h1><dl class="content-meta"><div><dt>날짜</dt><dd>${escapeHtml(item.date)}</dd></div><div><dt>권호</dt><dd>${escapeHtml(item.issueNumber)}</dd></div></dl></header>`;
};
const renderWorshipOrder = (block) => table(['순서', '내용', '담당'], block.items.map((item) => [item.label, item.content, item.response || '']));
const renderSermon = (block) => { const sermon = block.items[0]; return `<dl class="content-meta bulletin-sermon-meta"><div><dt>제목</dt><dd>${escapeHtml(sermon.title)}</dd></div><div><dt>성경 본문</dt><dd>${escapeHtml(sermon.scripture)}</dd></div><div><dt>설교자</dt><dd>${escapeHtml(sermon.preacher)}</dd></div></dl>`; };
const renderTheme = (block) => `<div class="bulletin-theme"><strong>${escapeHtml(block.items[0].month)}</strong><span>${escapeHtml(block.items[0].title)}</span></div>`;
const renderNews = (block) => compactList(block.items, (item) => `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span>`);
const renderSchedule = (block) => table(['날짜', '기도', '특송'], block.items.map((item) => [item.date, item.prayer, item.specialSong]));
const renderTextList = (block) => compactList(block.items, (item) => `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span>`);
const renderCover = (block) => `<header class="bulletin-identity"><h1>${escapeHtml(block.churchName)}</h1><p>${escapeHtml(block.issueNumber)}</p><p>${escapeHtml(block.establishedDate)}</p><p>${escapeHtml(block.date)}</p><p>${escapeHtml(block.proclamation)}</p><p>${escapeHtml(block.verse)} ${escapeHtml(block.verseReference)}</p></header>`;
const renderEditionTable = (block) => {
  const hasMarker = block.leadingMarker || block.rows?.some((row) => row?.[0] === '*');
  const columns = noHeaderTableBlocks.has(block.id) ? undefined : block.columns;
  return `${block.subtitle ? `<p>${escapeHtml(block.subtitle)}</p>` : ''}${(block.facts || []).map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}${table(columns, block.rows, hasMarker)}`;
};
const numberedItemParts = (item, index) => {
  if (Array.isArray(item)) return { number: item[0] ?? String(index + 1), lines: item.slice(1) };
  if (typeof item === 'string') return { number: String(index + 1), lines: [item] };
  return { number: item?.number ?? String(index + 1), lines: item?.lines || [] };
};
const renderEditionNumberedList = (block) => `<ol class="bulletin-list bulletin-numbered-list">${block.items.map((item, index) => { const parts = numberedItemParts(item, index); return `<li><strong class="bulletin-item-number">${escapeHtml(parts.number)}</strong><div class="bulletin-item-content">${parts.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div></li>`; }).join('')}</ol>`;
const renderEditionTextList = (block) => compactList(block.items, (item) => `<span>${escapeHtml(item)}</span>`);
const renderArticle = (block) => `${(block.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${(block.subsections || []).map((subsection) => `<section><h3>${escapeHtml(subsection.title)}</h3>${subsection.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}${block.conclusion ? `<p>${escapeHtml(block.conclusion)}</p>` : ''}`;
const renderVerse = (block) => `<p>${escapeHtml(block.text)}</p><p>${escapeHtml(block.reference)}</p>`;
const renderService = (block) => `${block.subtitle ? `<p>${escapeHtml(block.subtitle)}</p>` : ''}${(block.facts || []).map((fact) => `<p>${escapeHtml(fact)}</p>`).join('')}${table(block.columns, block.rows, block.leadingMarker || block.rows?.some((row) => row?.[0] === '*'))}${block.footnote ? `<p>${escapeHtml(block.footnote)}</p>` : ''}`;
const defaultSectionTitles = {
  'church-news': '교회 소식',
  'worship-schedule': '교회 행사와 예배 기도자, 특송',
  'prayer-topics': '<파주꽃동산교회의 기도제목>',
  'faith-guide': '<신앙생활을 위한 10가지 믿음의 행동>',
  'memory-verse': '이번 주 말씀 암송',
  'missionary-public': '우리가 섬기는 선교사',
  'sunday-worship': '주일낮예배',
  'next-week-volunteers': '다음 주 봉사자',
  'sunday-school': '주일학교 오전 9:30',
  'sunday-schedule': '',
  'middle-school-study': '중고등부 성경공부 모임',
  'wednesday-prayer': '수요 기도회',
  'friday-prayer': '금요 기도회',
  'dawn-prayer': '새벽 기도회 (월-금)'
};
const noHeaderTableBlocks = new Set(['sunday-worship', 'next-week-volunteers', 'sunday-schedule']);

const validateBulletinBlock = (block) => {
  if (!block?.id || !block?.type) throw new Error('Bulletin layout block is missing id or type');
  if (['table', 'service'].includes(block.type)) {
    if (!Array.isArray(block.rows) || !block.rows.length) throw new Error(`${block.id} must contain at least one table row`);
    tableColumnCount(block.columns, block.rows);
    if (block.rows.some((row) => !row.some((cell) => String(cell || '').trim()))) throw new Error(`${block.id} contains an empty table row`);
  }
  if (['numbered-list', 'text-list'].includes(block.type) && (!Array.isArray(block.items) || !block.items.length)) throw new Error(`${block.id} must contain visible list items`);
  if (block.type === 'article') {
    const hasParagraph = block.paragraphs?.some((paragraph) => paragraph?.trim());
    const hasSubsection = block.subsections?.some((subsection) => subsection?.title?.trim() && subsection.paragraphs?.some((paragraph) => paragraph?.trim()));
    const hasConclusion = block.conclusion?.trim();
    if (!hasParagraph && !hasSubsection && !hasConclusion) throw new Error(`${block.id} must contain visible article text`);
    if (block.subsections?.some((subsection) => !subsection?.title?.trim() || !subsection.paragraphs?.some((paragraph) => paragraph?.trim()))) throw new Error(`${block.id} contains a subsection without an explanation paragraph`);
  }
  if (block.type === 'verse' && (!block.text?.trim() || !block.reference?.trim())) throw new Error(`${block.id} must contain verse text and reference`);
};

const blockVisibleStrings = (block) => {
  const values = [];
  const add = (value) => { if (typeof value === 'string' && value.trim()) values.push(value); };
  if (block.type !== 'metadata') add(block.title);
  if (block.type === 'cover') {
    for (const key of ['churchName', 'issueNumber', 'establishedDate', 'date', 'proclamation', 'verse', 'verseReference']) add(block[key]);
  } else if (['table', 'service'].includes(block.type)) {
    add(block.subtitle);
    for (const fact of block.facts || []) add(fact);
    if (!noHeaderTableBlocks.has(block.id) && Array.isArray(block.columns)) for (const column of block.columns) add(column);
    for (const row of block.rows || []) for (const cell of row) add(cell);
    add(block.footnote);
  } else if (block.type === 'numbered-list') {
    for (const [index, item] of (block.items || []).entries()) {
      const parts = numberedItemParts(item, index);
      add(parts.number);
      for (const line of parts.lines) add(line);
    }
  } else if (block.type === 'text-list') {
    for (const item of block.items || []) add(item);
  } else if (block.type === 'article') {
    for (const paragraph of block.paragraphs || []) add(paragraph);
    for (const subsection of block.subsections || []) { add(subsection.title); for (const paragraph of subsection.paragraphs || []) add(paragraph); }
    add(block.conclusion);
  } else if (block.type === 'verse') {
    add(block.text);
    add(block.reference);
  } else if (block.type === 'sermon') {
    const sermon = block.items?.[0];
    for (const key of ['title', 'scripture', 'preacher']) add(sermon?.[key]);
  }
  return [...new Set(values)];
};

const assertBlockTextRendered = (block, html) => {
  for (const value of blockVisibleStrings(block)) {
    if (!html.includes(escapeHtml(value))) throw new Error(`${block.id} source text was omitted from generated HTML: ${value}`);
  }
};

const renderBlock = (block) => {
  const renderer = {
    metadata: renderMetadata, 'worship-order': renderWorshipOrder, sermon: renderSermon, theme: renderTheme, 'church-news': renderNews, schedule: renderSchedule, 'faith-guide': renderTextList, 'prayer-topics': renderTextList,
    cover: renderCover, table: renderEditionTable, 'numbered-list': renderEditionNumberedList, 'text-list': renderEditionTextList, article: renderArticle, verse: renderVerse, service: renderService
  }[block.type];
  if (!renderer) throw new Error(`Unsupported bulletin block type: ${block.type}`);
  const content = renderer(block);
  const title = block.title || defaultSectionTitles[block.id] || '';
  return block.type === 'cover' || block.type === 'metadata' ? `<div class="bulletin-block-${block.id.replaceAll('.', '-')}">${content}</div>` : section(title, content, block.id);
};

export const renderBulletinDocument = (document) => {
  document.blocks.forEach(validateBulletinBlock);
  const html = `<div class="bulletin-paper bulletin-paper-${document.validation.edition}"><div class="bulletin-columns">${document.blocks.map(renderBlock).join('')}</div></div>`;
  document.blocks.forEach((block) => assertBlockTextRendered(block, html));
  const renderedIds = document.blocks.filter((block) => html.includes(`bulletin-block-${block.id.replaceAll('.', '-')}`)).map((block) => block.id);
  const missingBlocks = document.blocks.filter((block) => !renderedIds.includes(block.id)).map((block) => block.id);
  if (missingBlocks.length) throw new Error(`Bulletin layout omitted block(s): ${missingBlocks.join(', ')}`);
  return { html, validation: { renderedBlockIds: renderedIds, missingBlocks, sourcePathCount: document.sourcePaths.length } };
};
