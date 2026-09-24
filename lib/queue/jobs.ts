import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { jobs, type Job } from "@/db/schema";
import { generateId } from "@/lib/security/crypto";
import type { JsonValue } from "@/db/schema";

export async function enqueueJob(input: { organizationId: string; type: string; payload: JsonValue; runAt?: Date; maxAttempts?: number }): Promise<Job> {
  const inserted = await db.insert(jobs).values({ id: generateId(), organizationId: input.organizationId, type: input.type, payload: input.payload, runAt: input.runAt ?? new Date(), maxAttempts: input.maxAttempts ?? 5 }).returning();
  const job = inserted[0];
  if (!job) throw new Error("Job could not be enqueued");
  return job;
}

export async function claimNextJob(): Promise<Job | null> {
  const candidates = await db.select().from(jobs).where(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date()))).orderBy(asc(jobs.runAt)).limit(10);
  for (const candidate of candidates) {
    const claimed = await db.update(jobs).set({ status: "processing", lockedAt: new Date(), attempts: candidate.attempts + 1, updatedAt: new Date() }).where(and(eq(jobs.id, candidate.id), eq(jobs.status, "queued"))).returning();
    if (claimed[0]) return claimed[0];
  }
  return null;
}

export async function completeJob(jobId: string): Promise<void> {
  await db.update(jobs).set({ status: "completed", completedAt: new Date(), lockedAt: null, updatedAt: new Date() }).where(eq(jobs.id, jobId));
}

export async function failJob(job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Job failed";
  const shouldRetry = job.attempts < job.maxAttempts;
  await db.update(jobs).set({ status: shouldRetry ? "queued" : "failed", runAt: shouldRetry ? new Date(Date.now() + Math.min(60_000 * 2 ** job.attempts, 60 * 60_000)) : job.runAt, lockedAt: null, lastError: message, updatedAt: new Date() }).where(eq(jobs.id, job.id));
}
