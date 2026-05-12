import { Job, Queue } from 'bullmq';

import CrewRun from '../models/crewRun.model.js';
import { redisConnection } from '../queues/redisConnection.js';

export const crewQueue = new Queue('crew-runs', {
  connection: redisConnection,
});

export async function enqueueCrewRun({
  crewName,
  title = '',
  payload = {},
  meta = {},
  userId = null,
}) {
  const run = await CrewRun.create({
    crewName,
    title,
    payload,
    meta,
    createdBy: userId,
    status: 'queued',
  });

  const job = await crewQueue.add(
    'crew-run',
    {
      runId: run._id.toString(),
    },
    {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  run.jobId = String(job.id);
  await run.save();

  return run;
}

export async function cancelCrewRun(runId) {
  const run = await CrewRun.findById(runId);

  if (!run || run.deletedAt) {
    const error = new Error('Background run not found');
    error.statusCode = 404;
    throw error;
  }

  if (['success', 'failed', 'cancelled'].includes(run.status)) {
    return {
      run,
      changed: false,
      message: `Run is already ${run.status}`,
    };
  }

  if (run.jobId) {
    try {
      const job = await Job.fromId(crewQueue, run.jobId);

      if (job) {
        const state = await job.getState();

        if (['waiting', 'delayed', 'prioritized', 'paused'].includes(state)) {
          await job.remove();
        }
      }
    } catch (error) {
      console.error('[backgroundCrew] failed to remove queued job:', error);
    }
  }

  run.status = 'cancelled';
  run.cancelRequestedAt = new Date();
  run.finishedAt = run.finishedAt || new Date();
  run.error = {
    message: 'Run cancelled by user',
    stack: '',
  };

  await run.save();

  return {
    run,
    changed: true,
    message:
      run.status === 'cancelled'
        ? 'Background run cancelled'
        : 'Cancellation requested',
  };
}

export async function deleteCrewRun(runId, { hard = false } = {}) {
  const run = await CrewRun.findById(runId);

  if (!run) {
    const error = new Error('Background run not found');
    error.statusCode = 404;
    throw error;
  }

  if (run.status === 'running') {
    run.status = 'cancelled';
    run.cancelRequestedAt = new Date();
    run.deletedAt = new Date();
    run.error = {
      message: 'Run cancelled and deleted by user',
      stack: '',
    };

    await run.save();

    return {
      deleted: true,
      hard: false,
      run,
      message:
        'Running task was marked cancelled and hidden. The worker will ignore its result.',
    };
  }

  if (run.jobId) {
    try {
      const job = await Job.fromId(crewQueue, run.jobId);

      if (job) {
        const state = await job.getState();

        if (['waiting', 'delayed', 'prioritized', 'paused'].includes(state)) {
          await job.remove();
        }
      }
    } catch (error) {
      console.error('[backgroundCrew] failed to remove job while deleting:', error);
    }
  }

  if (hard) {
    await run.deleteOne();

    return {
      deleted: true,
      hard: true,
      run: null,
      message: 'Background run permanently deleted',
    };
  }

  run.deletedAt = new Date();
  await run.save();

  return {
    deleted: true,
    hard: false,
    run,
    message: 'Background run deleted',
  };
}