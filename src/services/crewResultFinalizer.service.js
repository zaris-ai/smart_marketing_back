import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { randomUUID } from 'node:crypto';

import AiBlog, { normalizeTitle } from '../models/ai-blog.model.js';
import DashboardPage from '../models/dashboard-page.model.js';
import GmailEmail from '../models/gmailEmail.model.js';
import StoreCrmAnalysis from '../models/storeCrmAnalysis.model.js';
import StoreOutreach from '../models/store-outreach.model.js';
import CompetitorAnalysis from '../models/competitor-analysis.model.js';
import ManageCompetitorAnalysis from '../models/manage-competitor-analysis.model.js';
import ShopifyTrends from '../models/shopify-trends.model.js';
import ProblemDiscoveryRun from '../models/problem-discovery-run.model.js';
import SeoAudit from '../models/seo-audit.model.js';
import SeoKeywordOpportunity from '../models/seo-keyword-opportunity.model.js';
import InstagramStoryIdeaRun from '../models/instagram-story-idea.model.js';
import InstagramPostIdeaRun from '../models/instagram-post-idea.model.js';

import { publishCrewReport } from './telegram.service.js';

const SEO_AUDIT_WEBSITE_URL = 'https://web.arkaanalyzer.com/';
const SEO_AUDIT_REPORT_TITLE = 'Arka Analyzer SEO Audit';

marked.setOptions({
  gfm: true,
  breaks: false,
});

function getCrewContent(result) {
  return result?.result?.content || result?.content || result?.rawContent || '';
}

function getTasksOutput(result) {
  return result?.result?.tasks_output || result?.tasks_output || [];
}

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonBlock(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    const maybeJson = trimmed.slice(start, end + 1);

    try {
      return JSON.parse(maybeJson);
    } catch (_) {
      return null;
    }
  }
}

