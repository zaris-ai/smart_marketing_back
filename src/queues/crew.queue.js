import { Queue } from 'bullmq';
import { redisConnection } from './redisConnection.js';

export const crewQueue = new Queue('crew-runs', {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: {
            age: 60 * 60 * 24 * 7,
            count: 1000,
        },
        removeOnFail: {
            age: 60 * 60 * 24 * 14,
            count: 1000,
        },
        attempts: 1,
    },
});