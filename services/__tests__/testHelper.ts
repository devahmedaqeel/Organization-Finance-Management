/**
 * services/__tests__/testHelper.ts
 *
 * Lightweight, zero-dependency test runner bridge for node:test and node:assert.
 * Allows Jest-style unit tests to run seamlessly under tsx/node without heavy dependencies.
 */

import { describe as nDescribe, test as nTest } from "node:test";
import assert from "node:assert";

export const describe = nDescribe;
export const test = nTest;
export const it = nTest;

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: any) {
      assert.deepStrictEqual(actual, expected);
    },
    toContain(expected: any) {
      if (Array.isArray(actual)) {
        assert.ok(actual.includes(expected), `Expected array to contain ${expected}`);
      } else {
        assert.ok(
          String(actual).includes(String(expected)),
          `Expected "${actual}" to contain "${expected}"`
        );
      }
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toBeCloseTo(expected: number, numDigits: number = 2) {
      const precision = Math.pow(10, -numDigits) / 2;
      assert.ok(
        Math.abs(actual - expected) <= precision,
        `Expected ${actual} to be close to ${expected} (within ${precision})`
      );
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeFalsy() {
      assert.ok(!actual, `Expected falsy, got ${actual}`);
    },
    toBeTruthy() {
      assert.ok(!!actual, `Expected truthy, got ${actual}`);
    },
    toHaveLength(length: number) {
      assert.strictEqual(actual?.length, length);
    },
  };
}
