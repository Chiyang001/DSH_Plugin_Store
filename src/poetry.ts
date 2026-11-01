import poetry from './data/poetry.json';

const dayMs = 86_400_000;
const epoch = Date.parse(`${poetry.epoch}T00:00:00Z`);
export interface Poem { text: string; author: string; title: string }
export const poetryCount = poetry.verses.length;

/** Receives the shared Shanghai calendar date; independent of recommendations or storage. */
export function dailyPoem(day: string): Poem {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : NaN;
  const offset = Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === day ? Math.round((date - epoch) / dayMs) : 0;
  return poetry.verses[((offset % poetryCount) + poetryCount) % poetryCount];
}
