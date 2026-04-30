import mongoose from 'mongoose';
import Joi from 'joi';
import Store from '../../models/store.model.js';

import StoreCrmActivity from '../../models/storeCrmActivity.model.js';
import StoreCrmAnalysis from '../../models/storeCrmAnalysis.model.js';

import {
  parsePagination,
  buildPaginationMeta,
} from '../../utils/pagination.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';

const CRM_ANALYSIS_CREW_NAME = 'store_crm_analysis';
const CRM_ANALYSIS_TITLE = 'Store CRM Analysis';

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

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatList(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<li>None recorded.</li>';
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function normalizeCrewText(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonFromText(text) {
  const cleaned = normalizeCrewText(text);

  if (!cleaned) {
    throw new Error('Crew returned empty output');
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Crew output does not contain valid JSON');
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function extractCrewAnalysis(rawResult) {
  const possibleContent =
    rawResult?.result?.content ||
    rawResult?.result?.raw ||
    rawResult?.result ||
    rawResult?.content ||
    rawResult?.raw ||
    rawResult;

  if (!possibleContent) {
    throw new Error('Crew did not return any result');
  }

  if (
    typeof possibleContent === 'object' &&
    possibleContent.crmStatus &&
    possibleContent.recommendation
  ) {
    return possibleContent;
  }

  if (typeof possibleContent === 'object') {
    return possibleContent;
  }

  return extractJsonFromText(String(possibleContent));
}

function buildStoreCrmAnalysisHtml({ store, analysis }) {
  const crmStatus = analysis?.crmStatus || {};
  const score = analysis?.score || {};
  const summary = analysis?.summary || {};
  const recommendation = analysis?.recommendation || {};
  const outreach = analysis?.outreach || {};
  const crmUpdates = analysis?.crmUpdates || {};

  return `
    <article>
      <h1>${escapeHtml(CRM_ANALYSIS_TITLE)}</h1>

      <h2>Store</h2>
      <p><strong>Name:</strong> ${escapeHtml(store?.name || '')}</p>
      <p><strong>Domain:</strong> ${escapeHtml(store?.domain || '')}</p>
      <p><strong>Country:</strong> ${escapeHtml(store?.country || '-')}</p>

      <h2>CRM Status</h2>
      <p><strong>Stage:</strong> ${escapeHtml(crmStatus.stage || 'unknown')}</p>
      <p><strong>Has emailed:</strong> ${
        crmStatus.hasEmailed ? 'Yes' : 'No'
      }</p>
      <p><strong>Last activity:</strong> ${escapeHtml(
        crmStatus.lastActivityAt || '-'
      )}</p>
      <p><strong>Last email:</strong> ${escapeHtml(
        crmStatus.lastEmailAt || '-'
      )}</p>
      <p><strong>Next follow-up:</strong> ${escapeHtml(
        crmStatus.nextFollowUpAt || '-'
      )}</p>
      <p><strong>Data quality:</strong> ${escapeHtml(
        crmStatus.dataQuality || '-'
      )}</p>

      <h2>Score</h2>
      <p><strong>Priority:</strong> ${escapeHtml(score.priority ?? '-')}</p>
      <p><strong>Confidence:</strong> ${escapeHtml(score.confidence ?? '-')}</p>
      <p>${escapeHtml(score.reason || '')}</p>

      <h2>Executive Summary</h2>
      <p>${escapeHtml(summary.executiveSummary || '')}</p>

      <h3>What Happened</h3>
      <ul>${formatList(summary.whatHappened)}</ul>

      <h3>Important Signals</h3>
      <ul>${formatList(summary.importantSignals)}</ul>

      <h3>Missing Information</h3>
      <ul>${formatList(summary.missingInformation)}</ul>

      <h3>Risks</h3>
      <ul>${formatList(summary.risks)}</ul>

      <h2>Recommendation</h2>
      <p><strong>Next action:</strong> ${escapeHtml(
        recommendation.nextAction || '-'
      )}</p>
      <p><strong>Channel:</strong> ${escapeHtml(
        recommendation.recommendedChannel || '-'
      )}</p>
      <p><strong>Timing:</strong> ${escapeHtml(
        recommendation.recommendedTiming || '-'
      )}</p>
      <p>${escapeHtml(recommendation.reason || '')}</p>

      <h2>Outreach Suggestion</h2>
      <p><strong>Subject:</strong> ${escapeHtml(outreach.subject || '')}</p>
      <p><strong>Angle:</strong> ${escapeHtml(outreach.angle || '')}</p>
      <p>${escapeHtml(outreach.body || '')}</p>

      <h2>Suggested CRM Update</h2>
      <p><strong>Suggested outcome:</strong> ${escapeHtml(
        crmUpdates.suggestedOutcome || '-'
      )}</p>
      <p><strong>Suggested tags:</strong> ${escapeHtml(
        Array.isArray(crmUpdates.suggestedTags)
          ? crmUpdates.suggestedTags.join(', ')
          : ''
      )}</p>
      <p>${escapeHtml(crmUpdates.suggestedNote || '')}</p>
    </article>
  `.trim();
}

function buildStoreCrmTelegramReport(doc) {
  const analysis = doc.analysis || {};
  const crmStatus = analysis.crmStatus || {};
  const score = analysis.score || {};
  const recommendation = analysis.recommendation || {};
  const outreach = analysis.outreach || {};

  return [
    `CRM Analysis: ${doc.storeName || 'Store'}`,
    `Domain: ${doc.storeDomain || '-'}`,
    '',
    `Stage: ${crmStatus.stage || 'unknown'}`,
    `Has emailed: ${crmStatus.hasEmailed ? 'Yes' : 'No'}`,
    `Priority: ${score.priority ?? '-'}/100`,
    `Confidence: ${score.confidence ?? '-'}/100`,
    '',
    'Recommendation',
    `Next action: ${recommendation.nextAction || '-'}`,
    `Channel: ${recommendation.recommendedChannel || '-'}`,
    `Timing: ${recommendation.recommendedTiming || '-'}`,
    '',
    'Outreach',
    `Subject: ${outreach.subject || '-'}`,
    `Angle: ${outreach.angle || '-'}`,
    '',
    'Summary',
    analysis?.summary?.executiveSummary || 'CRM analysis generated successfully.',
  ].join('\n');
}

const listCrmActivitiesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().allow('').optional(),
  type: Joi.string()
    .valid(
      'note',
      'email_sent',
      'email_reply',
      'call',
      'meeting',
      'follow_up',
      'status_change'
    )
    .allow('')
    .optional(),
  emailSent: Joi.boolean().optional(),
});

const createCrmActivitySchema = Joi.object({
  type: Joi.string()
    .valid(
      'note',
      'email_sent',
      'email_reply',
      'call',
      'meeting',
      'follow_up',
      'status_change'
    )
    .default('note'),

  title: Joi.string().trim().allow('').default(''),
  body: Joi.string().trim().allow('').default(''),

  emailSent: Joi.boolean().default(false),
  emailTo: Joi.string().trim().email().allow('').default(''),
  emailSubject: Joi.string().trim().allow('').default(''),

  contactPerson: Joi.string().trim().allow('').default(''),

  outcome: Joi.string()
    .valid(
      'none',
      'positive',
      'neutral',
      'negative',
      'no_response',
      'interested',
      'not_interested'
    )
    .default('none'),

  nextFollowUpAt: Joi.date().allow(null, '').default(null),
}).custom((value, helpers) => {
  if (!value.title && !value.body && value.type === 'note') {
    return helpers.message('Note title or body is required');
  }

  return value;
});

const updateCrmActivitySchema = Joi.object({
  type: Joi.string().valid(
    'note',
    'email_sent',
    'email_reply',
    'call',
    'meeting',
    'follow_up',
    'status_change'
  ),

  title: Joi.string().trim().allow(''),
  body: Joi.string().trim().allow(''),

  emailSent: Joi.boolean(),
  emailTo: Joi.string().trim().email().allow(''),
  emailSubject: Joi.string().trim().allow(''),

  contactPerson: Joi.string().trim().allow(''),

  outcome: Joi.string().valid(
    'none',
    'positive',
    'neutral',
    'negative',
    'no_response',
    'interested',
    'not_interested'
  ),

  nextFollowUpAt: Joi.date().allow(null, ''),
}).min(1);

const listCrmAnalysesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid('success', 'failed').allow('').optional(),
});

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
  if (value.emailSent !== undefined) payload.emailSent = Boolean(value.emailSent);
  if (value.emailTo !== undefined) payload.emailTo = value.emailTo || '';
  if (value.emailSubject !== undefined) payload.emailSubject = value.emailSubject || '';
  if (value.contactPerson !== undefined) payload.contactPerson = value.contactPerson || '';
  if (value.outcome !== undefined) payload.outcome = value.outcome || 'none';

  if (value.nextFollowUpAt !== undefined) {
    payload.nextFollowUpAt = value.nextFollowUpAt || null;
  }

  if (payload.type === 'email_sent') {
    payload.emailSent = true;
  }

  return payload;
}

