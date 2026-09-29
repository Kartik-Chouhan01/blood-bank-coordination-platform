import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runExpirySweep } from './expirySweep.js';
import { runRequestExpirySweep } from './requestExpirySweep.js';

interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

const timers: NodeJS.Timeout[] = [];

/**
 * Minimal in-process scheduler. Each job never overlaps with itself; failures are logged and the
 * job simply runs again at the next tick. Jobs are idempotent, so running several API instances
 * is safe (a dedicated worker/queue can replace this when the platform grows).
 */
export function startJobs() {
  if (!env.JOBS_ENABLED) return;

  const jobs: Job[] = [
    {
      name: 'expiry-sweep',
      intervalMs: env.EXPIRY_SWEEP_INTERVAL_MINUTES * 60_000,
      run: () => runExpirySweep(),
    },
    {
      name: 'request-expiry-sweep',
      intervalMs: env.EXPIRY_SWEEP_INTERVAL_MINUTES * 60_000,
      run: () => runRequestExpirySweep(),
    },
  ];

  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        logger.error({ err, job: job.name }, 'Scheduled job failed');
      } finally {
        running = false;
      }
    };
    void tick(); // Catch up immediately after a restart.
    const timer = setInterval(() => void tick(), job.intervalMs);
    timer.unref();
    timers.push(timer);
  }
  logger.info({ jobs: jobs.map((j) => j.name) }, 'Background jobs started');
}

export function stopJobs() {
  for (const timer of timers.splice(0)) clearInterval(timer);
}
