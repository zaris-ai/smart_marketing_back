import DashboardPage from '../../models/dashboard-page.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';


function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function generateDashboard(req, res, next) {
  try {
    const executedByName =
      req.user?.name || req.user?.email || req.user?.username || 'Unknown user';

    const run = await enqueueCrewRun({
      crewName: 'dashboard',
      title: 'Dashboard generation',
      payload: {},
      meta: {
        sourceFile: 'dashboard_file.md',
        executedByName,
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'Dashboard generation started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.log('generateDashboard enqueue error:', error);
    next(error);
  }
}

export async function getLatestDashboard(req, res, next) {
  try {
    const latest = await DashboardPage.findOne({ crew: 'dashboard' }).sort({
      createdAt: -1,
    });

    if (!latest) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: 'No saved dashboard found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      data: {
        id: latest._id,
        html: latest.html,
        createdAt: latest.createdAt,
      },
    });
  } catch (error) {
    console.log('getLatestDashboard error:', error);
    next(error);
  }
}

// export async function getLatestDashboard(req, res, next) {
//   try {
//     const latest = await DashboardPage.findOne({ crew: 'dashboard' }).sort({
//       createdAt: -1,
//     });

//     if (!latest) {
//       return res.status(404).json({
//         ok: false,
//         error: 'No saved dashboard found',
//       });
//     }

//     return res.status(200).json({
//       ok: true,
//       data: {
//         id: latest._id,
//         html: latest.html,
//         createdAt: latest.createdAt,
//       },
//     });
//   } catch (error) {
//     console.log('getLatestDashboard error:', error);
//     next(error);
//   }
// }