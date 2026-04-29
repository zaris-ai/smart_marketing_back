import ProblemDiscoveryRun from '../../models/problem-discovery-run.model.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import {
  normalizeMaxResults,
  requireUrls,
  validateProblemDiscoveryResponse,
} from './problem-discovery.validator.js';

const DEFAULT_APP_REFERENCE_URL = 'https://apps.shopify.com/arka-smart-analyzer';

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildProblemDiscoveryTelegramReport(doc, parsed) {
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const summary = parsed?.summary || {};
  const acceptedCount =
    typeof summary.accepted_count === 'number' ? summary.accepted_count : items.length;
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
    `Problem Discovery Run`,
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

export async function createProblemDiscoveryRun(req, res, next) {
  try {
    requireUrls(req.body.urls);

    const payload = {
      urls: req.body.urls,
      app_reference_url: req.body.app_reference_url || DEFAULT_APP_REFERENCE_URL,
      max_results: normalizeMaxResults(req.body.max_results, 20),
    };

    const result = await runPythonCrew({
      crewName: 'problem_discovery',
      payload,
    });

    const parsed = safeJsonParse(result?.result?.content);

    if (!parsed) {
      return res.status(500).json({
        ok: false,
        message: 'Crew returned invalid JSON content',
        raw: result?.result?.content,
      });
    }

    validateProblemDiscoveryResponse(parsed);

    const doc = await ProblemDiscoveryRun.create({
      sourceUrls: payload.urls,
      appReferenceUrl: payload.app_reference_url,
      maxResults: payload.max_results,
      items: parsed.items,
      summary: parsed.summary || {
        total_candidates: parsed.items.length,
        accepted_count: parsed.items.length,
      },
      crewName: 'problem_discovery',
      rawResult: result,
      generatedAt: new Date(),
    });

    try {
      const telegramReport = buildProblemDiscoveryTelegramReport(doc, parsed);

      const telegram = await publishCrewReport({
        crewName: 'problem_discovery',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'problem_discovery',
        html: '',
        telegramReport,
      });

      if (doc.telegram !== undefined || doc.schema?.path?.('telegram')) {
        doc.telegram = {
          published: !telegram?.skipped && !!telegram?.ok,
          channelId: process.env.TELEGRAM_CHANNEL_ID || '',
          messageIds: telegram?.messages?.map((m) => m.messageId) || [],
          publishedAt: telegram?.ok ? new Date() : null,
          reportHtml: telegram?.reportHtml || '',
          error: '',
        };

        await doc.save();
      }
    } catch (telegramError) {
      console.error('problem discovery telegram publish failed:', telegramError);

      if (doc.telegram !== undefined || doc.schema?.path?.('telegram')) {
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
    }

    return res.status(201).json({
      ok: true,
      message: 'Problem discovery run created successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function getProblemDiscoveryRuns(req, res, next) {
  try {
    const { limit = 20, page = 1, source, pain_category, can_arka_solve } = req.query;

    const query = {};

    if (source && typeof source === 'string') {
      query['items.source'] = source.trim();
    }

    if (pain_category && typeof pain_category === 'string') {
      query['items.pain_category'] = pain_category.trim();
    }

    if (can_arka_solve === 'true') {
      query['items.can_arka_solve'] = true;
    }

    if (can_arka_solve === 'false') {
      query['items.can_arka_solve'] = false;
    }

    const safeLimit = Math.min(Number(limit) || 20, 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      ProblemDiscoveryRun.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      ProblemDiscoveryRun.countDocuments(query),
    ]);

    return res.status(200).json({
      ok: true,
      message: 'Problem discovery runs fetched successfully',
      data: {
        items,
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          pages: Math.ceil(total / safeLimit),
        },
      },
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function getProblemDiscoveryRunById(req, res, next) {
  try {
    const doc = await ProblemDiscoveryRun.findById(req.params.id).lean();

    if (!doc) {
      return res.status(404).json({
        ok: false,
        message: 'Problem discovery run not found',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Problem discovery run fetched successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function deleteProblemDiscoveryRun(req, res, next) {
  try {
    const doc = await ProblemDiscoveryRun.findByIdAndDelete(req.params.id);

    if (!doc) {
      return res.status(404).json({
        ok: false,
        message: 'Problem discovery run not found',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Problem discovery run deleted successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}