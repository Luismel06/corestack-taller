import { WorkshopTaskStatus, WorkshopTaskTimeEvent } from '@qorvex/database';

export function taskTimeTotals(
  entries: Array<{ event: WorkshopTaskTimeEvent; occurredAt: Date }>,
  options: {
    now: Date;
    startedAt: Date | null;
    status: WorkshopTaskStatus;
    previousActualMinutes?: number;
    previousPausedMinutes?: number;
  },
) {
  // A legacy task may have totals but no event history. Cancellation must not
  // invent elapsed work/pauses, or erase the amounts recorded before migration.
  if (entries.length === 1 && entries[0].event === 'CANCEL')
    return {
      actualMinutes: options.previousActualMinutes ?? 0,
      pausedMinutes: options.previousPausedMinutes ?? 0,
    };
  let activeAt: Date | null = options.startedAt;
  let pausedAt: Date | null = null;
  let activeMilliseconds = 0;
  let pausedMilliseconds = 0;
  for (const entry of entries) {
    if (entry.event === 'START' || entry.event === 'RESUME') {
      if (pausedAt) pausedMilliseconds += Math.max(0, +entry.occurredAt - +pausedAt);
      pausedAt = null;
      activeAt = entry.occurredAt;
    } else {
      if (activeAt) activeMilliseconds += Math.max(0, +entry.occurredAt - +activeAt);
      activeAt = null;
      if (entry.event === 'PAUSE') pausedAt = entry.occurredAt;
      else {
        if (pausedAt) pausedMilliseconds += Math.max(0, +entry.occurredAt - +pausedAt);
        pausedAt = null;
      }
    }
  }
  if (activeAt && options.status === 'IN_PROGRESS')
    activeMilliseconds += Math.max(0, +options.now - +activeAt);
  if (pausedAt && options.status === 'PAUSED')
    pausedMilliseconds += Math.max(0, +options.now - +pausedAt);
  return {
    actualMinutes: Math.floor(activeMilliseconds / 60000),
    pausedMinutes: Math.floor(pausedMilliseconds / 60000),
  };
}
