import 'dotenv/config';
import { Worker } from 'bullmq';

import { connectDb } from '../config/db.js';
import CrewRun from '../models/crewRun.model.js';
import { redisConnection } from '../queues/redisConnection.js';
import { finalizeCrewResult } from '../services/crewResultFinalizer.service.js';
import { runPythonCrew } from '../services/pythonRunner.service.js';

await connectDb();

const concurrency = Number(process.env.CREW_WORKER_CONCURRENCY || 1);

function getSavedRecordFromFinalized(finalized, fallbackCrewName = '') {
  const saved = finalized?.saved;

  if (!saved?._id) {
    return {
      model: null,
      id: null,
    };
  }

  return {
    model:
      saved.constructor?.modelName ||
      saved.collection?.collectionName ||
      fallbackCrewName ||
      null,
    id: saved._id,
  };
}

function isCancelled(run) {
  return run?.status === 'cancelled' || Boolean(run?.cancelRequestedAt);
}

const worker = new Worker(
  'crew-runs',
  async (job) => {
    const { runId } = job.data || {};

    if (!runId) {
      throw new Error('Missing runId in crew worker job data');
    }

    const run = await CrewRun.findById(runId);

    if (!run) {
      throw new Error(`CrewRun not found: ${runId}`);
    }

    if (isCancelled(run) || run.deletedAt) {
      run.status = 'cancelled';
      run.finishedAt = run.finishedAt || new Date();
      await run.save();

      return {
        success: false,
        cancelled: true,
        runId: String(run._id),
      };
    }

    run.status = 'running';
    run.startedAt = new Date();
    run.finishedAt = null;
    run.error = {
      message: '',
      stack: '',
    };

    await run.save();

    try {
      const result = await runPythonCrew({
        crewName: run.crewName,
        payload: run.payload || {},
      });

      const freshRun = await CrewRun.findById(runId);

      if (!freshRun) {
        throw new Error(`CrewRun disappeared after execution: ${runId}`);
      }

      if (isCancelled(freshRun) || freshRun.deletedAt) {
        freshRun.status = 'cancelled';
        freshRun.result = null;
        freshRun.error = {
          message: 'Run cancelled by user before finalization',
          stack: '',
        };
        freshRun.finishedAt = new Date();

        await freshRun.save();

        return {
          success: false,
          cancelled: true,
          runId: String(freshRun._id),
        };
      }

      let finalized = null;

      try {
        finalized = await finalizeCrewResult({
          run: freshRun,
          result,
        });
      } catch (finalizeError) {
        freshRun.status = 'failed';
        freshRun.result = result;
        freshRun.error = {
          message:
            finalizeError?.message ||
            'Crew finished but result finalization failed',
          stack: finalizeError?.stack || '',
        };
        freshRun.finishedAt = new Date();

        await freshRun.save();

        throw finalizeError;
      }

      const latestRun = await CrewRun.findById(runId);

      if (!latestRun) {
        throw new Error(`CrewRun disappeared after finalization: ${runId}`);
      }

      if (isCancelled(latestRun) || latestRun.deletedAt) {
        latestRun.status = 'cancelled';
        latestRun.result = null;
        latestRun.error = {
          message: 'Run cancelled by user after finalization',
          stack: '',
        };
        latestRun.finishedAt = new Date();

        await latestRun.save();

        return {
          success: false,
          cancelled: true,
          runId: String(latestRun._id),
        };
      }

      const savedRecord = getSavedRecordFromFinalized(
        finalized,
        latestRun.crewName
      );

      latestRun.status = 'success';
      latestRun.result = result;
      latestRun.savedRecord = savedRecord;

      latestRun.meta = {
        ...(latestRun.meta || {}),
        finalized: Boolean(finalized),
        finalizedAt: new Date(),
        savedRecordModel: savedRecord.model,
        savedRecordId: savedRecord.id,
        telegram: finalized?.telegram || null,
        telegramReport: finalized?.telegramReport || '',
      };

      latestRun.finishedAt = new Date();

      await latestRun.save();

      console.log('[crew-worker] finalized run', {
        runId: String(latestRun._id),
        crewName: latestRun.crewName,
        status: latestRun.status,
        savedRecord: {
          model: latestRun.savedRecord?.model || null,
          id: latestRun.savedRecord?.id
            ? String(latestRun.savedRecord.id)
            : null,
        },
      });

      return {
        success: true,
        runId: String(latestRun._id),
        crewName: latestRun.crewName,
        savedRecord: {
          model: latestRun.savedRecord?.model || null,
          id: latestRun.savedRecord?.id
            ? String(latestRun.savedRecord.id)
            : null,
        },
      };
    } catch (error) {
      const failedRun = await CrewRun.findById(runId);

      if (failedRun) {
        if (isCancelled(failedRun) || failedRun.deletedAt) {
          failedRun.status = 'cancelled';
          failedRun.error = {
            message: 'Run cancelled by user',
            stack: '',
          };
        } else {
          failedRun.status = 'failed';
          failedRun.error = {
            message: error?.message || 'Crew execution failed',
            stack: error?.stack || '',
          };
        }

        failedRun.finishedAt = new Date();

        await failedRun.save();
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency,
  }
);

worker.on('completed', (job, result) => {
  console.log(`[crew-worker] completed job ${job.id}`, result);
});

worker.on('failed', (job, error) => {
  console.error(`[crew-worker] failed job ${job?.id}:`, error);
});

process.on('SIGTERM', async () => {
  console.log('[crew-worker] SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[crew-worker] SIGINT received, closing worker...');
  await worker.close();
  process.exit(0);
});

console.log(`[crew-worker] started with concurrency=${concurrency}`);