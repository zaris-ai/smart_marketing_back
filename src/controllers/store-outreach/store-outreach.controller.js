import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import { requireFields } from './crew.validators.js';
import StoreOutreach from '../../models/store-outreach.model.js';

function normalizeWebsiteUrl(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('website_url is required');
  }

  let raw = value.trim();

  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  const url = new URL(raw);
  const protocol = 'https:';
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname =
    url.pathname && url.pathname !== '/'
      ? url.pathname.replace(/\/+$/, '')
      : '';

  return `${protocol}//${hostname}${pathname}`;
}

export async function getLatestStoreOutreach(req, res, next) {
  try {
    const latest = await StoreOutreach.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      success: true,
      message: latest
        ? 'Latest store outreach analysis fetched successfully'
        : 'No store outreach analysis found',
      data: latest,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function runStoreOutreach(req, res, next) {
  try {
    requireFields(req.body, ['website_url']);

    const normalizedWebsiteUrl = normalizeWebsiteUrl(req.body.website_url);
    const forceRefresh = req.body.force_refresh === true;

    if (!forceRefresh) {
      const existing = await StoreOutreach.findOne({
        normalizedWebsiteUrl,
        status: 'success',
      })
        .sort({ createdAt: -1 })
        .lean();

      if (existing) {
        return res.status(200).json({
          ok: true,
          success: true,
          cached: true,
          message: 'Existing store outreach analysis returned from database',
          data: existing,
        });
      }
    }

    const payload = {
      website_url: normalizedWebsiteUrl,
      store_name: req.body.store_name || '',
      manager_name: req.body.manager_name || '',
      tone: req.body.tone || 'direct and strategic',
      email_goal: req.body.email_goal || 'book a short intro call',
      notes: req.body.notes || '',
      target_app_name: 'Arka: Smart Analyzer',
      target_app_shopify_url: 'https://apps.shopify.com/arka-smart-analyzer',
      target_app_website_url: 'https://web.arkaanalyzer.com/',
    };

    const run = await enqueueCrewRun({
      crewName: 'store_outreach',
      title: `Store outreach: ${payload.store_name || normalizedWebsiteUrl}`,
      payload,
      meta: {
        normalizedWebsiteUrl,
        websiteUrl: payload.website_url,
        storeName: payload.store_name,
        managerName: payload.manager_name,
        targetAppName: payload.target_app_name,
        forceRefresh,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      cached: false,
      message: 'Store outreach analysis started in background',
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