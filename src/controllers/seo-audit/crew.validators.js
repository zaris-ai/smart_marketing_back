import createHttpError from 'http-errors';

export function requireFields(body, fields = []) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw createHttpError(400, `Missing required fields: ${missing.join(', ')}`);
  }
}