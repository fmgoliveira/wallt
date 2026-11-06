import { Cron } from "croner";
import type { Db } from "./database";
import { uuidv7 } from "./ids";
import type { Logger } from "./logger";

export type Job = {
  name: string;
  /** cron expression, evaluated in the server's TZ */
  schedule: string;
  /** may return counts to store in job_runs.counts */
  run: () => Promise<Record<string, number> | undefined>;
};

/** Job scaffold: schedules jobs with croner and records every run in `job_runs`. No jobs yet. */
export function createScheduler(db: Db, log: Logger) {
  const jobs = new Map<string, { job: Job; cron: Cron }>();

  async function execute(job: Job): Promise<void> {
    const id = uuidv7();
    db.prepare(
      "INSERT INTO job_runs (id, job, started_at, status) VALUES (?, ?, ?, 'running')",
    ).run(id, job.name, new Date().toISOString());
    try {
      const counts = await job.run();
      db.prepare(
        "UPDATE job_runs SET finished_at = ?, status = 'success', counts = ? WHERE id = ?",
      ).run(new Date().toISOString(), counts ? JSON.stringify(counts) : null, id);
    } catch (err) {
      log.error({ err, job: job.name }, "job failed");
      db.prepare(
        "UPDATE job_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?",
      ).run(new Date().toISOString(), err instanceof Error ? err.message : String(err), id);
    }
  }

  return {
    register(job: Job): void {
      if (jobs.has(job.name)) throw new Error(`Job already registered: ${job.name}`);
      jobs.set(job.name, {
        job,
        cron: new Cron(job.schedule, { protect: true, name: job.name }, () => execute(job)),
      });
    },
    /** Runs a job immediately (manual trigger / tests). */
    async runNow(name: string): Promise<void> {
      const entry = jobs.get(name);
      if (!entry) throw new Error(`Unknown job: ${name}`);
      await execute(entry.job);
    },
    stop(): void {
      for (const { cron } of jobs.values()) cron.stop();
    },
  };
}
