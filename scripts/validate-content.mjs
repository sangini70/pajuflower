const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:01[016789][ -]?\d{3,4}[ -]?\d{4})/;
const PUBLIC_STATUSES = new Set(['draft', 'pending', 'published', 'archived']);
const APPROVAL_STATUSES = new Set(['pending', 'approved', 'rejected']);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isValidDate = (value) => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const addDuplicateErrors = (items, field, label, errors) => {
  const seen = new Map();
  for (const [index, item] of items.entries()) {
    const value = item[field];
    if (!isNonEmptyString(value)) continue;
    const previous = seen.get(value);
    if (previous !== undefined) errors.push(`${label} duplicate ${field}: ${value} (indexes ${previous}, ${index})`);
    else seen.set(value, index);
  }
};

const checkCommonFields = (items, label, errors) => {
  const required = ['id', 'slug', 'date', 'title', 'publicStatus', 'approvalStatus'];
  for (const [index, item] of items.entries()) {
    for (const field of required) {
      if (!isNonEmptyString(item[field])) errors.push(`${label}[${index}] missing ${field}`);
    }
    if (isNonEmptyString(item.slug) && !SLUG_PATTERN.test(item.slug)) errors.push(`${label}[${index}] invalid slug: ${item.slug}`);
    if (isNonEmptyString(item.date) && !isValidDate(item.date)) errors.push(`${label}[${index}] invalid date: ${item.date}`);
    if (isNonEmptyString(item.publicStatus) && !PUBLIC_STATUSES.has(item.publicStatus)) errors.push(`${label}[${index}] invalid publicStatus: ${item.publicStatus}`);
    if (isNonEmptyString(item.approvalStatus) && !APPROVAL_STATUSES.has(item.approvalStatus)) errors.push(`${label}[${index}] invalid approvalStatus: ${item.approvalStatus}`);
    if (item.publicStatus === 'published' && item.approvalStatus !== 'approved') errors.push(`${label}[${index}] published content must be approved`);
  }
};

const checkPublicText = (items, label, fields, errors) => {
  for (const [index, item] of items.entries()) {
    if (item.publicStatus !== 'published' || item.approvalStatus !== 'approved') continue;
    for (const field of fields) {
      const value = item[field];
      if (!isNonEmptyString(value)) continue;
      if (/REFERENCE[\\/]/i.test(value)) errors.push(`${label}[${index}] public field references REFERENCE: ${field}`);
      if (EMAIL_PATTERN.test(value)) errors.push(`${label}[${index}] public field contains email: ${field}`);
      if (PHONE_PATTERN.test(value)) errors.push(`${label}[${index}] public field contains phone-like data: ${field}`);
    }
  }
};

const checkPublicValue = (value, path, errors) => {
  if (typeof value === 'string') {
    if (/REFERENCE[\\/]/i.test(value)) errors.push(`${path} public field references REFERENCE`);
    if (EMAIL_PATTERN.test(value)) errors.push(`${path} public field contains email`);
    if (PHONE_PATTERN.test(value)) errors.push(`${path} public field contains phone-like data`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkPublicValue(item, `${path}[${index}]`, errors));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) checkPublicValue(child, `${path}.${key}`, errors);
  }
};

