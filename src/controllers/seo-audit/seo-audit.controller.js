import SeoAudit from '../../models/seo-audit.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';

const WEBSITE_URL = 'https://web.arkaanalyzer.com/';
const REPORT_TITLE = 'Arka Analyzer SEO Audit';

export async function getLatestSeoAudit(req, res, next) {
  try {
    const latest = await SeoAudit.findOne({ status: 'success' })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      ok: true,
      success: true,
      message: latest
        ? 'Latest SEO audit fetched successfully'
        : 'No SEO audit found',
      data: latest,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function runSeoAudit(req, res, next) {
  try {
    const run = await enqueueCrewRun({
      crewName: 'seo_audit',
      title: REPORT_TITLE,
      payload: {
        website_url: WEBSITE_URL,
        title: REPORT_TITLE,
      },
      meta: {
        title: REPORT_TITLE,
        websiteUrl: WEBSITE_URL,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'SEO audit started in background',
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