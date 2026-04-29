import createHttpError from 'http-errors';

export function requireFields(body, fields = []) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length) {
    throw createHttpError(400, `Missing required fields: ${missing.join(', ')}`);
  }
}

export function requireTwoLinks(links) {
  if (!Array.isArray(links) || links.length !== 2) {
    throw createHttpError(400, 'links must be an array with exactly 2 URLs');
  }

  for (const link of links) {
    try {
      new URL(link);
    } catch {
      throw createHttpError(400, `Invalid URL: ${link}`);
    }
  }
}

export function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}