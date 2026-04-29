import createHttpError from 'http-errors';

export function requireFields(body, fields = []) {
  for (const field of fields) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ''
    ) {
      throw createHttpError(400, `${field} is required`);
    }
  }
}

export function validateWebsiteUrl(url) {
  try {
    const normalized = String(url || '').trim();
    const withProtocol = /^https?:\/\//i.test(normalized)
      ? normalized
      : `https://${normalized}`;

    const parsed = new URL(withProtocol);

    if (!parsed.hostname) {
      throw new Error('Invalid hostname');
    }

    return withProtocol;
  } catch {
    throw createHttpError(400, 'website_url is invalid');
  }
}