async function buildCrmSummary(storeId) {
  const [lastActivity, lastEmailActivity, nextFollowUp, totalActivities] =
    await Promise.all([
      StoreCrmActivity.findOne({ store: storeId }).sort({ createdAt: -1 }).lean(),

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

export async function listStoreCrmActivities(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const { error, value } = validate(listCrmActivitiesSchema, req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        error,
      });
    }

    const store = await Store.findById(storeId).lean();

    if (!store) {
      return res.status(404).json({
        ok: false,
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
        status: 'success',
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return res.status(200).json({
      ok: true,
      data: {
        store,
        activities,
        summary,
        latestAnalysis,
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
      error: error.message || 'Failed to load CRM activities',
    });
  }
}

export async function createStoreCrmActivity(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const store = await Store.findById(storeId);

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
      });
    }

    const { error, value } = validate(createCrmActivitySchema, req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        error,
      });
    }

    const payload = buildCreateCrmPayload(value);

    const activity = await StoreCrmActivity.create({
      ...payload,
      store: storeId,
    });

    return res.status(201).json({
      ok: true,
      message: 'CRM activity added successfully',
      data: {
        activity,
      },
    });
  } catch (error) {
    console.error('createStoreCrmActivity error:', error);

    return res.status(500).json({
      ok: false,
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
        error: 'Invalid store or activity id',
      });
    }

    const { error, value } = validate(updateCrmActivitySchema, req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
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
        error: 'CRM activity not found',
      });
    }

    Object.assign(activity, buildUpdateCrmPayload(value));

    await activity.save();

    return res.status(200).json({
      ok: true,
      message: 'CRM activity updated successfully',
      data: {
        activity,
      },
    });
  } catch (error) {
    console.error('updateStoreCrmActivity error:', error);

    return res.status(500).json({
      ok: false,
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
        error: 'CRM activity not found',
      });
    }

    await activity.deleteOne();

    return res.status(200).json({
      ok: true,
      message: 'CRM activity deleted successfully',
    });
  } catch (error) {
    console.error('deleteStoreCrmActivity error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to delete CRM activity',
    });
  }
}

