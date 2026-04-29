import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
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

function extractJsonBlock(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;

    const maybeJson = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(maybeJson);
    } catch (_) {
      return null;
    }
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

function buildStoreOutreachTelegramReport(doc, parsed) {
  const storeName = doc.storeName || parsed?.store?.name || 'Unknown store';
  const websiteUrl = doc.websiteUrl || parsed?.store?.website_url || '';
  const summary = parsed?.store?.summary || '';
  const overallFit = parsed?.app_fit?.overall_fit || 'unknown';
  const fitScore =
    parsed?.app_fit?.fit_score !== undefined && parsed?.app_fit?.fit_score !== null
      ? String(parsed.app_fit.fit_score)
      : 'N/A';

  const useCases = Array.isArray(parsed?.app_fit?.use_cases)
    ? parsed.app_fit.use_cases.slice(0, 4).map((item) => `• ${item}`).join('\n')
    : '';

  const pitchAngles = Array.isArray(parsed?.app_fit?.pitch_angles)
    ? parsed.app_fit.pitch_angles.slice(0, 3).map((item) => `• ${item}`).join('\n')
    : '';

  const subject = parsed?.email?.subject || '';
  const previewLine = parsed?.email?.preview_line || '';

  return [
    `Store Outreach: ${doc.title}`,
    `Store: ${storeName}`,
    websiteUrl ? `Website: ${websiteUrl}` : '',
    '',
    'Summary',
    summary || 'A new outreach analysis was generated successfully for internal review.',
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

export async function getLatestStoreOutreach(req, res, next) {
  try {
    const latest = await StoreOutreach.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
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

    const result = await runPythonCrew({
      crewName: 'store_outreach',
      payload,
    });

    const parsed = extractJsonBlock(result?.result?.content);

    if (!parsed) {
      return res.status(500).json({
        ok: false,
        message: 'Crew did not return valid JSON content',
      });
    }

    if (!parsed?.email?.subject || !parsed?.email?.body) {
      return res.status(500).json({
        ok: false,
        message: 'Crew response is missing email content',
      });
    }

    const doc = await StoreOutreach.findOneAndUpdate(
      { normalizedWebsiteUrl },
      {
        title: parsed?.title || 'Store Outreach Analysis',
        websiteUrl: payload.website_url,
        normalizedWebsiteUrl,
        storeName: pickStoreName(parsed, payload.store_name),
        managerName: payload.manager_name,
        crewName: 'store_outreach',
        targetAppName: payload.target_app_name,
        targetAppShopifyUrl: payload.target_app_shopify_url,
        targetAppWebsiteUrl: payload.target_app_website_url,
        analysis: parsed,
        email: {
          subject: parsed?.email?.subject || '',
          previewLine: parsed?.email?.preview_line || '',
          body: parsed?.email?.body || '',
        },
        rawResult: result,
        status: 'success',
        generatedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    try {
      const telegramReport = buildStoreOutreachTelegramReport(doc, parsed);

      const telegram = await publishCrewReport({
        crewName: 'store_outreach',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'store_outreach',
        html: '',
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
      console.error('store outreach telegram publish failed:', telegramError);

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
      cached: false,
      message: 'Store outreach analysis generated and saved successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}