import { randomUUID } from 'node:crypto';
import { marked } from 'marked';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import { requireFields } from './crew.validators.js';

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
    .map((source) => `• ${source.title}`)
    .join('\n');

  return [
    `Research: ${title}`,
    `Topic: ${payload.topic}`,
    `Audience: ${payload.audience}`,
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

export async function createResearch(req, res, next) {
  try {
    requireFields(req.body, ['topic']);

    const payload = {
      topic: req.body.topic,
      audience: req.body.audience || 'marketing manager',
      market: req.body.market || 'global market',
      business_context: req.body.business_context || '',
      goal: req.body.goal || '',
      product_context: req.body.product_context || '',
      country: req.body.country || 'us',
      locale: req.body.locale || 'en',
      max_sources: Number(req.body.max_sources || 10),
    };

    const result = await runPythonCrew({
      crewName: 'research',
      payload,
    });

    // Telegram side effect only. Response shape stays unchanged.
    try {
      const rawContent = result?.result?.content || '';
      const parsed = safeParseJson(rawContent);

      if (parsed?.approved && parsed?.report_markdown) {
        const telegramReport = buildResearchTelegramReport(parsed, payload);
        const contentHtml = marked.parse(String(parsed.report_markdown || ''));

        await publishCrewReport({
          crewName: 'research',
          executedBy: req.user || null,
          createdAt: new Date(),
          savedId: randomUUID(),
          sourceFile: 'research',
          html: contentHtml,
          telegramReport,
        });
      }
    } catch (telegramError) {
      console.error('research telegram publish failed:', telegramError);
    }

    return res.status(201).json({
      ok: true,
      message: 'Research created successfully',
      data: result,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
}