import prisma from '../../core/database/prisma.singleton.js';

class QueueService {
  constructor() {
    this.isWorking = false;
    this.intervalId = null;
    this.handlers = new Map();
  }

  registerHandler(queueName, handler) {
    this.handlers.set(queueName, handler);
  }

  async addJob(queueName, payload, runAt = new Date(), maxAttempts = 3) {
    try {
      const job = await prisma.jobQueue.create({
        data: {
          queueName,
          payload: JSON.stringify(payload),
          runAt,
          maxAttempts,
        },
      });
      return job.id;
    } catch (err) {
      console.error(`Failed to add job to queue ${queueName}:`, err);
      return null;
    }
  }

  start(pollIntervalMs = 5000) {
    if (this.intervalId) return;

    this.isWorking = true;
    console.log('Custom PostgreSQL Queue Worker started...');

    const processNextJob = async () => {
      if (!this.isWorking) return;
      let activeJob = null;

      try {
        const jobs = await prisma.$queryRaw`
          UPDATE "JobQueue"
          SET status = 'PROCESSING', "lockedAt" = NOW(), attempts = attempts + 1
          WHERE id = (
            SELECT id FROM "JobQueue"
            WHERE status = 'PENDING' AND "runAt" <= NOW()
            ORDER BY "runAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING *;
        `;

        if (!jobs || jobs.length === 0) {
          if (this.isWorking) {
            this.intervalId = setTimeout(processNextJob, pollIntervalMs);
          }
          return;
        }

        activeJob = jobs[0];
        console.log(`[Queue Worker] Processing job ${activeJob.id} for queue: ${activeJob.queueName}`);

        const handler = this.handlers.get(activeJob.queueName);
        if (!handler) {
          throw new Error(`No handler registered for queue: ${activeJob.queueName}`);
        }

        const parsedPayload = JSON.parse(activeJob.payload);
        await handler(parsedPayload);

        await prisma.jobQueue.update({
          where: { id: activeJob.id },
          data: {
            status: 'COMPLETED',
            lockedAt: null,
          },
        });
        console.log(`[Queue Worker] Job ${activeJob.id} completed successfully`);

      } catch (err) {
        console.error(`[Queue Worker] Error processing job:`, err);

        if (activeJob) {
          const isFailedPermanently = activeJob.attempts >= activeJob.maxAttempts;
          await prisma.jobQueue.update({
            where: { id: activeJob.id },
            data: {
              status: isFailedPermanently ? 'FAILED' : 'PENDING',
              error: err.message || JSON.stringify(err),
              lockedAt: null,
              runAt: isFailedPermanently
                ? activeJob.runAt
                : new Date(Date.now() + activeJob.attempts * 60 * 1000), // linear retry backoff
            },
          }).catch((e) => console.error('Failed to update errored job status:', e));
        }
      }

      if (this.isWorking) {
        this.intervalId = setTimeout(processNextJob, 200);
      }
    };

    this.intervalId = setTimeout(processNextJob, pollIntervalMs);
  }

  stop() {
    this.isWorking = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    console.log('Custom PostgreSQL Queue Worker stopped.');
  }
}

const queueService = new QueueService();
export default queueService;
