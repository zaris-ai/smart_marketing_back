import mongoose from 'mongoose';
import Joi from 'joi';

import Store from '../../models/store.model.js';
import StoreCrmActivity from '../../models/storeCrmActivity.model.js';
import StoreCrmAnalysis from '../../models/storeCrmAnalysis.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import {
  parsePagination,
  buildPaginationMeta,
} from '../../utils/pagination.js';

function validate(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return {
      error: error.details.map((item) => item.message).join(', '),
      value: null,
    };
  }

  return { error: null, value };
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

const activityTypes = [
  'note',
  'email_sent',
  'email_reply',
  'call',
  'meeting',
  'follow_up',
  'status_change',
];

const outcomes = [
  'none',
  'positive',
  'neutral',
  'negative',
  'no_response',
  'interested',
  'not_interested',
];

const listCrmActivitiesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().allow('').optional(),
  type: Joi.string().valid(...activityTypes).allow('').optional(),
  emailSent: Joi.boolean().optional(),
  outcome: Joi.string().valid(...outcomes).allow('').optional(),
});

const createCrmActivitySchema = Joi.object({
  type: Joi.string()
    .valid(...activityTypes)
    .default('note'),

  title: Joi.string().trim().allow('').default(''),
  body: Joi.string().trim().allow('').default(''),

  emailSent: Joi.boolean().default(false),
  emailTo: Joi.string().trim().email().allow('').default(''),
  emailSubject: Joi.string().trim().allow('').default(''),

  contactPerson: Joi.string().trim().allow('').default(''),

  outcome: Joi.string()
    .valid(...outcomes)
    .default('none'),

  nextFollowUpAt: Joi.date().allow(null, '').default(null),

  metadata: Joi.object().unknown(true).default({}),
}).custom((value, helpers) => {
  if (!value.title && !value.body && value.type === 'note') {
    return helpers.message('Note title or body is required');
  }

  return value;
});

const updateCrmActivitySchema = Joi.object({
  type: Joi.string().valid(...activityTypes),

  title: Joi.string().trim().allow(''),
  body: Joi.string().trim().allow(''),

  emailSent: Joi.boolean(),
  emailTo: Joi.string().trim().email().allow(''),
  emailSubject: Joi.string().trim().allow(''),

  contactPerson: Joi.string().trim().allow(''),

  outcome: Joi.string().valid(...outcomes),

  nextFollowUpAt: Joi.date().allow(null, ''),

  metadata: Joi.object().unknown(true),
}).min(1);

function buildCreateCrmPayload(value = {}) {
  const payload = {
    type: value.type || 'note',
    title: value.title || '',
    body: value.body || '',
    emailSent: Boolean(value.emailSent),
    emailTo: value.emailTo || '',
    emailSubject: value.emailSubject || '',
    contactPerson: value.contactPerson || '',
    outcome: value.outcome || 'none',
    nextFollowUpAt: value.nextFollowUpAt || null,
    metadata: value.metadata || {},
  };

  if (payload.type === 'email_sent') {
    payload.emailSent = true;
  }

  return payload;
}

function buildUpdateCrmPayload(value = {}) {
  const payload = {};

  if (value.type !== undefined) payload.type = value.type;
  if (value.title !== undefined) payload.title = value.title || '';
  if (value.body !== undefined) payload.body = value.body || '';

  if (value.emailSent !== undefined) {
    payload.emailSent = Boolean(value.emailSent);
  }

  if (value.emailTo !== undefined) {
    payload.emailTo = value.emailTo || '';
  }

  if (value.emailSubject !== undefined) {
    payload.emailSubject = value.emailSubject || '';
  }

  if (value.contactPerson !== undefined) {
    payload.contactPerson = value.contactPerson || '';
  }

  if (value.outcome !== undefined) {
    payload.outcome = value.outcome || 'none';
  }

  if (value.nextFollowUpAt !== undefined) {
    payload.nextFollowUpAt = value.nextFollowUpAt || null;
  }

  if (value.metadata !== undefined) {
    payload.metadata = value.metadata || {};
  }

  if (payload.type === 'email_sent') {
    payload.emailSent = true;
  }

  return payload;
}

async function buildCrmSummary(storeId) {
  const [lastActivity, lastEmailActivity, nextFollowUp, totalActivities] =
    await Promise.all([
      StoreCrmActivity.findOne({ store: storeId })
        .sort({ createdAt: -1 })
        .lean(),

      StoreCrmActivity.findOne({
        store: storeId,
        emailSent: true,
      })
        .sort({ createdAt: -1 })
        .lean(),

      StoreCrmActivity.findOne({
        store: storeId,
        nextFollowUpAt: { $gte: new Date() },
      })
        .sort({ nextFollowUpAt: 1 })
        .lean(),

      StoreCrmActivity.countDocuments({ store: storeId }),
    ]);

  return {
    totalActivities,
    hasEmailed: Boolean(lastEmailActivity),
    lastActivityAt: lastActivity?.createdAt || null,
    lastEmailAt: lastEmailActivity?.createdAt || null,
    nextFollowUpAt: nextFollowUp?.nextFollowUpAt || null,
  };
}