const checkBulletinDetails = (bulletins, errors) => {
  for (const [index, bulletin] of bulletins.entries()) {
    const path = `bulletins[${index}]`;
    if (bulletin.monthlyTheme !== undefined) {
      if (!bulletin.monthlyTheme || typeof bulletin.monthlyTheme !== 'object' || Array.isArray(bulletin.monthlyTheme)) errors.push(`${path}.monthlyTheme must be an object`);
      else {
        for (const field of ['month', 'title']) if (!isNonEmptyString(bulletin.monthlyTheme[field])) errors.push(`${path}.monthlyTheme missing ${field}`);
        if (bulletin.monthlyTheme.publicStatus !== 'published' || bulletin.monthlyTheme.approvalStatus !== 'approved') errors.push(`${path}.monthlyTheme must be approved before publication`);
      }
    }
    if (bulletin.featuredChurchNews !== undefined) {
      if (!bulletin.featuredChurchNews || typeof bulletin.featuredChurchNews !== 'object' || Array.isArray(bulletin.featuredChurchNews)) errors.push(`${path}.featuredChurchNews must be an object`);
      else {
        for (const field of ['title', 'description']) if (!isNonEmptyString(bulletin.featuredChurchNews[field])) errors.push(`${path}.featuredChurchNews missing ${field}`);
        if (bulletin.featuredChurchNews.publicStatus !== 'published' || bulletin.featuredChurchNews.approvalStatus !== 'approved') errors.push(`${path}.featuredChurchNews must be approved before publication`);
      }
    }
    for (const field of ['worshipSchedule', 'churchNews']) {
      if (bulletin[field] === undefined) continue;
      if (!Array.isArray(bulletin[field])) {
        errors.push(`${path}.${field} must be an array`);
        continue;
      }
      for (const [itemIndex, item] of bulletin[field].entries()) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`${path}.${field}[${itemIndex}] must be an object`);
          continue;
        }
        const required = field === 'worshipSchedule' ? ['date', 'prayer', 'specialSong'] : ['title', 'description'];
        for (const requiredField of required) if (!isNonEmptyString(item[requiredField])) errors.push(`${path}.${field}[${itemIndex}] missing ${requiredField}`);
        if (item.publicStatus !== 'published' || item.approvalStatus !== 'approved') errors.push(`${path}.${field}[${itemIndex}] must be approved before publication`);
      }
      if (field === 'worshipSchedule') {
        const dates = new Set();
        for (const [itemIndex, item] of bulletin[field].entries()) {
          if (!isNonEmptyString(item?.date)) continue;
          if (dates.has(item.date)) errors.push(`${path}.worshipSchedule duplicate date: ${item.date} (index ${itemIndex})`);
          dates.add(item.date);
        }
      }
    }
    for (const [field, required] of Object.entries({
      worshipOrder: ['label', 'content'],
      prayerTopics: ['title', 'description'],
      faithGuide: ['title', 'description']
    })) {
      if (bulletin[field] === undefined) continue;
      const section = bulletin[field];
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        errors.push(`${path}.${field} must be an object with items`);
        continue;
      }
      const sectionApproved = section.publicStatus === 'published' && section.approvalStatus === 'approved';
      if (!['draft', 'pending', 'published', 'archived'].includes(section.publicStatus)) errors.push(`${path}.${field} invalid publicStatus`);
      if (!['pending', 'approved', 'rejected'].includes(section.approvalStatus)) errors.push(`${path}.${field} invalid approvalStatus`);
      if (!Array.isArray(section.items)) {
        errors.push(`${path}.${field}.items must be an array`);
        continue;
      }
      for (const [itemIndex, item] of section.items.entries()) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`${path}.${field}.items[${itemIndex}] must be an object`);
          continue;
        }
        for (const requiredField of required) if (!isNonEmptyString(item[requiredField])) errors.push(`${path}.${field}.items[${itemIndex}] missing ${requiredField}`);
        if (!['draft', 'pending', 'published', 'archived'].includes(item.publicStatus)) errors.push(`${path}.${field}.items[${itemIndex}] invalid publicStatus`);
        if (!['pending', 'approved', 'rejected'].includes(item.approvalStatus)) errors.push(`${path}.${field}.items[${itemIndex}] invalid approvalStatus`);
        if (sectionApproved && (item.publicStatus !== 'published' || item.approvalStatus !== 'approved')) errors.push(`${path}.${field}.items[${itemIndex}] must be approved before publication`);
      }
    }
    if (bulletin.publicStatus === 'published' && bulletin.approvalStatus === 'approved') {
      for (const field of ['monthlyTheme', 'featuredChurchNews', 'worshipSchedule', 'churchNews', 'worshipOrder', 'prayerTopics', 'faithGuide']) {
        const value = bulletin[field];
        if (value === undefined) continue;
        if (['worshipOrder', 'prayerTopics', 'faithGuide'].includes(field) && (value.publicStatus !== 'published' || value.approvalStatus !== 'approved')) continue;
        checkPublicValue(value, `${path}.${field}`, errors);
      }
    }
  }
};

export const validateContent = ({ sermons, bulletins }) => {
  const errors = [];
  if (!Array.isArray(sermons)) errors.push('sermons.json must contain an array');
  if (!Array.isArray(bulletins)) errors.push('bulletins.json must contain an array');
  if (errors.length) return errors;

  checkCommonFields(sermons, 'sermons', errors);
  checkCommonFields(bulletins, 'bulletins', errors);
  addDuplicateErrors(sermons, 'id', 'sermons', errors);
  addDuplicateErrors(sermons, 'slug', 'sermons', errors);
  addDuplicateErrors(sermons, 'date', 'sermons', errors);
  addDuplicateErrors(bulletins, 'id', 'bulletins', errors);
  addDuplicateErrors(bulletins, 'slug', 'bulletins', errors);
  addDuplicateErrors(bulletins, 'date', 'bulletins', errors);
  addDuplicateErrors(bulletins, 'issueNumber', 'bulletins', errors);

  const sermonsById = new Map(sermons.map((sermon) => [sermon.id, sermon]));
  for (const [index, bulletin] of bulletins.entries()) {
    if (!isNonEmptyString(bulletin.relatedSermonId)) {
      errors.push(`bulletins[${index}] missing relatedSermonId`);
      continue;
    }
    const sermon = sermonsById.get(bulletin.relatedSermonId);
    if (!sermon) errors.push(`bulletins[${index}] relatedSermonId not found: ${bulletin.relatedSermonId}`);
    else if (bulletin.publicStatus === 'published' && bulletin.approvalStatus === 'approved' && !((sermon.publicStatus === 'published') && (sermon.approvalStatus === 'approved'))) {
      errors.push(`bulletins[${index}] links to a non-public sermon: ${bulletin.relatedSermonId}`);
    }
  }

  checkPublicText(sermons, 'sermons', ['title', 'scripture', 'preacher', 'summary', 'youtubeUrl', 'thumbnail'], errors);
  checkPublicText(bulletins, 'bulletins', ['title', 'description', 'issueNumber', 'publicFile'], errors);
  checkBulletinDetails(bulletins, errors);
  return errors;
};

export const assertValidContent = (content) => {
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Content validation failed:\n- ${errors.join('\n- ')}`);
};
