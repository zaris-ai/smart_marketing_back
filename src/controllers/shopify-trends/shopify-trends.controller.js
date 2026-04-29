import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import { requireFields } from './crew.validators.js';
import ShopifyTrends from '../../models/shopify-trends.model.js';

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeHtml(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
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

export async function getLatestShopifyTrends(req, res, next) {
  try {
    const latest = await ShopifyTrends.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      message: latest
        ? 'Latest Shopify trends report fetched successfully'
        : 'No Shopify trends report found',
      data: latest,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function runShopifyTrends(req, res, next) {
  try {
    requireFields(req.body, ['topic']);

    const payload = {
      topic: req.body.topic,
      target_app_name: req.body.target_app_name || 'Arka: Smart Analyzer',
      target_app_url:
        req.body.target_app_url || 'https://apps.shopify.com/arka-smart-analyzer',
      target_market: req.body.target_market || 'Shopify merchants',
      tone: req.body.tone || 'direct and strategic',
      publish_goal: req.body.publish_goal || 'internal executive report',
      include_store_analysis: req.body.include_store_analysis !== false,
      include_app_analysis: req.body.include_app_analysis !== false,
      include_google_search: req.body.include_google_search !== false,
      max_apps: Number(req.body.max_apps || 8),
      max_stores: Number(req.body.max_stores || 8),
      keywords: toArray(req.body.keywords),
      app_urls: toArray(req.body.app_urls),
      store_urls: toArray(req.body.store_urls),
      notes: req.body.notes || '',
    };

    const result = await runPythonCrew({
      crewName: 'shopify_trends',
      payload,
    });

    const html = normalizeHtml(result?.result?.content);

    if (!html) {
      return res.status(500).json({
        ok: false,
        message: 'Crew did not return valid HTML content',
      });
    }

    const doc = await ShopifyTrends.create({
      title: req.body.title || 'Shopify Trends Report',
      topic: payload.topic,
      targetAppName: payload.target_app_name,
      targetAppUrl: payload.target_app_url,
      crewName: 'shopify_trends',
      html,
      rawResult: result,
      status: 'success',
      generatedAt: new Date(),
    });

    try {
      const telegramReport = buildShopifyTrendsTelegramReport(doc);

      const telegram = await publishCrewReport({
        crewName: 'shopify_trends',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'shopify_trends',
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
      console.error('shopify trends telegram publish failed:', telegramError);

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
      message: 'Shopify trends report generated and saved successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}