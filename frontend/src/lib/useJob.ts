"use client";

import { useEffect, useRef } from "react";
import { getJob, isActive, type Job } from "@/lib/brief";

const POLL_MS = 2000;

/**
 * Follows a running generation until it ends, then calls `onEnd` with the finished job.
 * The job lives on the server, so after a refresh the page passes the same job back in
 * and polling simply picks up again.
 */
export function useJobPolling(projectId: string, job: Job | null, onEnd: (job: Job) => void) {
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  const jobId = job?.id;
  const active = isActive(job);

  useEffect(() => {
    if (!active || !jobId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const next = await getJob(projectId, jobId);
        if (!cancelled && !isActive(next)) onEndRef.current(next);
      } catch {
        // A dropped poll is retried on the next tick; the job keeps running on the server.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, jobId, projectId]);

  return active;
}
