/**
 * Frecency scoring algorithm
 *
 * Frecency = frequency_weight × recency_weight
 *
 * - Recency weights decay based on how long ago the command was run
 * - Frequency uses logarithmic scale to prevent domination by very frequent commands
 */

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_MONTH = 30 * ONE_DAY;

export function calculateRecencyWeight(timestamp: string | null): number {
  if (!timestamp) {
    return 10; // Oldest weight for unknown timestamps
  }

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const age = now - then;

  if (age < FOUR_HOURS) {
    return 100;
  } else if (age < ONE_DAY) {
    return 70;
  } else if (age < ONE_WEEK) {
    return 50;
  } else if (age < ONE_MONTH) {
    return 30;
  } else {
    return 10;
  }
}

export function calculateFrecencyScore(frequency: number, mostRecent: string | null): number {
  // Logarithmic frequency weight to prevent domination
  const frequencyWeight = 1 + Math.log10(Math.max(1, frequency));
  const recencyWeight = calculateRecencyWeight(mostRecent);

  return frequencyWeight * recencyWeight;
}
