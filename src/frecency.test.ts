import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { calculateRecencyWeight, calculateFrecencyScore } from "./frecency";

describe("frecency", () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;

  // Helper to create ISO timestamp relative to now
  const timeAgo = (ms: number): string => {
    return new Date(Date.now() - ms).toISOString();
  };

  describe("calculateRecencyWeight", () => {
    it("returns 10 for null timestamp", () => {
      expect(calculateRecencyWeight(null)).toBe(10);
    });

    it("returns 100 for timestamp within 4 hours", () => {
      expect(calculateRecencyWeight(timeAgo(1 * HOUR))).toBe(100);
      expect(calculateRecencyWeight(timeAgo(3 * HOUR))).toBe(100);
    });

    it("returns 70 for timestamp within 1 day (but > 4 hours)", () => {
      expect(calculateRecencyWeight(timeAgo(5 * HOUR))).toBe(70);
      expect(calculateRecencyWeight(timeAgo(12 * HOUR))).toBe(70);
      expect(calculateRecencyWeight(timeAgo(23 * HOUR))).toBe(70);
    });

    it("returns 50 for timestamp within 1 week (but > 1 day)", () => {
      expect(calculateRecencyWeight(timeAgo(2 * DAY))).toBe(50);
      expect(calculateRecencyWeight(timeAgo(5 * DAY))).toBe(50);
    });

    it("returns 30 for timestamp within 1 month (but > 1 week)", () => {
      expect(calculateRecencyWeight(timeAgo(10 * DAY))).toBe(30);
      expect(calculateRecencyWeight(timeAgo(20 * DAY))).toBe(30);
    });

    it("returns 10 for timestamp older than 1 month", () => {
      expect(calculateRecencyWeight(timeAgo(35 * DAY))).toBe(10);
      expect(calculateRecencyWeight(timeAgo(90 * DAY))).toBe(10);
    });

    it("returns 100 for timestamp just now", () => {
      expect(calculateRecencyWeight(new Date().toISOString())).toBe(100);
    });
  });

  describe("calculateFrecencyScore", () => {
    it("returns recency weight for frequency of 1", () => {
      // frequency weight = 1 + log10(1) = 1 + 0 = 1
      // score = 1 * recencyWeight
      expect(calculateFrecencyScore(1, null)).toBe(10); // 1 * 10
      expect(calculateFrecencyScore(1, timeAgo(1 * HOUR))).toBe(100); // 1 * 100
    });

    it("applies logarithmic scaling to frequency", () => {
      const recentTime = timeAgo(1 * HOUR); // recency weight = 100

      // frequency 1: weight = 1 + log10(1) = 1
      expect(calculateFrecencyScore(1, recentTime)).toBe(100);

      // frequency 10: weight = 1 + log10(10) = 1 + 1 = 2
      expect(calculateFrecencyScore(10, recentTime)).toBe(200);

      // frequency 100: weight = 1 + log10(100) = 1 + 2 = 3
      expect(calculateFrecencyScore(100, recentTime)).toBe(300);
    });

    it("combines frequency and recency correctly", () => {
      // frequency 10 (weight 2), old timestamp (weight 10)
      expect(calculateFrecencyScore(10, timeAgo(60 * DAY))).toBe(20);

      // frequency 10 (weight 2), recent timestamp (weight 100)
      expect(calculateFrecencyScore(10, timeAgo(1 * HOUR))).toBe(200);
    });

    it("handles frequency of 0 or negative", () => {
      // Should use max(1, frequency) so minimum weight is 1
      expect(calculateFrecencyScore(0, timeAgo(1 * HOUR))).toBe(100);
      expect(calculateFrecencyScore(-5, timeAgo(1 * HOUR))).toBe(100);
    });

    it("ranks recent frequent commands higher than old frequent commands", () => {
      const recentFrequent = calculateFrecencyScore(50, timeAgo(2 * HOUR));
      const oldFrequent = calculateFrecencyScore(50, timeAgo(60 * DAY));

      expect(recentFrequent).toBeGreaterThan(oldFrequent);
    });

    it("ranks recent infrequent commands higher than old frequent commands", () => {
      const recentInfrequent = calculateFrecencyScore(2, timeAgo(1 * HOUR));
      const oldFrequent = calculateFrecencyScore(100, timeAgo(60 * DAY));

      // recent: (1 + log10(2)) * 100 = 1.3 * 100 = 130
      // old: (1 + log10(100)) * 10 = 3 * 10 = 30
      expect(recentInfrequent).toBeGreaterThan(oldFrequent);
    });
  });
});
