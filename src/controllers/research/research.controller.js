import mongoose from 'mongoose';

import ResearchRun from '../../models/research-run.model.js';
import CrewRun from '../../models/crewRun.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import { requireFields } from './crew.validators.js';

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeLimit(value) {
  const parsed = Number(value || 20);

  if (!Number.isFinite(parsed)) return 20;

  return Math.min(Math.max(parsed, 1), 50);
}

function normalizePage(value) {
  const parsed = Number(value || 1);

  if (!Number.isFinite(parsed)) return 1;

  return Math.max(parsed, 1);
}

function safeJsonParse(value) {
  if (!value) return null;

  if (typeof value === 'object') return value;

  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonObject(value) {
  if (!value || typeof value !== 'string') return null;

  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) return null;

  return safeJsonParse(value.slice(start, end + 1));
}

function normalizeTasksOutput(value) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === 'string') return item;

    try {
      return JSON.stringify(item, null, 2);
    } catch {
      return String(item || '');
    }
  });
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((source) => ({
      title: cleanString(source?.title || ''),
      url: cleanString(source?.url || ''),
      note: cleanString(source?.note || ''),
    }))
    .filter((source) => source.title || source.url || source.note);
}

function normalizeError(error) {
  if (!error) {
    return {
      message: '',
      stack: '',
      name: '',
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      stack: '',
      name: '',
    };
  }

  return {
    message: cleanString(error.message || error.error || ''),
    stack: cleanString(error.stack || ''),
    name: cleanString(error.name || ''),
  };
}

function parseResearchCrewResult(rawRunResult) {
  const rawResult = rawRunResult || {};

  const rawContent =
    rawResult?.result?.content ||
    rawResult?.content ||
    rawResult?.rawContent ||
    '';

  const tasksOutput = Array.isArray(rawResult?.result?.tasks_output)
    ? rawResult.result.tasks_output
    : Array.isArray(rawResult?.tasks_output)
      ? rawResult.tasks_output
      : [];

  let parsedContent = {};

  if (rawContent && typeof rawContent === 'object') {
    parsedContent = rawContent;
  }

  if (typeof rawContent === 'string' && rawContent.trim()) {
    parsedContent =
      safeJsonParse(rawContent) ||
      extractJsonObject(rawContent) ||
      {};
  }

  return {
    approved: Boolean(parsedContent?.approved),
    reportTitle: cleanString(parsedContent?.title || ''),
    reportMarkdown: String(parsedContent?.report_markdown || ''),
    sources: normalizeSources(parsedContent?.sources),
    reviewerNotes: cleanString(parsedContent?.reviewer_notes || ''),
    tasksOutput: normalizeTasksOutput(tasksOutput),
    rawContent:
      typeof rawContent === 'string'
        ? rawContent
        : JSON.stringify(rawContent || {}, null, 2),
    result: rawResult,
  };
}

async function syncResearchRunFromCrewRun(researchRun) {
  if (!researchRun?.runId) return researchRun;

  const crewRun = await CrewRun.findById(researchRun.runId).lean();

  if (!crewRun) return researchRun;

  const update = {
    status: crewRun.status || researchRun.status,
    startedAt: crewRun.startedAt || researchRun.startedAt || null,
    finishedAt: crewRun.finishedAt || researchRun.finishedAt || null,
    error: normalizeError(crewRun.error),
  };

  if (crewRun.status === 'success') {
    Object.assign(update, parseResearchCrewResult(crewRun.result));
  }

  if (crewRun.status === 'failed') {
    update.result = crewRun.result || researchRun.result || null;
  }

  const synced = await ResearchRun.findByIdAndUpdate(
    researchRun._id,
    { $set: update },
    { returnDocument: 'after' }
  ).lean();

  return synced || researchRun;
}

function buildOwnerFilter(req) {
  if (!req.user?._id) return {};

  return {
    userId: req.user._id,
  };
}

