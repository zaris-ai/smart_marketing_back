import { HttpError } from '../utils/httpError.js';

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `Missing or invalid field: ${fieldName}`);
  }
  return value.trim();
}

function optionalString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function validateBlogPayload(body) {
  return {
    topic: requireNonEmptyString(body?.topic, 'topic'),
    audience: optionalString(body?.audience, 'general readers'),
    tone: optionalString(body?.tone, 'clear and practical'),
  };
}

export function validatePricingPayload(body) {
  return {
    product: requireNonEmptyString(body?.product, 'product'),
    segment: optionalString(body?.segment, 'general market'),
    goal: optionalString(body?.goal, 'find a viable pricing model'),
  };
}

export function validateResearchPayload(body) {
  return {
    topic: requireNonEmptyString(body?.topic, 'topic'),
    depth: optionalString(body?.depth, 'brief'),
    audience: optionalString(body?.audience, 'general readers'),
  };
}
