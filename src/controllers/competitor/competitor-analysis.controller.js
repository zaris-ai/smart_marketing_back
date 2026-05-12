import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import CompetitorAnalysis from '../../models/competitor-analysis.model.js';

export async function getLatestCompetitorAnalysis(req, res, next) {
  try {
    const latest = await CompetitorAnalysis.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      success: true,
      message: latest
        ? 'Latest competitor analysis fetched successfully'
        : 'No competitor analysis found',
      data: latest,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function runCompetitorAnalysis(req, res, next) {
  try {
    const run = await enqueueCrewRun({
      crewName: 'competitor_analysis',
      title: 'Arka Smart Analyzer Competitive Analysis',
      payload: {},
      meta: {
        appName: 'Arka: Smart Analyzer',
        appUrl: 'https://apps.shopify.com/arka-smart-analyzer',
        title: 'Arka Smart Analyzer Competitive Analysis',
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Competitor analysis started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.error('runCompetitorAnalysis enqueue error:', error);
    next(error);
  }
}