export async function createResearch(req, res, next) {
  try {
    requireFields(req.body, ['topic']);

    const payload = {
      topic: cleanString(req.body.topic),
      audience: cleanString(req.body.audience || 'marketing manager'),
      market: cleanString(req.body.market || 'global market'),
      business_context: cleanString(req.body.business_context || ''),
      goal: cleanString(req.body.goal || ''),
      product_context: cleanString(req.body.product_context || ''),
      country: cleanString(req.body.country || 'us'),
      locale: cleanString(req.body.locale || 'en'),
      max_sources: Number(req.body.max_sources || 10),
    };

    const run = await enqueueCrewRun({
      crewName: 'research',
      title: `Research: ${payload.topic}`,
      payload,
      meta: {
        audience: payload.audience,
        market: payload.market,
        goal: payload.goal,
      },
      userId: req.user?._id || null,
    });

    const researchRun = await ResearchRun.create({
      runId: run._id,
      userId: req.user?._id || null,
      crewName: 'research',
      status: run.status || 'queued',
      title: `Research: ${payload.topic}`,
      ...payload,
      meta: {
        audience: payload.audience,
        market: payload.market,
        goal: payload.goal,
      },
      startedAt: run.startedAt || null,
      finishedAt: run.finishedAt || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Research started in background',
      data: {
        researchId: researchRun._id,
        runId: run._id,
        status: researchRun.status,
        crewName: researchRun.crewName,
        createdAt: researchRun.createdAt,
      },
    });
  } catch (error) {
    console.log('createResearch enqueue error:', error);
    next(error);
  }
}

export async function listResearch(req, res, next) {
  try {
    const page = normalizePage(req.query.page);
    const limit = normalizeLimit(req.query.limit);
    const skip = (page - 1) * limit;

    const q = cleanString(req.query.q || '');
    const status = cleanString(req.query.status || '');

    const filter = {
      ...buildOwnerFilter(req),
    };

    if (status) {
      filter.status = status;
    }

    if (q) {
      filter.$or = [
        { topic: { $regex: q, $options: 'i' } },
        { title: { $regex: q, $options: 'i' } },
        { reportTitle: { $regex: q, $options: 'i' } },
        { market: { $regex: q, $options: 'i' } },
        { audience: { $regex: q, $options: 'i' } },
      ];
    }

    const [total, docs] = await Promise.all([
      ResearchRun.countDocuments(filter),
      ResearchRun.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const syncedItems = await Promise.all(
      docs.map((doc) => syncResearchRunFromCrewRun(doc))
    );

    return res.json({
      ok: true,
      success: true,
      data: {
        items: syncedItems,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getResearchById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Invalid research ID',
      });
    }

    const researchRun = await ResearchRun.findOne({
      _id: id,
      ...buildOwnerFilter(req),
    }).lean();

    if (!researchRun) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'Research result not found',
      });
    }

    const synced = await syncResearchRunFromCrewRun(researchRun);

    return res.json({
      ok: true,
      success: true,
      data: synced,
    });
  } catch (error) {
    next(error);
  }
}

export async function getResearchByRunId(req, res, next) {
  try {
    const { runId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(runId)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Invalid background run ID',
      });
    }

    const researchRun = await ResearchRun.findOne({
      runId,
      ...buildOwnerFilter(req),
    }).lean();

    if (!researchRun) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'Research result not found for this background run',
      });
    }

    const synced = await syncResearchRunFromCrewRun(researchRun);

    return res.json({
      ok: true,
      success: true,
      data: synced,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteResearch(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Invalid research ID',
      });
    }

    const deleted = await ResearchRun.findOneAndDelete({
      _id: id,
      ...buildOwnerFilter(req),
    }).lean();

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'Research result not found',
      });
    }

    return res.json({
      ok: true,
      success: true,
      message: 'Research result deleted',
      data: {
        id,
      },
    });
  } catch (error) {
    next(error);
  }
}