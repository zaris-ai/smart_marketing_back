import ProblemDiscoveryRun from '../../models/problem-discovery-run.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import {
  normalizeMaxResults,
  requireUrls,
} from './problem-discovery.validator.js';

const DEFAULT_APP_REFERENCE_URL = 'https://apps.shopify.com/arka-smart-analyzer';

export async function createProblemDiscoveryRun(req, res, next) {
  try {
    requireUrls(req.body.urls);

    const payload = {
      urls: req.body.urls,
      app_reference_url: req.body.app_reference_url || DEFAULT_APP_REFERENCE_URL,
      max_results: normalizeMaxResults(req.body.max_results, 20),
    };

    const run = await enqueueCrewRun({
      crewName: 'problem_discovery',
      title: 'Problem Discovery Run',
      payload,
      meta: {
        sourceUrls: payload.urls,
        appReferenceUrl: payload.app_reference_url,
        maxResults: payload.max_results,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Problem discovery started in background',
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
      success: true,
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
        success: false,
        message: 'Problem discovery run not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
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
        success: false,
        message: 'Problem discovery run not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'Problem discovery run deleted successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}