function normalizeHtml(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function makeSavedRecord(saved, fallbackModel = null) {
  if (!saved?._id) return null;

  return {
    model: saved.constructor?.modelName || fallbackModel || null,
    id: String(saved._id),
  };
}

function withSavedRecord(payload = {}, saved, fallbackModel = null) {
  return {
    ...payload,
    saved,
    savedRecord: makeSavedRecord(saved, fallbackModel),
  };
}

function stripMarkdown(md = '') {
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

function truncateText(text = '', max = 2200) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeStringArray(value) {
  if (!value) return [];

  const arr = Array.isArray(value)
    ? value
    : String(value)
      .split(/[\n,]/)
      .map((item) => item.trim());

  return [...new Set(arr.map((item) => cleanString(item)).filter(Boolean))];
}

function sanitizeBlogHtml(html = '') {
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

function validateMarketingEmailReplyResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    const error = new Error('Crew returned invalid JSON content');
    error.statusCode = 500;
    throw error;
  }

  if (!parsed.contact || typeof parsed.contact !== 'object') {
    const error = new Error('Crew response is missing contact section');
    error.statusCode = 500;
    throw error;
  }

  if (!parsed.analysis || typeof parsed.analysis !== 'object') {
    const error = new Error('Crew response is missing analysis section');
    error.statusCode = 500;
    throw error;
  }

  if (!parsed.reply || typeof parsed.reply !== 'object') {
    const error = new Error('Crew response is missing reply section');
    error.statusCode = 500;
    throw error;
  }

  if (!String(parsed.reply.subject || '').trim()) {
    const error = new Error('Crew response is missing reply.subject');
    error.statusCode = 500;
    throw error;
  }

  if (!String(parsed.reply.body_text || '').trim()) {
    const error = new Error('Crew response is missing reply.body_text');
    error.statusCode = 500;
    throw error;
  }
}

function pickStoreName(parsed, fallback = '') {
  return (
    parsed?.store?.name ||
    parsed?.store_name ||
    parsed?.title ||
    fallback ||
    ''
  );
}

function buildResearchTelegramReport(parsed, payload) {
  const title = String(parsed?.title || payload.topic || 'Research').trim();
  const reviewerNotes = String(parsed?.reviewer_notes || '').trim();
  const reportMarkdown = String(parsed?.report_markdown || '').trim();
  const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];

  const plainReport = stripMarkdown(reportMarkdown);
  const executiveChunk =
    plainReport.split(/\n\s*\n/).find(Boolean) || plainReport || '';

  const sourceLines = sources
    .slice(0, 5)
    .map((source) => `• ${source.title || source.url || 'Source'}`)
    .join('\n');

  return [
    `Research: ${title}`,
    `Topic: ${payload.topic || ''}`,
    `Audience: ${payload.audience || ''}`,
    payload.market ? `Market: ${payload.market}` : '',
    '',
    'Summary',
    truncateText(executiveChunk, 1800),
    sourceLines ? '\nTop Sources\n' + sourceLines : '',
    reviewerNotes ? `\nReviewer Notes\n${truncateText(reviewerNotes, 500)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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

function buildStoreOutreachTelegramReport(doc, parsed) {
  const storeName = doc.storeName || parsed?.store?.name || 'Unknown store';
  const websiteUrl = doc.websiteUrl || parsed?.store?.website_url || '';
  const summary = parsed?.store?.summary || '';
  const overallFit = parsed?.app_fit?.overall_fit || 'unknown';

  const fitScore =
    parsed?.app_fit?.fit_score !== undefined &&
      parsed?.app_fit?.fit_score !== null
      ? String(parsed.app_fit.fit_score)
      : 'N/A';

  const useCases = Array.isArray(parsed?.app_fit?.use_cases)
    ? parsed.app_fit.use_cases
      .slice(0, 4)
      .map((item) => `• ${item}`)
      .join('\n')
    : '';

  const pitchAngles = Array.isArray(parsed?.app_fit?.pitch_angles)
    ? parsed.app_fit.pitch_angles
      .slice(0, 3)
      .map((item) => `• ${item}`)
      .join('\n')
    : '';

  const subject = parsed?.email?.subject || '';
  const previewLine = parsed?.email?.preview_line || '';

  return [
    `Store Outreach: ${doc.title}`,
    `Store: ${storeName}`,
    websiteUrl ? `Website: ${websiteUrl}` : '',
    '',
    'Summary',
    summary ||
    'A new outreach analysis was generated successfully for internal review.',
    '',
    'Fit',
    `Overall fit: ${overallFit}`,
    `Fit score: ${fitScore}`,
    '',
    useCases ? `Top Use Cases\n${useCases}` : '',
    pitchAngles ? `Pitch Angles\n${pitchAngles}` : '',
    subject ? `Email Subject\n${subject}` : '',
    previewLine ? `Preview Line\n${previewLine}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildCompetitorTelegramReport(doc) {
  return [
    `Competitive Analysis: ${doc.title}`,
    `App: ${doc.appName}`,
    `URL: ${doc.appUrl}`,
    '',
    'Summary',
    'A new competitor analysis report was generated successfully and published for internal review.',
    '',
    'Notes',
    'The full report contains competitor comparisons, strengths, weaknesses, catch-up priorities, differentiation opportunities, and strategic recommendations.',
  ].join('\n');
}

function buildManageCompetitorAnalysisTelegramReport(doc) {
  const competitorLines = Array.isArray(doc.selectedCompetitors)
    ? doc.selectedCompetitors
      .slice(0, 8)
      .map((item) => `• ${item.name}`)
      .join('\n')
    : '';

  return [
    `Managed Competitor Analysis: ${doc.title}`,
    `App: ${doc.appName}`,
    `URL: ${doc.appUrl}`,
    '',
    'Goal',
    doc.analysisGoal || '-',
    '',
    'Selected Competitors',
    competitorLines || 'No competitors listed.',
    '',
    'Summary',
    'A new managed competitor analysis was generated and saved successfully.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildShopifyTrendsTelegramReport(doc) {
  return [
    `Shopify Trends Report: ${doc.title}`,
    `Topic: ${doc.topic}`,
    `Target App: ${doc.targetAppName}`,
    `Target URL: ${doc.targetAppUrl}`,
    '',
    'Summary',
    'A new Shopify trends report was generated successfully and published for internal review.',
    '',
    'Notes',
    'The full report contains market trends, app analysis, store patterns, traffic opportunity, risks, and recommended actions.',
  ].join('\n');
}

function buildProblemDiscoveryTelegramReport(doc, parsed) {
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const summary = parsed?.summary || {};

  const acceptedCount =
    typeof summary.accepted_count === 'number'
      ? summary.accepted_count
      : items.length;

  const totalCandidates =
    typeof summary.total_candidates === 'number'
      ? summary.total_candidates
      : items.length;

  const topItems = items.slice(0, 5).map((item) => {
    const category = item?.pain_category || 'unknown';
    const solve = item?.can_arka_solve ? 'Arka can solve now' : 'Arka gap';
    return `• [${category}] ${item?.question || 'Untitled question'} — ${solve}`;
  });

  const sources = [...new Set(items.map((item) => item?.source).filter(Boolean))]
    .slice(0, 5)
    .map((source) => `• ${source}`);

  return [
    'Problem Discovery Run',
    `Accepted: ${acceptedCount}`,
    `Total candidates: ${totalCandidates}`,
    '',
    'Summary',
    doc?.sourceUrls?.length
      ? `Analyzed ${doc.sourceUrls.length} submitted source URL(s) and extracted merchant problems/questions.`
      : 'A new problem discovery run was generated successfully.',
    '',
    topItems.length ? `Top Items\n${topItems.join('\n')}` : '',
    sources.length ? `Sources\n${sources.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSeoAuditTelegramReport(doc) {
  return [
    `SEO Audit: ${doc.title}`,
    `Website: ${doc.websiteUrl}`,
    '',
    'Summary',
    'A new SEO audit report was generated successfully and published for internal review.',
    '',
    'Notes',
    'The full report contains technical SEO findings, on-page issues, link health, page-level audit details, and a priority roadmap.',
  ].join('\n');
}

function buildSeoKeywordOpportunityTelegramReport(doc) {
  return [
    'SEO Keyword Opportunity Report',
    `Website: ${doc.websiteUrl}`,
    doc.brandName ? `Brand: ${doc.brandName}` : '',
    `Max keywords: ${doc.maxKeywords}`,
    '',
    'Summary',
    'A new SEO keyword opportunity report was generated successfully and published for internal review.',
    '',
    'Notes',
    'The full report contains keyword opportunities, quick wins, difficulty analysis, competitor signals, page strategy, and an action roadmap.',
  ]
    .filter(Boolean)
    .join('\n');
}

function safeParseInstagramJson(value) {
  if (!value) return null;

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonObjectsFromText(text) {
  const objects = [];

  if (!text || typeof text !== 'string') {
    return objects;
  }

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
        const candidate = text.slice(start, i + 1);
        const parsed = safeParseInstagramJson(candidate);

        if (parsed && typeof parsed === 'object') {
          objects.push(parsed);
        }

        break;
      }
    }
  }

  return objects;
}

function extractJsonFromMarkdownFence(text) {
  if (!text || typeof text !== 'string') return null;

  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);

  if (jsonBlockMatch?.[1]) {
    return safeParseInstagramJson(jsonBlockMatch[1].trim());
  }

  const genericBlockMatch = text.match(/```\s*([\s\S]*?)```/i);

  if (genericBlockMatch?.[1]) {
    return safeParseInstagramJson(genericBlockMatch[1].trim());
  }

  return null;
}

function unwrapPossibleInstagramCrewValues(value) {
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

function normalizeInstagramString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeInstagramArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function isValidInstagramStoryJson(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.ideas) &&
    value.ideas.length > 0
  );
}

function unwrapPossibleCrewValues(value) {
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

function extractInstagramStoryJson(value) {
  const candidates = unwrapPossibleCrewValues(value);

  for (const candidate of candidates) {
    if (isValidInstagramStoryJson(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;

    const trimmed = candidate.trim();

    const direct = safeParseJson(trimmed);
    if (isValidInstagramStoryJson(direct)) {
      return direct;
    }

    const fenced = extractJsonFromMarkdownFence(trimmed);
    if (isValidInstagramStoryJson(fenced)) {
      return fenced;
    }

    const extractedObjects = extractJsonObjectsFromText(trimmed);
    const validObject = extractedObjects
      .reverse()
      .find((item) => isValidInstagramStoryJson(item));

    if (validObject) {
      return validObject;
    }
  }

  return null;
}

function normalizeInstagramStoryIdeasResult(crewResult, payload = {}) {
  const parsed = extractInstagramStoryJson(crewResult);

  if (!parsed) {
    const error = new Error('Instagram story crew returned invalid JSON.');
    error.statusCode = 502;
    error.details = {
      hasCrewResult: Boolean(crewResult),
    };
    throw error;
  }

  const campaignTitle = normalizeInstagramString(
    parsed.campaign_title,
    payload.campaign_name ||
    `${payload.brand_name || 'Arka Smart Analyzer'} Instagram Story Campaign`
  );

  const strategySummary = normalizeInstagramString(parsed.strategy_summary);

  const ideas = parsed.ideas.map((idea, index) => ({
    id: normalizeInstagramString(idea.id, `idea_${index + 1}`),
    title: normalizeInstagramString(idea.title, `Story Idea ${index + 1}`),
    angle: normalizeInstagramString(idea.angle),
    objective: normalizeInstagramString(idea.objective),
    hook: normalizeInstagramString(idea.hook),
    story_sequence: Array.isArray(idea.story_sequence)
      ? idea.story_sequence.map((step, stepIndex) => ({
        frame: Number(step.frame || stepIndex + 1),
        visual: normalizeInstagramString(step.visual),
        on_screen_text: normalizeInstagramString(step.on_screen_text),
        voiceover: normalizeInstagramString(step.voiceover),
        motion_direction: normalizeInstagramString(step.motion_direction),
        duration_seconds: Number(step.duration_seconds || 3),
      }))
      : [],
    video_prompt: normalizeInstagramString(idea.video_prompt),
    caption: normalizeInstagramString(idea.caption),
    cta: normalizeInstagramString(idea.cta),
    hashtags: normalizeInstagramArray(idea.hashtags),
    production_notes: normalizeInstagramArray(idea.production_notes),
  }));

  return {
    runId: String(payload.run_id || randomUUID()),
    campaign_title: campaignTitle,
    platform: 'instagram_story',
    format: 'vertical_9_16',
    strategy_summary: strategySummary,

    brand_name: normalizeInstagramString(
      payload.brand_name,
      'Arka Smart Analyzer'
    ),
    product_or_service: normalizeInstagramString(payload.product_or_service),
    app_website_url: normalizeInstagramString(payload.app_website_url),
    shopify_app_store_url: normalizeInstagramString(
      payload.shopify_app_store_url
    ),

    target_audience: normalizeInstagramString(payload.target_audience),
    campaign_goal: normalizeInstagramString(payload.campaign_goal),

    campaign_name: normalizeInstagramString(payload.campaign_name),
    brand_voice: normalizeInstagramString(payload.brand_voice),
    offer: normalizeInstagramString(payload.offer),
    key_message: normalizeInstagramString(payload.key_message),
    visual_style: normalizeInstagramString(payload.visual_style),
    language: normalizeInstagramString(payload.language, 'English'),
    number_of_ideas: Number(payload.number_of_ideas || ideas.length || 5),
    story_length_seconds: Number(payload.story_length_seconds || 15),
    notes: normalizeInstagramString(payload.notes),

    ideas,

    markdown: marked(
      [
        `# ${campaignTitle}`,
        '',
        strategySummary ? `## Strategy Summary\n\n${strategySummary}` : '',
        '',
        '## Fixed App Context',
        '',
        `**Brand:** ${payload.brand_name || 'Arka Smart Analyzer'}`,
        '',
        `**Website:** ${payload.app_website_url || ''}`,
        '',
        `**Shopify App Store:** ${payload.shopify_app_store_url || ''}`,
        '',
        '## Story Ideas',
        '',
        ...ideas.map((idea, index) =>
          [
            `### ${index + 1}. ${idea.title}`,
            '',
            `**Angle:** ${idea.angle}`,
            '',
            `**Objective:** ${idea.objective}`,
            '',
            `**Hook:** ${idea.hook}`,
            '',
            `**CTA:** ${idea.cta}`,
            '',
            `**Video Prompt:**`,
            '',
            idea.video_prompt,
          ].join('\n')
        ),
      ]
        .filter(Boolean)
        .join('\n')
    ),

    raw: parsed,
  };
}

async function finalizeInstagramStoryIdeaRun({ run, result }) {
  const payload = run.payload || {};

  const normalizedResult = normalizeInstagramStoryIdeasResult(result, payload);

  const saved = await InstagramStoryIdeaRun.create({
    ...normalizedResult,
    crewName: 'instagram_story_idea',
    rawResult: result,
    crewRunId: run._id,
    generatedAt: new Date(),
  });

  console.log('[finalizeInstagramStoryIdeaRun] saved InstagramStoryIdeaRun', {
    runId: String(run._id),
    savedId: String(saved._id),
    ideasCount: saved.ideas?.length || 0,
  });

  return withSavedRecord(
    {
      parsed: normalizedResult.raw,
      telegram: null,
      telegramReport: '',
    },
    saved,
    'InstagramStoryIdeaRun'
  );
}

function isValidInstagramPostJson(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.ideas) &&
      value.ideas.length > 0
  );
}

