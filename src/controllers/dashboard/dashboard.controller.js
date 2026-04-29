import DashboardPage from '../../models/dashboard-page.model.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';

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
    console.log(req.user)
    const result = await runPythonCrew({
      crewName: 'dashboard',
      payload: {},
    });

    const rawContent = result?.result?.content || '';
    const parsed = safeParseJson(rawContent);

    const html = parsed?.html || '';
    const telegramReport = parsed?.telegram_report || '';

    if (!html) {
      return res.status(500).json({
        ok: false,
        error: 'Dashboard HTML was empty or crew output was invalid',
        debug: {
          hasRawContent: !!rawContent,
          parsed: !!parsed,
        },
      });
    }

    const saved = await DashboardPage.create({
      html,
      crew: 'dashboard',
      sourceFile: 'dashboard_file.md',
      executedBy: req.user?._id || null,
      executedByName: req.user?.name || req.user?.email || 'Unknown user',
      meta: {
        telegram_report: telegramReport,
        raw_crew_content: rawContent,
        tasks_output: result?.result?.tasks_output || [],
      },
    });

    let telegram = {
      ok: false,
      skipped: true,
      reason: 'Not attempted',
    };

    try {
      telegram = await publishCrewReport({
        crewName: saved.crew,
        executedBy: req.user || { name: saved.executedByName },
        createdAt: saved.createdAt,
        savedId: saved._id.toString(),
        sourceFile: saved.sourceFile,
        html: saved.html,
        telegramReport,
        tasksOutput: saved.meta?.tasks_output || [],
      });

      saved.telegram = {
        published: !telegram?.skipped && !!telegram?.ok,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: telegram?.messages?.map((m) => m.messageId) || [],
        publishedAt: telegram?.ok ? new Date() : null,
        reportHtml: telegram?.reportHtml || '',
        error: '',
      };

      await saved.save();
    } catch (telegramError) {
      saved.telegram = {
        published: false,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: [],
        publishedAt: null,
        reportHtml: '',
        error: telegramError.message || 'Telegram publish failed',
      };

      await saved.save();

      telegram = {
        ok: false,
        skipped: false,
        error: telegramError.message,
      };
    }

    return res.status(201).json({
      ok: true,
      message: 'Dashboard generated and saved successfully',
      data: {
        id: saved._id,
        html: saved.html,
        telegramReport,
        createdAt: saved.createdAt,
        executedByName: saved.executedByName,
        telegram,
      },
    });
  } catch (error) {
    console.log('generateDashboard error:', error);
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
        error: 'No saved dashboard found',
      });
    }

    return res.status(200).json({
      ok: true,
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