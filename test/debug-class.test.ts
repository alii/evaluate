import { describe, expect, test } from 'bun:test';
import { evaluate } from '../src/evaluator/index.ts';

// These tests verify the ability to use class instances
describe('Class Features', () => {
  test('method call works', async () => {
    const code = `
      class Counter {
        constructor(start) {
          this.count = start || 0;
        }
        
        increment() {
          this.count += 1;
          return this.count;
        }
      }
      
      const counter = new Counter(5);
      counter.increment();
    `;
    
    const result = await evaluate<number>({}, code);
    expect(result).toBe(6);
  });
});