function unwrapInstagramPostCrewValues(value) {
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


function normalizeInstagramPostString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeInstagramPostArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function postNormalizeString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function postNormalizeArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function postSafeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function postExtractJsonFromFence(text) {
  if (!text || typeof text !== 'string') return null;

  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlock?.[1]) {
    return postSafeParseJson(jsonBlock[1].trim());
  }

  const genericBlock = text.match(/```\s*([\s\S]*?)```/i);
  if (genericBlock?.[1]) {
    return postSafeParseJson(genericBlock[1].trim());
  }

  return null;
}

function postExtractJsonObjectsFromText(text) {
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
        const candidate = text.slice(start, i + 1);
        const parsed = postSafeParseJson(candidate);

        if (parsed && typeof parsed === 'object') {
          objects.push(parsed);
        }

        break;
      }
    }
  }

  return objects;
}

function postIsValidInstagramPostJson(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray(value.ideas) &&
      value.ideas.length > 0
  );
}

function postUnwrapCrewValues(value) {
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

    const keys = [
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

    for (const key of keys) {
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

function extractInstagramPostJson(value) {
  const candidates = postUnwrapCrewValues(value);

  for (const candidate of candidates) {
    if (postIsValidInstagramPostJson(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;

    const trimmed = candidate.trim();

    const direct = postSafeParseJson(trimmed);
    if (postIsValidInstagramPostJson(direct)) {
      return direct;
    }

    const fenced = postExtractJsonFromFence(trimmed);
    if (postIsValidInstagramPostJson(fenced)) {
      return fenced;
    }

    const objects = postExtractJsonObjectsFromText(trimmed);
    const valid = objects
      .reverse()
      .find((item) => postIsValidInstagramPostJson(item));

    if (valid) {
      return valid;
    }
  }

  return null;
}

function normalizeInstagramPostIdeasResult({ crewResult, payload, run }) {
  const parsed = extractInstagramPostJson(crewResult);

  if (!parsed) {
    const error = new Error('Instagram post crew returned invalid JSON.');
    error.statusCode = 502;
    error.details = {
      crewName: run?.crewName || '',
      runId: run?._id ? String(run._id) : '',
      hasContent: Boolean(getCrewContent(crewResult)),
    };
    throw error;
  }

  const campaignTitle = postNormalizeString(
    parsed.campaign_title,
    payload.campaign_name ||
      `${payload.brand_name || 'Arka Smart Analyzer'} Instagram Post Campaign`
  );

  const strategySummary = postNormalizeString(parsed.strategy_summary);

  const ideas = parsed.ideas.map((idea, index) => ({
    id: postNormalizeString(idea.id, `idea_${index + 1}`),
    title: postNormalizeString(idea.title, `Post Idea ${index + 1}`),
    post_type: postNormalizeString(
      idea.post_type,
      payload.post_format || 'carousel'
    ),
    angle: postNormalizeString(idea.angle),
    objective: postNormalizeString(idea.objective),
    hook: postNormalizeString(idea.hook),
    slides: Array.isArray(idea.slides)
      ? idea.slides.map((slide, slideIndex) => ({
          slide: Number(slide.slide || slideIndex + 1),
          visual: postNormalizeString(slide.visual),
          headline: postNormalizeString(slide.headline),
          body_text: postNormalizeString(slide.body_text),
          design_direction: postNormalizeString(slide.design_direction),
        }))
      : [],
    creative_prompt: postNormalizeString(idea.creative_prompt),
    caption: postNormalizeString(idea.caption),
    cta: postNormalizeString(idea.cta),
    hashtags: postNormalizeArray(idea.hashtags),
    production_notes: postNormalizeArray(idea.production_notes),
  }));

  return {
    runId: run?._id ? String(run._id) : '',
    campaign_title: campaignTitle,
    platform: 'instagram_post',
    format: postNormalizeString(payload.post_format, 'carousel'),
    strategy_summary: strategySummary,

    brand_name: postNormalizeString(payload.brand_name, 'Arka Smart Analyzer'),
    product_or_service: postNormalizeString(payload.product_or_service),
    app_website_url: postNormalizeString(payload.app_website_url),
    shopify_app_store_url: postNormalizeString(payload.shopify_app_store_url),

    target_audience: postNormalizeString(payload.target_audience),
    campaign_goal: postNormalizeString(payload.campaign_goal),

    campaign_name: postNormalizeString(payload.campaign_name),
    brand_voice: postNormalizeString(payload.brand_voice),
    offer: postNormalizeString(payload.offer),
    key_message: postNormalizeString(payload.key_message),
    visual_style: postNormalizeString(payload.visual_style),
    language: postNormalizeString(payload.language, 'English'),
    number_of_ideas: Number(payload.number_of_ideas || ideas.length || 5),
    post_format: postNormalizeString(payload.post_format, 'carousel'),
    notes: postNormalizeString(payload.notes),

    ideas,

    markdown: marked(
      [
        `# ${campaignTitle}`,
        '',
        strategySummary ? `## Strategy Summary\n\n${strategySummary}` : '',
        '',
        '## Fixed App Context',
        '',
        `**Brand:** ${payload.brand_name || 'Arka Smart Analyzer'}`,
        '',
        `**Website:** ${payload.app_website_url || ''}`,
        '',
        `**Shopify App Store:** ${payload.shopify_app_store_url || ''}`,
        '',
        '## Post Ideas',
        '',
        ...ideas.map((idea, index) =>
          [
            `### ${index + 1}. ${idea.title}`,
            '',
            `**Post Type:** ${idea.post_type}`,
            '',
            `**Angle:** ${idea.angle}`,
            '',
            `**Objective:** ${idea.objective}`,
            '',
            `**Hook:** ${idea.hook}`,
            '',
            `**CTA:** ${idea.cta}`,
            '',
            `**Creative Prompt:**`,
            '',
            idea.creative_prompt,
          ].join('\n')
        ),
      ]
        .filter(Boolean)
        .join('\n')
    ),

    raw: parsed,
  };
}

function buildInstagramPostTelegramReport(doc) {
  const ideaLines = Array.isArray(doc.ideas)
    ? doc.ideas
        .slice(0, 5)
        .map((idea, index) => `• ${index + 1}. ${idea.title}`)
        .join('\n')
    : '';

  return [
    `Instagram Post Ideas: ${doc.campaign_title}`,
    `Brand: ${doc.brand_name}`,
    `Goal: ${doc.campaign_goal}`,
    `Audience: ${doc.target_audience}`,
    `Format: ${doc.post_format}`,
    '',
    'Summary',
    doc.strategy_summary ||
      'A new Instagram post idea run was generated and saved for review.',
    '',
    ideaLines ? `Ideas\n${ideaLines}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function finalizeInstagramPostIdeaRun({ run, result }) {
  const normalizedResult = normalizeInstagramPostIdeasResult({
    crewResult: result,
    payload: run.payload || {},
    run,
  });

  const saved = await InstagramPostIdeaRun.create({
    ...normalizedResult,
    crewName: 'instagram_post_idea',
    rawResult: result,
    crewRunId: run._id,
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildInstagramPostTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'instagram_post_idea',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'instagram_post_idea',
      html: saved.markdown || '',
      telegramReport,
    });

    if (saved.schema?.path?.('telegram')) {
      saved.telegram = {
        published: !telegram?.skipped && !!telegram?.ok,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: telegram?.messages?.map((m) => m.messageId) || [],
        publishedAt: telegram?.ok ? new Date() : null,
        reportHtml: telegram?.reportHtml || '',
        error: '',
      };

      await saved.save();
    }

    return withSavedRecord(
      {
        parsed: normalizedResult.raw,
        telegram,
        telegramReport,
      },
      saved,
      'InstagramPostIdeaRun'
    );
  } catch (telegramError) {
    console.error('instagram post telegram publish failed:', telegramError);

    if (saved.schema?.path?.('telegram')) {
      saved.telegram = {
        published: false,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: [],
        publishedAt: null,
        reportHtml: '',
        error: telegramError.message || 'Telegram publish failed',
      };

      await saved.save();
    }

    return withSavedRecord(
      {
        parsed: normalizedResult.raw,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message || 'Telegram publish failed',
        },
        telegramReport: '',
      },
      saved,
      'InstagramPostIdeaRun'
    );
  }
}

export async function finalizeCrewResult({ run, result }) {
  switch (run.crewName) {
    case 'dashboard':
      return finalizeDashboardRun({ run, result });

    case 'blog':
      return finalizeBlogRun({ run, result });

    case 'blog_from_links':
      return finalizeAiBlogFromLinksRun({ run, result });

    case 'research':
      return finalizeResearchRun({ run, result });

    case 'marketing_email_reply':
      return finalizeMarketingEmailReplyRun({ run, result });

    case 'store_crm_analysis':
      return finalizeStoreCrmAnalysisRun({ run, result });

    case 'store_outreach':
      return finalizeStoreOutreachRun({ run, result });

    case 'competitor_analysis':
      return finalizeCompetitorAnalysisRun({ run, result });

    case 'manage_competitor_analysis':
      return finalizeManageCompetitorAnalysisRun({ run, result });

    case 'shopify_trends':
      return finalizeShopifyTrendsRun({ run, result });

    case 'problem_discovery':
      return finalizeProblemDiscoveryRun({ run, result });

    case 'seo_audit':
      return finalizeSeoAuditRun({ run, result });

    case 'seo_keyword_opportunity':
      return finalizeSeoKeywordOpportunityRun({ run, result });

    case 'instagram_story_idea':
      return finalizeInstagramStoryIdeaRun({ run, result });

      case 'instagram_post_idea':
        return finalizeInstagramPostIdeaRun({ run, result });

    default:
      console.warn('[finalizeCrewResult] no finalizer for crewName:', run.crewName);
      return null;
  }
}

async function finalizeAiBlogFromLinksRun({ run, result }) {
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
    throw new Error('AI blog crew response is missing content_html/contentHtml or content_markdown/contentMarkdown');
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

    return withSavedRecord(
      {
        parsed,
        telegram,
        telegramReport,
      },
      saved,
      'AiBlog'
    );
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

async function finalizeBlogRun({ run, result }) {
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

async function finalizeResearchRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = extractJsonBlock(rawContent);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Research crew returned invalid JSON content');
  }

  let telegram = {
    ok: false,
    skipped: true,
    reason: 'Research was not approved or report_markdown was empty',
  };

  if (parsed?.approved && parsed?.report_markdown) {
    try {
      const telegramReport = buildResearchTelegramReport(parsed, run.payload || {});
      const contentHtml = marked.parse(String(parsed.report_markdown || ''));

      telegram = await publishCrewReport({
        crewName: 'research',
        executedBy: {
          _id: run.createdBy || null,
          name: run.meta?.executedByName || 'Unknown user',
        },
        createdAt: new Date(),
        savedId: String(run._id),
        sourceFile: 'research',
        html: contentHtml,
        telegramReport,
      });

      return {
        saved: null,
        savedRecord: null,
        parsed,
        telegram,
        telegramReport,
      };
    } catch (telegramError) {
      console.error('research telegram publish failed:', telegramError);

      return {
        saved: null,
        savedRecord: null,
        parsed,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      };
    }
  }

  return {
    saved: null,
    savedRecord: null,
    parsed,
    telegram,
    telegramReport: '',
  };
}

async function finalizeDashboardRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = extractJsonBlock(rawContent);

  const html = parsed?.html || '';
  const telegramReport = parsed?.telegram_report || '';

  if (!html) {
    throw new Error('Dashboard HTML was empty or crew output was invalid');
  }

  const saved = await DashboardPage.create({
    html,
    crew: 'dashboard',
    sourceFile: run.meta?.sourceFile || 'dashboard_file.md',
    executedBy: run.createdBy || null,
    executedByName: run.meta?.executedByName || 'Unknown user',
    meta: {
      telegram_report: telegramReport,
      raw_crew_content: rawContent,
      tasks_output: getTasksOutput(result),
      crewRunId: run._id,
    },
  });

  let telegram = {
    ok: false,
    skipped: true,
    reason: 'Not attempted',
  };

  try {
    telegram = await publishCrewReport({
      crewName: saved.crew,
      executedBy: {
        _id: run.createdBy || null,
        name: saved.executedByName,
      },
      createdAt: saved.createdAt,
      savedId: saved._id.toString(),
      sourceFile: saved.sourceFile,
      html: saved.html,
      telegramReport,
      tasksOutput: saved.meta?.tasks_output || [],
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();
  } catch (telegramError) {
    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    telegram = {
      ok: false,
      skipped: false,
      error: telegramError.message,
    };
  }

  return withSavedRecord(
    {
      telegram,
      telegramReport,
    },
    saved,
    'DashboardPage'
  );
}

async function finalizeMarketingEmailReplyRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = safeParseJson(rawContent);

  validateMarketingEmailReplyResponse(parsed);

  const query = run.meta?.gmailEmailId
    ? { _id: run.meta.gmailEmailId }
    : { gmailId: run.meta?.gmailId };

  if (!query._id && !query.gmailId) {
    throw new Error('Missing Gmail email identifier for finalizing analysis');
  }

  const saved = await GmailEmail.findOneAndUpdate(
    query,
    {
      $set: {
        latestAnalysis: parsed,
      },
      $push: {
        analysisHistory: {
          analyzedAt: new Date(),
          crewName: 'marketing_email_reply',
          payload: run.payload || {},
          result: parsed,
          rawContent,
          crewRunId: run._id,
        },
      },
    },
    {
      new: true,
    }
  );

  if (!saved) {
    throw new Error('Saved Gmail email not found for analysis finalization');
  }

  return withSavedRecord({ parsed }, saved, 'GmailEmail');
}

async function finalizeStoreCrmAnalysisRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = extractJsonBlock(rawContent);

  if (!run.meta?.storeId) {
    throw new Error('Missing storeId for CRM analysis finalization');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Store CRM analysis crew returned invalid JSON content');
  }

  const analysis =
    parsed.analysis && typeof parsed.analysis === 'object'
      ? parsed.analysis
      : parsed;

  const title =
    parsed.title ||
    `CRM Analysis: ${run.meta?.storeName || run.meta?.storeDomain || run.meta?.storeId
    }`;

  const saved = await StoreCrmAnalysis.create({
    store: run.meta.storeId,
    storeName: run.meta?.storeName || '',
    storeDomain: run.meta?.storeDomain || '',
    title,
    crewName: 'store_crm_analysis',
    analysis,
    status: 'success',
    error: '',
    rawContent,
    payload: run.payload || {},
    meta: {
      crewRunId: run._id,
      storeName: run.meta?.storeName || '',
      storeDomain: run.meta?.storeDomain || '',
      activitiesCount: run.meta?.activitiesCount || 0,
      tasks_output: getTasksOutput(result),
    },
    generatedAt: new Date(),
    telegram: {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      error: '',
    },
  });

  return withSavedRecord({ parsed: analysis }, saved, 'StoreCrmAnalysis');
}

async function finalizeStoreOutreachRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = extractJsonBlock(rawContent);

  if (!parsed) {
    throw new Error('Store outreach crew did not return valid JSON content');
  }

  if (!parsed?.email?.subject || !parsed?.email?.body) {
    throw new Error('Store outreach crew response is missing email content');
  }

  const normalizedWebsiteUrl =
    run.meta?.normalizedWebsiteUrl || run.payload?.website_url || '';

  if (!normalizedWebsiteUrl) {
    throw new Error('Missing normalizedWebsiteUrl for store outreach finalization');
  }

  const saved = await StoreOutreach.findOneAndUpdate(
    { normalizedWebsiteUrl },
    {
      title: parsed?.title || 'Store Outreach Analysis',
      websiteUrl: run.payload?.website_url || normalizedWebsiteUrl,
      normalizedWebsiteUrl,
      storeName: pickStoreName(parsed, run.payload?.store_name || ''),
      managerName: run.payload?.manager_name || '',
      crewName: 'store_outreach',
      targetAppName: run.payload?.target_app_name || 'Arka: Smart Analyzer',
      targetAppShopifyUrl:
        run.payload?.target_app_shopify_url ||
        'https://apps.shopify.com/arka-smart-analyzer',
      targetAppWebsiteUrl:
        run.payload?.target_app_website_url ||
        'https://web.arkaanalyzer.com/',
      analysis: parsed,
      email: {
        subject: parsed?.email?.subject || '',
        previewLine: parsed?.email?.preview_line || '',
        body: parsed?.email?.body || '',
      },
      rawResult: result,
      status: 'success',
      generatedAt: new Date(),
      meta: {
        crewRunId: run._id,
        rawContent,
        tasks_output: getTasksOutput(result),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  try {
    const telegramReport = buildStoreOutreachTelegramReport(saved, parsed);

    const telegram = await publishCrewReport({
      crewName: 'store_outreach',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'store_outreach',
      html: '',
      telegramReport,
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed,
        telegram,
        telegramReport,
      },
      saved,
      'StoreOutreach'
    );
  } catch (telegramError) {
    console.error('store outreach telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
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
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'StoreOutreach'
    );
  }
}

async function finalizeCompetitorAnalysisRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const html = normalizeHtml(rawContent);

  if (!html) {
    throw new Error('Competitor analysis crew did not return valid HTML content');
  }

  const saved = await CompetitorAnalysis.create({
    title: run.meta?.title || 'Arka Smart Analyzer Competitive Analysis',
    appName: run.meta?.appName || 'Arka: Smart Analyzer',
    appUrl: run.meta?.appUrl || 'https://apps.shopify.com/arka-smart-analyzer',
    crewName: 'competitor_analysis',
    html,
    rawResult: result,
    status: 'success',
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildCompetitorTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'competitor_analysis',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'competitor_analysis',
      html: saved.html,
      telegramReport,
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram,
        telegramReport,
      },
      saved,
      'CompetitorAnalysis'
    );
  } catch (telegramError) {
    console.error('competitor telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'CompetitorAnalysis'
    );
  }
}

async function finalizeManageCompetitorAnalysisRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const html = normalizeHtml(rawContent);

  if (!html) {
    throw new Error('Managed competitor analysis crew returned invalid HTML content');
  }

  const payload = run.payload || {};
  const meta = run.meta || {};

  const selectedCompetitors =
    Array.isArray(meta.selectedCompetitors) && meta.selectedCompetitors.length
      ? meta.selectedCompetitors
      : Array.isArray(payload.competitors)
        ? payload.competitors.map((item) => ({
          competitorId: item.id,
          name: item.name,
          description: item.description || '',
          status: item.status || 'active',
          links: Array.isArray(item.links) ? item.links : [],
        }))
        : [];

  const selectedCompetitorIds =
    Array.isArray(meta.selectedCompetitorIds) && meta.selectedCompetitorIds.length
      ? meta.selectedCompetitorIds
      : Array.isArray(payload.selected_competitor_ids)
        ? payload.selected_competitor_ids
        : selectedCompetitors.map((item) => item.competitorId).filter(Boolean);

  const excludedCompetitorIds = Array.isArray(meta.excludedCompetitorIds)
    ? meta.excludedCompetitorIds
    : Array.isArray(payload.excluded_competitor_ids)
      ? payload.excluded_competitor_ids
      : [];

  const saved = await ManageCompetitorAnalysis.create({
    title: `${meta.appName || payload.app_name || 'Arka: Smart Analyzer'
      } Competitor Analysis`,
    appName: meta.appName || payload.app_name || 'Arka: Smart Analyzer',
    appUrl:
      meta.appUrl ||
      payload.app_store_url ||
      'https://apps.shopify.com/arka-smart-analyzer',
    crewName: 'manage_competitor_analysis',
    analysisGoal:
      meta.analysisGoal ||
      payload.analysis_goal ||
      'Analyze selected competitors and identify strengths, weaknesses, and catch-up priorities.',
    selectedCompetitorIds,
    excludedCompetitorIds,
    maxSelectedCompetitors:
      meta.maxSelectedCompetitors ?? payload.max_selected_competitors ?? 0,
    selectedCompetitors,
    html,
    rawResult: result,
    status: 'success',
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildManageCompetitorAnalysisTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'manage_competitor_analysis',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'manage_competitor_analysis',
      html: saved.html || '',
      telegramReport,
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram,
        telegramReport,
      },
      saved,
      'ManageCompetitorAnalysis'
    );
  } catch (telegramError) {
    console.error('manage competitor analysis telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'ManageCompetitorAnalysis'
    );
  }
}

async function finalizeShopifyTrendsRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const html = normalizeHtml(rawContent);

  if (!html) {
    throw new Error('Shopify trends crew did not return valid HTML content');
  }

  const payload = run.payload || {};
  const meta = run.meta || {};

  const saved = await ShopifyTrends.create({
    title: meta.title || 'Shopify Trends Report',
    topic: meta.topic || payload.topic || '',
    targetAppName:
      meta.targetAppName || payload.target_app_name || 'Arka: Smart Analyzer',
    targetAppUrl:
      meta.targetAppUrl ||
      payload.target_app_url ||
      'https://apps.shopify.com/arka-smart-analyzer',
    crewName: 'shopify_trends',
    html,
    rawResult: result,
    status: 'success',
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildShopifyTrendsTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'shopify_trends',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'shopify_trends',
      html: saved.html,
      telegramReport,
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram,
        telegramReport,
      },
      saved,
      'ShopifyTrends'
    );
  } catch (telegramError) {
    console.error('shopify trends telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'ShopifyTrends'
    );
  }
}

async function finalizeProblemDiscoveryRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const parsed = extractJsonBlock(rawContent);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Problem discovery crew returned invalid JSON content');
  }

  if (!Array.isArray(parsed.items)) {
    throw new Error('Problem discovery crew response is missing items array');
  }

  const payload = run.payload || {};
  const meta = run.meta || {};

  const summary = parsed.summary || {
    total_candidates: parsed.items.length,
    accepted_count: parsed.items.length,
  };

  const saved = await ProblemDiscoveryRun.create({
    sourceUrls: Array.isArray(meta.sourceUrls)
      ? meta.sourceUrls
      : Array.isArray(payload.urls)
        ? payload.urls
        : [],
    appReferenceUrl:
      meta.appReferenceUrl ||
      payload.app_reference_url ||
      'https://apps.shopify.com/arka-smart-analyzer',
    maxResults: meta.maxResults || payload.max_results || 20,
    items: parsed.items,
    summary,
    crewName: 'problem_discovery',
    rawResult: result,
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildProblemDiscoveryTelegramReport(saved, parsed);

    const telegram = await publishCrewReport({
      crewName: 'problem_discovery',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'problem_discovery',
      html: '',
      telegramReport,
    });

    if (saved.telegram !== undefined || saved.schema?.path?.('telegram')) {
      saved.telegram = {
        published: !telegram?.skipped && !!telegram?.ok,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: telegram?.messages?.map((m) => m.messageId) || [],
        publishedAt: telegram?.ok ? new Date() : null,
        reportHtml: telegram?.reportHtml || '',
        error: '',
      };

      await saved.save();
    }

    return withSavedRecord(
      {
        parsed,
        telegram,
        telegramReport,
      },
      saved,
      'ProblemDiscoveryRun'
    );
  } catch (telegramError) {
    console.error('problem discovery telegram publish failed:', telegramError);

    if (saved.telegram !== undefined || saved.schema?.path?.('telegram')) {
      saved.telegram = {
        published: false,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: [],
        publishedAt: null,
        reportHtml: '',
        error: telegramError.message || 'Telegram publish failed',
      };

      await saved.save();
    }

    return withSavedRecord(
      {
        parsed,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'ProblemDiscoveryRun'
    );
  }
}

async function finalizeSeoAuditRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const html = normalizeHtml(rawContent);

  if (!html) {
    const failed = await SeoAudit.create({
      title: run.meta?.title || SEO_AUDIT_REPORT_TITLE,
      websiteUrl: run.meta?.websiteUrl || SEO_AUDIT_WEBSITE_URL,
      crewName: 'seo_audit',
      html: '',
      rawResult: result,
      status: 'failed',
      error: 'SEO audit crew did not return valid HTML content',
      generatedAt: new Date(),
    });

    throw new Error(
      `SEO audit crew did not return valid HTML content. Failed record: ${failed._id}`
    );
  }

  const saved = await SeoAudit.create({
    title: run.meta?.title || SEO_AUDIT_REPORT_TITLE,
    websiteUrl: run.meta?.websiteUrl || SEO_AUDIT_WEBSITE_URL,
    crewName: 'seo_audit',
    html,
    rawResult: result,
    status: 'success',
    error: '',
    generatedAt: new Date(),
  });

  try {
    const telegramReport = buildSeoAuditTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'seo_audit',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'seo_audit',
      html: saved.html,
      telegramReport,
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram,
        telegramReport,
      },
      saved,
      'SeoAudit'
    );
  } catch (telegramError) {
    console.error('seo audit telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'SeoAudit'
    );
  }
}

async function finalizeSeoKeywordOpportunityRun({ run, result }) {
  const rawContent = getCrewContent(result);
  const resultContent = normalizeHtml(rawContent) || String(rawContent || '').trim();

  const payload = run.payload || {};
  const meta = run.meta || {};

  if (!resultContent) {
    const failed = await SeoKeywordOpportunity.create({
      websiteUrl: meta.websiteUrl || payload.website_url || '',
      brandName: meta.brandName || payload.brand_name || '',
      tone: meta.tone || payload.tone || 'professional and analytical',
      maxKeywords: meta.maxKeywords || payload.max_keywords || 12,
      crewName: 'seo_keyword_opportunity',
      resultContent: '',
      tasksOutput: getTasksOutput(result),
      rawResponse: result,
      status: 'failed',
    });

    throw new Error(
      `SEO keyword opportunity crew returned empty content. Failed record: ${failed._id}`
    );
  }

  const saved = await SeoKeywordOpportunity.create({
    websiteUrl: meta.websiteUrl || payload.website_url || '',
    brandName: meta.brandName || payload.brand_name || '',
    tone: meta.tone || payload.tone || 'professional and analytical',
    maxKeywords: meta.maxKeywords || payload.max_keywords || 12,
    crewName: 'seo_keyword_opportunity',
    resultContent,
    tasksOutput: getTasksOutput(result),
    rawResponse: result,
    status: 'success',
  });

  try {
    const telegramReport = buildSeoKeywordOpportunityTelegramReport(saved);

    const telegram = await publishCrewReport({
      crewName: 'seo_keyword_opportunity',
      executedBy: {
        _id: run.createdBy || null,
        name: run.meta?.executedByName || 'Unknown user',
      },
      createdAt: saved.createdAt || new Date(),
      savedId: saved._id.toString(),
      sourceFile: 'seo_keyword_opportunity',
      html: saved.resultContent || '',
      telegramReport,
      tasksOutput: saved.tasksOutput || [],
    });

    saved.telegram = {
      published: !telegram?.skipped && !!telegram?.ok,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: telegram?.messages?.map((m) => m.messageId) || [],
      publishedAt: telegram?.ok ? new Date() : null,
      reportHtml: telegram?.reportHtml || '',
      error: '',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram,
        telegramReport,
      },
      saved,
      'SeoKeywordOpportunity'
    );
  } catch (telegramError) {
    console.error('seo keyword opportunity telegram publish failed:', telegramError);

    saved.telegram = {
      published: false,
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
      messageIds: [],
      publishedAt: null,
      reportHtml: '',
      error: telegramError.message || 'Telegram publish failed',
    };

    await saved.save();

    return withSavedRecord(
      {
        parsed: null,
        telegram: {
          ok: false,
          skipped: false,
          error: telegramError.message,
        },
        telegramReport: '',
      },
      saved,
      'SeoKeywordOpportunity'
    );
  }
}