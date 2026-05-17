import { randomUUID } from 'node:crypto';

import AiBlog, { normalizeTitle } from '../../models/ai-blog.model.js';
import { publishCrewReport } from '../telegram.service.js';

import {
  cleanString,
  extractJsonBlock,
  getCrewContent,
  getTasksOutput,
  marked,
  normalizeHtml,
  normalizeStringArray,
  safeParseJson,
  sanitizeBlogHtml,
  withSavedRecord,
} from './common.js';

function blogSlugify(value = '') {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `blog-${randomUUID().slice(0, 8)}`;
}

async function makeUniqueBlogSlug(value, excludeId = null) {
  const baseSlug = blogSlugify(value);
  let slug = baseSlug;
  let counter = 2;

  while (
    await AiBlog.exists(
      excludeId ? { slug, _id: { $ne: excludeId } } : { slug }
    )
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

async function makeUniqueAiBlogTitle(title) {
  const baseTitle = cleanString(title || 'Untitled Blog');

  if (!normalizeTitle(baseTitle)) {
    return `Untitled Blog ${randomUUID().slice(0, 8)}`;
  }

  if (!(await AiBlog.exists({ normalizedTitle: normalizeTitle(baseTitle) }))) {
    return baseTitle;
  }

  let counter = 2;

  while (counter < 200) {
    const candidate = `${baseTitle} ${counter}`;

    if (!(await AiBlog.exists({ normalizedTitle: normalizeTitle(candidate) }))) {
      return candidate;
    }

    counter += 1;
  }

  return `${baseTitle} ${randomUUID().slice(0, 8)}`;
}

function normalizeAiBlogCoverImage(value = {}) {
  return {
    url: value?.url || '',
    sourcePage: value?.source_page || value?.sourcePage || '',
    query: value?.query || '',
    alt: value?.alt || '',
  };
}

function normalizeBlogCrewResult(rawContent, payload = {}) {
  const parsed = safeParseJson(rawContent) || extractJsonBlock(rawContent);

  if (parsed && typeof parsed === 'object') {
    const title = cleanString(
      parsed.title || payload.title || payload.topic || 'Untitled blog'
    );

    const topic = cleanString(parsed.topic || payload.topic || title);

    const metaDescription = cleanString(
      parsed.meta_description || parsed.metaDescription || ''
    );

    const excerpt = cleanString(parsed.excerpt || '');

    const suggestedKeywords = normalizeStringArray(
      parsed.suggested_keywords ||
        parsed.suggestedKeywords ||
        parsed.keywords ||
        payload.keywords ||
        []
    );

    const contentMarkdown = cleanString(
      parsed.content_markdown ||
        parsed.contentMarkdown ||
        parsed.markdown ||
        ''
    );

    const explicitHtml = cleanString(
      parsed.content_html || parsed.contentHtml || ''
    );

    const contentHtml = explicitHtml
      ? sanitizeBlogHtml(normalizeHtml(explicitHtml) || explicitHtml)
      : sanitizeBlogHtml(contentMarkdown ? marked.parse(contentMarkdown) : '');

    const telegramReport = cleanString(
      parsed.telegram_report || parsed.telegramReport || ''
    );

    return {
      title,
      topic,
      metaDescription,
      excerpt,
      suggestedKeywords,
      contentMarkdown,
      contentHtml,
      telegramReport,
      raw: parsed,
    };
  }

  const contentMarkdown = cleanString(rawContent);
  const contentHtml = sanitizeBlogHtml(
    contentMarkdown ? marked.parse(contentMarkdown) : ''
  );

  return {
    title: cleanString(payload.title || payload.topic || 'Untitled blog'),
    topic: cleanString(payload.topic || payload.title || 'Untitled blog'),
    metaDescription: '',
    excerpt: '',
    suggestedKeywords: normalizeStringArray(payload.keywords),
    contentMarkdown,
    contentHtml,
    telegramReport: `Blog generated: ${payload.topic || ''}`,
    raw: rawContent,
  };
}

function buildAiBlogTelegramReport(doc) {
  const keywords = Array.isArray(doc.suggestedKeywords)
    ? doc.suggestedKeywords.slice(0, 6).map((item) => `• ${item}`).join('\n')
    : '';

  const sources = Array.isArray(doc.sourceLinks)
    ? doc.sourceLinks.slice(0, 2).map((item) => `• ${item}`).join('\n')
    : '';

  return [
    `AI Blog Draft: ${doc.title}`,
    `Topic: ${doc.topic}`,
    `Audience: ${doc.audience}`,
    `App: ${doc.appName}`,
    '',
    'Summary',
    doc.excerpt ||
      'A new AI blog draft was generated successfully and saved for review.',
    '',
    keywords ? `Keywords\n${keywords}` : '',
    sources ? `Source Links\n${sources}` : '',
    '',
    `Status: ${doc.status}`,
    `Slug: ${doc.slug}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function finalizeAiBlogFromLinksRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = safeParseJson(rawContent) || extractJsonBlock(rawContent);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI blog crew returned invalid JSON content');
  }

  const parsedTitle = cleanString(parsed.title || parsed.topic || 'AI Blog Draft');
  const parsedTopic = cleanString(parsed.topic || parsed.title || 'AI Blog Draft');

  const parsedMarkdown = cleanString(
    parsed.content_markdown || parsed.contentMarkdown || parsed.markdown || ''
  );

  const explicitHtml = cleanString(
    parsed.content_html || parsed.contentHtml || parsed.html || ''
  );

  const contentHtml = explicitHtml
    ? sanitizeBlogHtml(normalizeHtml(explicitHtml) || explicitHtml)
    : sanitizeBlogHtml(parsedMarkdown ? marked.parse(parsedMarkdown) : '');

  if (!contentHtml) {
    throw new Error(
      'AI blog crew response is missing content_html/contentHtml or content_markdown/contentMarkdown'
    );
  }

  const uniqueTitle = await makeUniqueAiBlogTitle(parsedTitle);
  const uniqueSlug = await makeUniqueBlogSlug(parsed.slug || uniqueTitle);

  const sourceLinks = Array.isArray(run.meta?.sourceLinks)
    ? run.meta.sourceLinks
    : Array.isArray(run.payload?.links)
      ? run.payload.links
      : [
          process.env.BLOG_SOURCE_LINK_1 || 'https://web.arkaanalyzer.com/',
          process.env.BLOG_SOURCE_LINK_2 ||
            'https://apps.shopify.com/arka-smart-analyzer',
        ];

  const saved = await AiBlog.create({
    title: uniqueTitle,
    normalizedTitle: normalizeTitle(uniqueTitle),
    slug: uniqueSlug,
    topic: parsedTopic,
    audience: parsed.audience || 'Shopify merchants',
    appName:
      parsed.app_name ||
      parsed.appName ||
      run.meta?.appName ||
      'Arka: Smart Analyzer',
    sourceLinks,
    suggestedKeywords: normalizeStringArray(
      parsed.keywords || parsed.suggested_keywords || parsed.suggestedKeywords || []
    ),
    metaDescription: parsed.meta_description || parsed.metaDescription || '',
    excerpt: parsed.excerpt || '',
    coverImage: normalizeAiBlogCoverImage(parsed.cover_image || parsed.coverImage),
    contentHtml,
    contentMarkdown: parsedMarkdown,
    editorData: parsed.editor_data || parsed.editorData || {
      type: 'html',
      content: contentHtml,
    },
    decisionSource: 'auto_from_links',
    crewName: 'blog_from_links',
    rawResult: {
      runId: String(run._id),
      payload: run.payload || {},
      crewResult: result,
      parsed,
      rawContent,
      tasks_output: getTasksOutput(result),
    },
    status: 'draft',
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildAiBlogTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'blog_from_links',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: saved.slug || 'blog_from_links',
      html: saved.contentHtml || '',
      telegramReport,
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      html: telegram?.reportHtml || '',
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord({ parsed, telegram, telegramReport }, saved, 'AiBlog');
  } catch (telegramError) {
    console.error('ai blog telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      html: '',
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message || 'Telegram publish failed',
        },
        telegramReport: '',
      },
      saved,
      'AiBlog'
    );
  }
}

export async function finalizeBlogRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const normalized = normalizeBlogCrewResult(rawContent, run.payload || {});

  if (!normalized.contentHtml) {
    throw new Error('Blog crew output was empty or invalid');
  }

  const uniqueTitle = await makeUniqueAiBlogTitle(normalized.title);
  const slug = await makeUniqueBlogSlug(uniqueTitle);

  const saved = await AiBlog.create({
    title: uniqueTitle,
    normalizedTitle: normalizeTitle(uniqueTitle),
    slug,
    topic: normalized.topic || run.payload?.topic || '',
    audience: run.payload?.audience || 'general readers',
    appName: run.meta?.appName || 'Arka: Smart Analyzer',
    sourceLinks: Array.isArray(run.meta?.sourceLinks)
      ? run.meta.sourceLinks
      : [
          process.env.BLOG_SOURCE_LINK_1 || 'https://web.arkaanalyzer.com/',
          process.env.BLOG_SOURCE_LINK_2 ||
            'https://apps.shopify.com/arka-smart-analyzer',
        ],
    suggestedKeywords: normalized.suggestedKeywords,
    metaDescription: normalized.metaDescription,
    excerpt: normalized.excerpt,
    contentHtml: normalized.contentHtml,
    contentMarkdown: normalized.contentMarkdown,
    editorData: {
      format: 'html',
      source: 'crew_generated',
      html: normalized.contentHtml,
    },
    decisionSource: run.meta?.decisionSource || 'auto_from_links',
    crewName: 'blog',
    rawResult: {
      runId: String(run._id),
      payload: run.payload || {},
      crewResult: result,
      parsed: normalized.raw,
      rawContent,
      tasks_output: getTasksOutput(result),
    },
    status: 'draft',
    generatedAt: new Date(),
  });

  return withSavedRecord(
    {
      parsed: normalized.raw,
      telegramReport: normalized.telegramReport,
    },
    saved,
    'AiBlog'
  );
}