export async function getLatestStoreCrmAnalysis(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const latest = await StoreCrmAnalysis.findOne({
      store: storeId,
      status: 'success',
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      message: latest
        ? 'Latest CRM analysis fetched successfully'
        : 'No CRM analysis found',
      data: latest,
    });
  } catch (error) {
    console.error('getLatestStoreCrmAnalysis error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch latest CRM analysis',
    });
  }
}

export async function listStoreCrmAnalyses(req, res) {
  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const { error, value } = validate(listCrmAnalysesSchema, req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        error,
      });
    }

    const { page, limit, skip } = parsePagination(value, {
      defaultPage: 1,
      defaultLimit: 10,
      maxLimit: 100,
    });

    const filter = {
      store: storeId,
    };

    if (value.status) {
      filter.status = value.status;
    }

    const [items, total] = await Promise.all([
      StoreCrmAnalysis.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      StoreCrmAnalysis.countDocuments(filter),
    ]);

    return res.status(200).json({
      ok: true,
      data: {
        analyses: items,
        pagination: buildPaginationMeta({
          page,
          limit,
          total,
        }),
      },
    });
  } catch (error) {
    console.error('listStoreCrmAnalyses error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch CRM analyses',
    });
  }
}

export async function analyzeStoreCrm(req, res) {
  let failedDoc = null;

  try {
    const { storeId } = req.params;

    if (!isValidObjectId(storeId)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const store = await Store.findById(storeId).lean();

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
      });
    }

    const [activities, summary] = await Promise.all([
      StoreCrmActivity.find({
        store: storeId,
      })
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),

      buildCrmSummary(storeId),
    ]);

    const rawResult = await runPythonCrew({
      crewName: CRM_ANALYSIS_CREW_NAME,
      payload: {
        store,
        summary,
        activities,
      },
    });

    const analysis = extractCrewAnalysis(rawResult);
    const html = buildStoreCrmAnalysisHtml({ store, analysis });

    const doc = await StoreCrmAnalysis.create({
      store: storeId,
      storeName: store.name || '',
      storeDomain: store.domain || '',
      title: `${CRM_ANALYSIS_TITLE}: ${store.name || store.domain || storeId}`,
      crewName: CRM_ANALYSIS_CREW_NAME,
      analysis,
      html,
      rawResult,
      status: 'success',
      generatedAt: new Date(),
    });

    try {
      const telegramReport = buildStoreCrmTelegramReport(doc);

      const telegram = await publishCrewReport({
        crewName: CRM_ANALYSIS_CREW_NAME,
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: 'store_crm_analysis',
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
      console.error('store CRM telegram publish failed:', telegramError);

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
      message: 'Store CRM analysis generated and saved successfully',
      data: doc,
    });
  } catch (error) {
    console.error('analyzeStoreCrm error:', error);

    try {
      const { storeId } = req.params;

      if (isValidObjectId(storeId)) {
        const store = await Store.findById(storeId).lean();

        failedDoc = await StoreCrmAnalysis.create({
          store: storeId,
          storeName: store?.name || '',
          storeDomain: store?.domain || '',
          title: `${CRM_ANALYSIS_TITLE}: ${store?.name || store?.domain || storeId}`,
          crewName: CRM_ANALYSIS_CREW_NAME,
          analysis: {},
          html: '',
          rawResult: null,
          status: 'failed',
          error: error.message || 'Unknown error',
          generatedAt: new Date(),
        });
      }
    } catch (saveError) {
      console.error('Failed to save failed CRM analysis:', saveError);
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to analyze store CRM',
      data: failedDoc,
    });
  }
}