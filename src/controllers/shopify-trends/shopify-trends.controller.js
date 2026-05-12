import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
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

export async function getLatestShopifyTrends(req, res, next) {
  try {
    const latest = await ShopifyTrends.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      success: true,
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
        req.body.target_app_url ||
        'https://apps.shopify.com/arka-smart-analyzer',
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

    const run = await enqueueCrewRun({
      crewName: 'shopify_trends',
      title: req.body.title || 'Shopify Trends Report',
      payload,
      meta: {
        title: req.body.title || 'Shopify Trends Report',
        topic: payload.topic,
        targetAppName: payload.target_app_name,
        targetAppUrl: payload.target_app_url,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Shopify trends report started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}