import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import CompetitorAnalysis from '../../models/competitor-analysis.model.js';

function normalizeHtml(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
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

export async function getLatestCompetitorAnalysis(req, res, next) {
  try {
    const latest = await CompetitorAnalysis.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      message: latest
        ? 'Latest competitor analysis fetched successfully'
        : 'No competitor analysis found',
      data: latest,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function runCompetitorAnalysis(req, res, next) {
  try {
    const result = await runPythonCrew({
      crewName: 'competitor_analysis',
      payload: {},
    });

    const html = normalizeHtml(result?.result?.content);

    if (!html) {
      return res.status(500).json({
        ok: false,
        message: 'Crew did not return valid HTML content',
      });
    }

    const doc = await CompetitorAnalysis.create({
      title: 'Arka Smart Analyzer Competitive Analysis',
      appName: 'Arka: Smart Analyzer',
      appUrl: 'https://apps.shopify.com/arka-smart-analyzer',
      crewName: 'competitor_analysis',
      html,
      rawResult: result,
      status: 'success',
      generatedAt: new Date(),
    });

    try {
      const telegramReport = buildCompetitorTelegramReport(doc);

      const telegram = await publishCrewReport({
        crewName: 'competitor_analysis',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'competitor_analysis',
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
      console.error('competitor telegram publish failed:', telegramError);

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
      message: 'Competitor analysis generated and saved successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}