function buildStoreAnalysisPayload({ store, activities, summary }) {
  return {
    store: {
      id: String(store._id),
      name: store.name || store.title || '',
      domain: store.domain || store.website || store.url || '',
      email: store.email || '',
      phone: store.phone || '',
      country: store.country || '',
      city: store.city || '',
      platform: store.platform || '',
      category: store.category || '',
      description: store.description || '',
      raw: store,
    },
    crm_summary: summary,
    recent_activities: activities.map((activity) => ({
      id: String(activity._id),
      type: activity.type || '',
      title: activity.title || '',
      body: activity.body || '',
      emailSent: Boolean(activity.emailSent),
      emailTo: activity.emailTo || '',
      emailSubject: activity.emailSubject || '',
      contactPerson: activity.contactPerson || '',
      outcome: activity.outcome || 'none',
      nextFollowUpAt: activity.nextFollowUpAt || null,
      metadata: activity.metadata || {},
      createdAt: activity.createdAt || null,
      updatedAt: activity.updatedAt || null,
    })),
  };
}

export async function listStoreCrmActivities(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Invalid store id',
      });
    }

    const { error, value } = validate(listCrmActivitiesSchema, req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        success: false,
        error,
      });
    }

    const store = await Store.findById(storeId).lean();

    if (!store) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'Store not found',
      });
    }

    const { page, limit, skip } = parsePagination(value, {
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
    });

    const filter = {
      store: storeId,
    };

    if (value.type) {
      filter.type = value.type;
    }

    if (value.emailSent !== undefined) {
      filter.emailSent = value.emailSent;
    }

    if (value.outcome) {
      filter.outcome = value.outcome;
    }

    if (value.q) {
      filter.$or = [
        { title: { $regex: value.q, $options: 'i' } },
        { body: { $regex: value.q, $options: 'i' } },
        { emailTo: { $regex: value.q, $options: 'i' } },
        { emailSubject: { $regex: value.q, $options: 'i' } },
        { contactPerson: { $regex: value.q, $options: 'i' } },
      ];
    }

    const [activities, total, summary, latestAnalysis] = await Promise.all([
      StoreCrmActivity.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      StoreCrmActivity.countDocuments(filter),

      buildCrmSummary(storeId),

      StoreCrmAnalysis.findOne({
        store: storeId,
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return res.status(200).json({
      ok: true,
      success: true,
      data: {
        store,
        activities,
        summary,
        latestAnalysis: latestAnalysis || null,
        pagination: buildPaginationMeta({
          page,
          limit,
          total,
        }),
      },
    });
  } catch (error) {
    console.error('listStoreCrmActivities error:', error);

    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to load CRM activities',
    });
  }
}

export async function analyzeStoreCrmActivities(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Invalid store id',
      });
    }

    const store = await Store.findById(storeId).lean();

    if (!store) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'Store not found',
      });
    }

    const [activities, summary] = await Promise.all([
      StoreCrmActivity.find({
        store: storeId,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),

      buildCrmSummary(storeId),
    ]);

    const payload = buildStoreAnalysisPayload({
      store,
      activities,
      summary,
    });

    const storeName = normalizeString(store.name || store.title);
    const storeDomain = normalizeString(store.domain || store.website || store.url);

    const run = await enqueueCrewRun({
      crewName: 'store_crm_analysis',
      title: `CRM analysis: ${storeName || storeDomain || storeId}`,
      payload,
      meta: {
        storeId,
        storeName,
        storeDomain,
        activitiesCount: activities.length,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Store CRM analysis started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.error('analyzeStoreCrmActivities error:', error);

    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to start CRM analysis',
    });
  }
}

export async function createStoreCrmActivity(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Invalid store id',
      });
    }

    const store = await Store.findById(storeId).lean();

    if (!store) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'Store not found',
      });
    }

    const { error, value } = validate(createCrmActivitySchema, req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        success: false,
        error,
      });
    }

    const payload = buildCreateCrmPayload(value);

    const activity = await StoreCrmActivity.create({
      ...payload,
      store: storeId,
    });
    console.log(activity)
    return res.status(201).json({
      ok: true,
      success: true,
      message: 'CRM activity added successfully',
      data: {
        activity,
      },
    });
  } catch (error) {
    console.error('createStoreCrmActivity error:', error);

    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to create CRM activity',
    });
  }
}

export async function updateStoreCrmActivity(req, res) {
  try {
    const { storeId, activityId } = req.params;

    if (!isValidObjectId(storeId) || !isValidObjectId(activityId)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Invalid store or activity id',
      });
    }

    const { error, value } = validate(updateCrmActivitySchema, req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        success: false,
        error,
      });
    }

    const activity = await StoreCrmActivity.findOne({
      _id: activityId,
      store: storeId,
    });

    if (!activity) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'CRM activity not found',
      });
    }

    Object.assign(activity, buildUpdateCrmPayload(value));

    await activity.save();

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'CRM activity updated successfully',
      data: {
        activity,
      },
    });
  } catch (error) {
    console.error('updateStoreCrmActivity error:', error);

    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to update CRM activity',
    });
  }
}

export async function deleteStoreCrmActivity(req, res) {
  try {
    const { storeId, activityId } = req.params;

    if (!isValidObjectId(storeId) || !isValidObjectId(activityId)) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Invalid store or activity id',
      });
    }

    const activity = await StoreCrmActivity.findOne({
      _id: activityId,
      store: storeId,
    });

    if (!activity) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'CRM activity not found',
      });
    }

    await activity.deleteOne();

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'CRM activity deleted successfully',
    });
  } catch (error) {
    console.error('deleteStoreCrmActivity error:', error);

    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message || 'Failed to delete CRM activity',
    });
  }
}