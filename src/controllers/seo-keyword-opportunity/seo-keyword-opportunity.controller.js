import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import SeoKeywordOpportunity from '../../models/seo-keyword-opportunity.model.js';
import {
  requireFields,
  validateWebsiteUrl,
} from './crew.validators.js';

function buildSeoKeywordOpportunityTelegramReport(doc) {
  return [
    `SEO Keyword Opportunity Report`,
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

export async function createSeoKeywordOpportunity(req, res, next) {
  try {
    requireFields(req.body, ['website_url']);

    const payload = {
      website_url: validateWebsiteUrl(req.body.website_url),
      brand_name: req.body.brand_name || '',
      tone: req.body.tone || 'professional and analytical',
      max_keywords: Number(req.body.max_keywords || 12),
    };

    const result = await runPythonCrew({
      crewName: 'seo_keyword_opportunity',
      payload,
    });

    const doc = await SeoKeywordOpportunity.create({
      websiteUrl: payload.website_url,
      brandName: payload.brand_name,
      tone: payload.tone,
      maxKeywords: payload.max_keywords,
      crewName: 'seo_keyword_opportunity',
      resultContent: result?.result?.content || '',
      tasksOutput: result?.result?.tasks_output || [],
      rawResponse: result,
      status: result?.ok ? 'success' : 'failed',
    });

    try {
      const telegramReport = buildSeoKeywordOpportunityTelegramReport(doc);

      const telegram = await publishCrewReport({
        crewName: 'seo_keyword_opportunity',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'seo_keyword_opportunity',
        html: doc.resultContent || '',
        telegramReport,
        tasksOutput: doc.tasksOutput || [],
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
      console.error('seo keyword opportunity telegram publish failed:', telegramError);

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
      message: 'SEO keyword opportunity report created successfully',
      data: doc,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
}

export async function getLatestSeoKeywordOpportunity(req, res, next) {
  try {
    const doc = await SeoKeywordOpportunity.findOne({
      crewName: 'seo_keyword_opportunity',
      status: 'success',
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      ok: true,
      data: doc,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
}