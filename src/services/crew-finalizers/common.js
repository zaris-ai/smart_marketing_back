import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function getCrewContent(result) {
  return result?.result?.content || result?.content || result?.rawContent || '';
}

export function getTasksOutput(result) {
  return result?.result?.tasks_output || result?.tasks_output || [];
}

export function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractJsonBlock(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function normalizeHtml(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function cleanString(value = '') {
  return String(value || '').trim();
}

export function normalizeStringArray(value) {
  if (!value) return [];

  const arr = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\n,]/)
        .map((item) => item.trim());

  return [...new Set(arr.map((item) => cleanString(item)).filter(Boolean))];
}

export function makeSavedRecord(saved, fallbackModel = null) {
  if (!saved?._id) return null;

  return {
    model: saved.constructor?.modelName || fallbackModel || null,
    id: String(saved._id),
  };
}

export function withSavedRecord(payload = {}, saved, fallbackModel = null) {
  return {
    ...payload,
    saved,
    savedRecord: makeSavedRecord(saved, fallbackModel),
  };
}

export function stripMarkdown(md = '') {
  return String(md)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncateText(text = '', max = 2200) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}

export function sanitizeBlogHtml(html = '') {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'span',
      'pre',
      'code',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      span: ['style'],
      '*': ['class'],
    },
    allowedStyles: {
      span: {
        color: [
          /^#[0-9a-f]{3,8}$/i,
          /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
          /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/i,
        ],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

export function extractJsonFromMarkdownFence(text) {
  if (!text || typeof text !== 'string') return null;

  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlock?.[1]) {
    return safeParseJson(jsonBlock[1].trim());
  }

  const genericBlock = text.match(/```\s*([\s\S]*?)```/i);
  if (genericBlock?.[1]) {
    return safeParseJson(genericBlock[1].trim());
  }

  return null;
}

export function extractJsonObjectsFromText(text) {
  const objects = [];

  if (!text || typeof text !== 'string') return objects;

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }

        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;

      if (depth === 0) {
        const parsed = safeParseJson(text.slice(start, i + 1));

        if (parsed && typeof parsed === 'object') {
          objects.push(parsed);
        }

        break;
      }
    }
  }

  return objects;
}

export function unwrapPossibleCrewValues(value) {
  const values = [];
  const seen = new Set();

  function visit(current) {
    if (current === undefined || current === null) return;

    if (typeof current === 'object') {
      if (seen.has(current)) return;
      seen.add(current);
    }

    values.push(current);

    if (typeof current !== 'object') return;

    const keysToCheck = [
      'result',
      'raw',
      'output',
      'content',
      'data',
      'json',
      'json_dict',
      'final_output',
      'tasks_output',
    ];

    for (const key of keysToCheck) {
      if (current[key] !== undefined) {
        visit(current[key]);
      }
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item);
      }
    }
  }

  visit(value);

  return values;
}

export { marked };