import asyncHandler from '../../utils/asyncHandler.js';
import InstagramPostIdeaRun from '../../models/instagram-post-idea.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import { requireFields } from './instagram-post-agent.validators.js';

const FIXED_APP_CONTEXT = {
  brand_name: 'Arka Smart Analyzer',
  product_or_service:
    'Arka Smart Analyzer is a Shopify analytics app that helps merchants analyze products, pricing, inventory, and store performance to find hidden business problems and improve decisions.',
  app_website_url: 'https://web.arkaanalyzer.com/',
  shopify_app_store_url: 'https://apps.shopify.com/arka-smart-analyzer',
};

function normalizePayload(body) {
  return {
    ...FIXED_APP_CONTEXT,

    target_audience: String(body.target_audience || '').trim(),
    campaign_goal: String(body.campaign_goal || '').trim(),

    campaign_name: body.campaign_name
      ? String(body.campaign_name).trim()
      : 'Instagram Post Campaign',

    brand_voice: body.brand_voice
      ? String(body.brand_voice).trim()
      : 'direct, expert, practical, conversion-focused',

    offer: body.offer
      ? String(body.offer).trim()
      : 'Install Arka Smart Analyzer from the Shopify App Store',

    key_message: body.key_message
      ? String(body.key_message).trim()
      : 'Your Shopify store data already shows what needs fixing. Arka helps you find it faster.',

    visual_style: body.visual_style
      ? String(body.visual_style).trim()
      : 'clean SaaS dashboard visuals, Shopify store analytics, premium tech style, high-readability feed design',

    language: body.language ? String(body.language).trim() : 'English',

    number_of_ideas: Number(body.number_of_ideas || 5),

    post_format: body.post_format
      ? String(body.post_format).trim()
      : 'carousel',

    notes: body.notes ? String(body.notes).trim() : '',
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

  if (!Number.isFinite(payload.number_of_ideas)) {
    const error = new Error('number_of_ideas must be a valid number.');
    error.statusCode = 400;
    throw error;
  }

  if (payload.number_of_ideas < 1 || payload.number_of_ideas > 10) {
    const error = new Error('number_of_ideas must be between 1 and 10.');
    error.statusCode = 400;
    throw error;
  }

  const allowedFormats = ['carousel', 'single_image', 'reel_cover'];

  if (!allowedFormats.includes(payload.post_format)) {
    const error = new Error(
      `post_format must be one of: ${allowedFormats.join(', ')}.`
    );
    error.statusCode = 400;
    throw error;
  }
}

export const createInstagramPostIdeas = asyncHandler(async (req, res) => {
  requireFields(req.body, ['target_audience', 'campaign_goal']);

  const payload = normalizePayload(req.body);
  validatePayload(payload);

  const run = await enqueueCrewRun({
    crewName: 'instagram_post_idea',
    title: `Instagram Post Ideas: ${payload.campaign_name}`,
    payload,
    meta: {
      campaignName: payload.campaign_name,
      appName: payload.brand_name,
      executedByName: req.user?.name || req.user?.email || 'Unknown user',
    },
    userId: req.user?._id || null,
  });

  return res.status(202).json({
    ok: true,
    success: true,
    message: 'Instagram post idea generation started in background.',
    data: {
      run,
    },
  });
});

export const getInstagramPostIdeaRuns = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    InstagramPostIdeaRun.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InstagramPostIdeaRun.countDocuments({}),
  ]);

  res.json({
    ok: true,
    success: true,
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

export const getInstagramPostIdeaRunById = asyncHandler(async (req, res) => {
  const run = await InstagramPostIdeaRun.findById(req.params.id).lean();

  if (!run) {
    const error = new Error('Instagram post idea run not found.');
    error.statusCode = 404;
    throw error;
  }

  res.json({
    ok: true,
    success: true,
    data: run,
  });
});

export const deleteInstagramPostIdeaRun = asyncHandler(async (req, res) => {
  const deletedRun = await InstagramPostIdeaRun.findByIdAndDelete(req.params.id);

  if (!deletedRun) {
    const error = new Error('Instagram post idea run not found.');
    error.statusCode = 404;
    throw error;
  }

  res.json({
    ok: true,
    success: true,
    message: 'Instagram post idea run deleted successfully.',
  });
});