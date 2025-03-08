import { beforeEach, describe, expect, test } from 'bun:test';
import { evaluate } from './src/evaluator.ts';
import { MemoryTracker } from './src/memory.ts';

describe('Memory Management', () => {
  beforeEach(() => {
    MemoryTracker.getInstance().reset();
  });

  test('scopes are cleaned up after block execution', async () => {
    const code = `
      {
        let x = 1; 
        {
          let y = 2;
          {
            let z = 3;
          }
        }
      }
    `;

    await evaluate({}, code);
    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeScopes).toBe(0);
    expect(stats.activeFunctions).toBe(0);
  });

  test('functions are cleaned up when overwritten', async () => {
    const code = `
      let f = function() { return 1; };
      f = function() { return 2; };
      f = function() { return 3; };
      f = undefined;
    `;

    await evaluate({}, code);
    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeFunctions).toBe(0);
    expect(stats.activeScopes).toBe(0);
  });

  test('nested functions are cleaned up', async () => {
    const code = `
      let result;
      {
        let inner1 = function() { return 1; };
        let inner2 = function() { return 2; };
        result = inner1() + inner2();
        inner1 = undefined;
        inner2 = undefined;
      }
    `;

    await evaluate({}, code);
    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeFunctions).toBe(0);
    expect(stats.activeScopes).toBe(0);
  });

  test('recursive functions clean up their scopes', async () => {
    const code = `
      let result;
      {
        let factorial = function(n) {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        };
        result = factorial(5);
        factorial = undefined;
      }
    `;

    await evaluate({}, code);
    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeFunctions).toBe(0);
    expect(stats.activeScopes).toBe(0);
  });

  test('async functions clean up properly', async () => {
    // Create a simple custom Promise implementation
    class CustomPromise {
      static resolve(value: unknown) {
        return {
          then(callback: (value: unknown) => unknown) {
            return CustomPromise.resolve(callback(value));
          }
        };
      }
    }
    
    const code = `
      let result;
      {
        let test = function() {
          return Promise.resolve(42);
        };
        result = await test();
        test = undefined;
      }
    `;

    await evaluate({ Promise: CustomPromise }, code);
    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeFunctions).toBe(0);
    expect(stats.activeScopes).toBe(0);
  });

  test('complex scope chain cleanup', async () => {
    const code = `
      let result;
      {
        let createChain = function(depth) {
          if (depth <= 0) return 0;
          let x = depth;
          let inner = function() {
            return x + createChain(depth - 1);
          };
          let value = inner();
          inner = undefined;
          return value;
        };
        result = createChain(3);
        createChain = undefined;
      }
    `;

    await evaluate({}, code);
    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeFunctions).toBe(0);
    expect(stats.activeScopes).toBe(0);
  });

  test('memory usage remains stable under load', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      await evaluate(
        {},
        `
        let result;
        {
          let test = function() {
            let x = 1;
            let inner = function() {
              return x;
            };
            let value = inner();
            inner = undefined;
            return value;
          };
          result = test();
          test = undefined;
        }
      `
      );
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDiff = finalMemory - initialMemory;

    expect(memoryDiff).toBeLessThan(1024 * 1024);

    const stats = MemoryTracker.getInstance().getStats();
    expect(stats.activeFunctions).toBe(0);
    expect(stats.activeScopes).toBe(0);
  });
});
