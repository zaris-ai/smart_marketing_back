import asyncHandler from '../../utils/asyncHandler.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import InstagramStoryIdeaRun from '../../models/instagram-story-idea.model.js';
import { requireFields } from './instagram-agent.validators.js';

const FIXED_APP_CONTEXT = {
  brand_name: 'Arka Smart Analyzer',
  product_or_service:
    'Arka Smart Analyzer is a Shopify analytics app that helps merchants analyze products, pricing, inventory, and store performance to find hidden business problems and improve decisions.',
  app_website_url: 'https://web.arkaanalyzer.com/',
  shopify_app_store_url: 'https://apps.shopify.com/arka-smart-analyzer',
};

function normalizeString(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePayload(body = {}) {
  return {
    ...FIXED_APP_CONTEXT,

    target_audience: normalizeString(body.target_audience),
    campaign_goal: normalizeString(body.campaign_goal),

    campaign_name: normalizeString(
      body.campaign_name,
      'Instagram Story Campaign'
    ),

    brand_voice: normalizeString(
      body.brand_voice,
      'direct, expert, practical, conversion-focused'
    ),

    offer: normalizeString(
      body.offer,
      'Install Arka Smart Analyzer from the Shopify App Store'
    ),

    key_message: normalizeString(
      body.key_message,
      'Your Shopify store data already shows what needs fixing. Arka helps you find it faster.'
    ),

    visual_style: normalizeString(
      body.visual_style,
      'clean SaaS dashboard visuals, Shopify store analytics, fast cuts, premium tech style, vertical mobile video'
    ),

    language: normalizeString(body.language, 'English'),

    number_of_ideas: normalizeNumber(body.number_of_ideas, 5),
    story_length_seconds: normalizeNumber(body.story_length_seconds, 15),

    notes: normalizeString(body.notes),
  };
}

function validatePayload(payload) {
  if (!payload.target_audience) {
    const error = new Error('target_audience is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!payload.campaign_goal) {
    const error = new Error('campaign_goal is required.');
    error.statusCode = 400;
    throw error;
  }

  if (payload.number_of_ideas < 1 || payload.number_of_ideas > 10) {
    const error = new Error('number_of_ideas must be between 1 and 10.');
    error.statusCode = 400;
    throw error;
  }

  if (payload.story_length_seconds < 5 || payload.story_length_seconds > 60) {
    const error = new Error('story_length_seconds must be between 5 and 60.');
    error.statusCode = 400;
    throw error;
  }
}

function serializeRun(run) {
  return {
    _id: String(run._id),
    crewName: run.crewName,
    title: run.title || '',
    status: run.status,
    payload: run.payload || {},
    meta: run.meta || {},
    savedRecord: run.savedRecord || {
      model: null,
      id: null,
    },
    jobId: run.jobId || null,
    createdAt: run.createdAt,
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
    error: run.error || {
      message: '',
      stack: '',
    },
  };
}

export const createInstagramStoryIdeas = asyncHandler(async (req, res) => {
  requireFields(req.body, ['target_audience', 'campaign_goal']);

  const payload = normalizePayload(req.body);
  validatePayload(payload);

  const run = await enqueueCrewRun({
    crewName: 'instagram_story_idea',
    title: `Instagram Story Ideas: ${payload.campaign_name}`,
    payload,
    meta: {
      source: 'instagram-agent.controller',
      expectedSavedModel: 'InstagramStoryIdeaRun',
      campaignName: payload.campaign_name,
      brandName: payload.brand_name,
      appWebsiteUrl: payload.app_website_url,
      shopifyAppStoreUrl: payload.shopify_app_store_url,
      executedByName: req.user?.name || req.user?.email || 'Unknown user',
    },
    userId: req.user?._id || null,
  });

  return res.status(202).json({
    ok: true,
    success: true,
    message: 'Instagram story idea generation started in background.',
    data: {
      run: serializeRun(run),
      runId: String(run._id),
      status: run.status,
      crewName: run.crewName,
    },
  });
});

export const getInstagramStoryIdeaRuns = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    InstagramStoryIdeaRun.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InstagramStoryIdeaRun.countDocuments({}),
  ]);

  return res.status(200).json({
    ok: true,
    success: true,
    message: 'Instagram story idea runs fetched successfully.',
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    },
  });
});

export const getInstagramStoryIdeaRunById = asyncHandler(async (req, res) => {
  const run = await InstagramStoryIdeaRun.findById(req.params.id).lean();

  if (!run) {
    const error = new Error('Instagram story idea run not found.');
    error.statusCode = 404;
    throw error;
  }

  return res.status(200).json({
    ok: true,
    success: true,
    message: 'Instagram story idea run fetched successfully.',
    data: run,
  });
});

export const deleteInstagramStoryIdeaRun = asyncHandler(async (req, res) => {
  const deletedRun = await InstagramStoryIdeaRun.findByIdAndDelete(
    req.params.id
  );

  if (!deletedRun) {
    const error = new Error('Instagram story idea run not found.');
    error.statusCode = 404;
    throw error;
  }

  return res.status(200).json({
    ok: true,
    success: true,
    message: 'Instagram story idea run deleted successfully.',
    data: {
      _id: String(deletedRun._id),
    },
  });
});