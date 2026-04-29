import createHttpError from 'http-errors';

const ALLOWED_PAIN_CATEGORIES = ['conversion', 'aov', 'customer'];

export function requireUrls(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    throw createHttpError(400, 'urls must be a non-empty array');
  }

  for (const url of urls) {
    try {
      new URL(url);
    } catch {
      throw createHttpError(400, `Invalid URL: ${url}`);
    }
  }
}

export function normalizeMaxResults(value, fallback = 20) {
  const num = Number(value);

  if (!Number.isFinite(num)) return fallback;

  return Math.max(1, Math.min(Math.trunc(num), 50));
}

export function validateProblemDiscoveryResponse(data) {
  if (!data || typeof data !== 'object') {
    throw createHttpError(500, 'Crew returned invalid JSON object');
  }

  if (!Array.isArray(data.items)) {
    throw createHttpError(500, 'Crew response missing items array');
  }

  for (const item of data.items) {
    if (!item?.question || typeof item.question !== 'string') {
      throw createHttpError(500, 'Crew item missing question');
    }

    if (!ALLOWED_PAIN_CATEGORIES.includes(item.pain_category)) {
      throw createHttpError(500, 'Crew item has invalid pain_category');
    }

    if (
      typeof item.frequency_score !== 'number' ||
      Number.isNaN(item.frequency_score) ||
      item.frequency_score < 0 ||
      item.frequency_score > 1
    ) {
      throw createHttpError(500, 'Crew item has invalid frequency_score');
    }

    if (!item?.source || typeof item.source !== 'string') {
      throw createHttpError(500, 'Crew item missing source');
    }

    if (!item?.source_question_page || typeof item.source_question_page !== 'string') {
      throw createHttpError(500, 'Crew item missing source_question_page');
    }

    if (!item?.answer || typeof item.answer !== 'string') {
      throw createHttpError(500, 'Crew item missing answer');
    }

    if (typeof item.can_arka_solve !== 'boolean') {
      throw createHttpError(500, 'Crew item missing can_arka_solve boolean');
    }

    if (typeof item.arka_solution !== 'string') {
      throw createHttpError(500, 'Crew item missing arka_solution');
    }

    if (typeof item.feature_gap !== 'string') {
      throw createHttpError(500, 'Crew item missing feature_gap');
    }

    if (typeof item.recommended_feature !== 'string') {
      throw createHttpError(500, 'Crew item missing recommended_feature');
    }

    if (item.can_arka_solve && !item.arka_solution.trim()) {
      throw createHttpError(500, 'Crew item with can_arka_solve=true must include arka_solution');
    }

    if (!item.can_arka_solve) {
      if (!item.feature_gap.trim()) {
        throw createHttpError(500, 'Crew item with can_arka_solve=false must include feature_gap');
      }

      if (!item.recommended_feature.trim()) {
        throw createHttpError(
          500,
          'Crew item with can_arka_solve=false must include recommended_feature'
        );
      }
    }
  }

  if (data.summary && typeof data.summary === 'object') {
    if (
      data.summary.accepted_count !== undefined &&
      Number(data.summary.accepted_count) !== data.items.length
    ) {
      throw createHttpError(500, 'Crew summary.accepted_count must equal items length');
    }
  }

  return true;
}