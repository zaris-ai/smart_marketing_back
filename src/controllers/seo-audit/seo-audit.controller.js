import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import SeoAudit from '../../models/seo-audit.model.js';

const WEBSITE_URL = 'https://web.arkaanalyzer.com/';
const REPORT_TITLE = 'Arka Analyzer SEO Audit';

function normalizeHtml(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
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

export async function getLatestSeoAudit(req, res, next) {
  try {
    const latest = await SeoAudit.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      message: latest
        ? 'Latest SEO audit fetched successfully'
        : 'No SEO audit found',
      data: latest,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function runSeoAudit(req, res, next) {
  try {
    const result = await runPythonCrew({
      crewName: 'seo_audit',
      payload: {},
    });

    const html = normalizeHtml(result?.result?.content);

    if (!html) {
      return res.status(500).json({
        ok: false,
        message: 'Crew did not return valid HTML content',
      });
    }

    const doc = await SeoAudit.create({
      title: REPORT_TITLE,
      websiteUrl: WEBSITE_URL,
      crewName: 'seo_audit',
      html,
      rawResult: result,
      status: 'success',
      generatedAt: new Date(),
    });

    try {
      const telegramReport = buildSeoAuditTelegramReport(doc);

      const telegram = await publishCrewReport({
        crewName: 'seo_audit',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'seo_audit',
        html: doc.html,
        telegramReport,
      });

      doc.telegram = {
        published: !telegram?.skipped && !!telegram?.ok,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: telegram?.messages?.map((m) => m.messageId) || [],
        publishedAt: telegram?.ok ? new Date() : null,
        reportHtml: telegram?.reportHtml || '',
        error: '',
      };

      await doc.save();
    } catch (telegramError) {
      console.error('seo audit telegram publish failed:', telegramError);

      doc.telegram = {
        published: false,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: [],
        publishedAt: null,
        reportHtml: '',
        error: telegramError.message || 'Telegram publish failed',
      };

      await doc.save();
    }

    return res.status(201).json({
      ok: true,
      message: 'SEO audit generated and saved successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);

    try {
      await SeoAudit.create({
        title: REPORT_TITLE,
        websiteUrl: WEBSITE_URL,
        crewName: 'seo_audit',
        html: '',
        rawResult: null,
        status: 'failed',
        error: error.message || 'Unknown error',
        generatedAt: new Date(),
      });
    } catch (saveError) {
      console.error('Failed to save failed SEO audit:', saveError);
    }

    next(error);
  }
}