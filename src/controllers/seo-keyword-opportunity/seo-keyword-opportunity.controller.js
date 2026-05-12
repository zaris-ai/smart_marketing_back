import SeoKeywordOpportunity from '../../models/seo-keyword-opportunity.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import {
  requireFields,
  validateWebsiteUrl,
} from './crew.validators.js';

export async function createSeoKeywordOpportunity(req, res, next) {
  try {
    requireFields(req.body, ['website_url']);

    const payload = {
      website_url: validateWebsiteUrl(req.body.website_url),
      brand_name: req.body.brand_name || '',
      tone: req.body.tone || 'professional and analytical',
      max_keywords: Number(req.body.max_keywords || 12),
    };

    const run = await enqueueCrewRun({
      crewName: 'seo_keyword_opportunity',
      title: `SEO Keyword Opportunity: ${payload.website_url}`,
      payload,
      meta: {
        websiteUrl: payload.website_url,
        brandName: payload.brand_name,
        tone: payload.tone,
        maxKeywords: payload.max_keywords,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'SEO keyword opportunity report started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
}

export async function getLatestSeoKeywordOpportunity(req, res, next) {
  try {
    const doc = await SeoKeywordOpportunity.findOne({
      crewName: 'seo_keyword_opportunity',
      status: 'success',
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      success: true,
      message: doc
        ? 'Latest SEO keyword opportunity report fetched successfully'
        : 'No SEO keyword opportunity report found',
      data: doc,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
}