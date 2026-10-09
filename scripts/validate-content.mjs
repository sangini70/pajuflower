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
  return errors;
};

export const assertValidContent = (content) => {
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Content validation failed:\n- ${errors.join('\n- ')}`);
};
