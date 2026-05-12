import mongoose from 'mongoose';

import CrewRun from '../../models/crewRun.model.js';
import {
  cancelCrewRun,
  deleteCrewRun,
} from '../../services/backgroundCrew.service.js';

function normalizeString(value = '') {
  return String(value || '').trim();
}

function serializeRun(run) {
  if (!run) return null;

  const doc = typeof run.toObject === 'function' ? run.toObject() : run;

  return {
    _id: String(doc._id),
    crewName: doc.crewName,
    title: doc.title,
    status: doc.status,
    payload: doc.payload,
    meta: doc.meta,
    result: doc.result,
    savedRecord: doc.savedRecord || null,
    error: doc.error || null,
    jobId: doc.jobId || null,
    cancelRequestedAt: doc.cancelRequestedAt || null,
    deletedAt: doc.deletedAt || null,
    startedAt: doc.startedAt || null,
    finishedAt: doc.finishedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listBackgroundRuns(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    const q = normalizeString(req.query.q);
    const status = normalizeString(req.query.status);
    const crewName = normalizeString(req.query.crewName);

    const filter = {
      deletedAt: null,
    };

    if (status) {
      filter.status = status;
    }

    if (crewName) {
      filter.crewName = crewName;
    }

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { crewName: { $regex: q, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      CrewRun.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      CrewRun.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      success: true,
      message: 'Background runs loaded successfully',
      data: {
        items: items.map(serializeRun),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getBackgroundRunById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Invalid background run id',
      });
    }

    const run = await CrewRun.findOne({
      _id: id,
      deletedAt: null,
    }).lean();

    if (!run) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'Background run not found',
      });
    }

    return res.json({
      ok: true,
      success: true,
      message: 'Background run loaded successfully',
      data: serializeRun(run),
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelBackgroundRunById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Invalid background run id',
      });
    }

    const result = await cancelCrewRun(id);

    return res.json({
      ok: true,
      success: true,
      message: result.message,
      data: serializeRun(result.run),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteBackgroundRunById(req, res, next) {
  try {
    const { id } = req.params;
    const hard = String(req.query.hard || '') === 'true';

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'Invalid background run id',
      });
    }

    const result = await deleteCrewRun(id, { hard });

    return res.json({
      ok: true,
      success: true,
      message: result.message,
      data: result.run ? serializeRun(result.run) : null,
    });
  } catch (error) {
    next(error);
  }
}