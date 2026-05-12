import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import { requireFields } from './crew.validators.js';

function cleanString(value = '') {
  return String(value || '').trim();
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

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Research started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.log('createResearch enqueue error:', error);
    next(error);
  }
}