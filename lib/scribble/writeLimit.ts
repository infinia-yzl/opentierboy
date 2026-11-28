import {z} from '@/lib/zod';

export interface InkWriteLimit {
  readonly writes: number;
  readonly windowMs: number;
}

export type InkWriteDecision = 'write' | 'hold';

export const INK_WRITE_LIMIT: InkWriteLimit = Object.freeze({writes: 20, windowMs: 30_000});
export const INK_WRITE_LIMIT_STORAGE_KEY = 'otb-ink-write-limit';

const LONGEST_WINDOW_MS = 86_400_000;

const storedLimit = z.object({
  writes: z.number().int().min(0).max(INK_WRITE_LIMIT.writes),
  windowMs: z.number().int().min(INK_WRITE_LIMIT.windowMs).max(LONGEST_WINDOW_MS),
}).strict();

export function inkWriteDecision(writtenAt: readonly number[], now: number, limit: InkWriteLimit = INK_WRITE_LIMIT): InkWriteDecision {
  const recent = writtenAt.filter((at) => now - at < limit.windowMs).length;
  return recent >= limit.writes ? 'hold' : 'write';
}

export function inkWriteLimitFrom(stored: string | null): InkWriteLimit {
  if (stored === null) return INK_WRITE_LIMIT;
  try {
    const parsed = storedLimit.safeParse(JSON.parse(stored));
    return parsed.success ? Object.freeze(parsed.data) : INK_WRITE_LIMIT;
  } catch {
    return INK_WRITE_LIMIT;
  }
}
