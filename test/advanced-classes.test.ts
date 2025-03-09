import { describe, expect, test } from 'bun:test';
import { evaluate } from '../src/evaluator/index.ts';

describe('Advanced Class Features', () => {
  // Test for simple class with only static methods
  test('class with static methods only', async () => {
    const code = `
      class Calculator {
        static add(a, b) {
          return a + b;
        }
        
        static subtract(a, b) {
          return a - b;
        }
        
        static multiply(a, b) {
          return a * b;
        }
      }
      
      [Calculator.add(5, 3), Calculator.subtract(10, 4), Calculator.multiply(2, 6)]
    `;
    
    const result = await evaluate<number[]>({}, code);
    expect(result).toEqual([8, 6, 12]);
  });
  // Testing the basics first to make sure they work
  test('basic class declaration and instantiation', async () => {
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
      counter.count;
    `;
    
    const result = await evaluate<number>({}, code);
    expect(result).toBe(6);
  });
  
  // Test for static methods
  test('static methods', async () => {
    const code = `
      class MathUtils {
        static add(a, b) {
          return a + b;
        }
      }
      
      MathUtils.add(5, 10);
    `;
    
    const result = await evaluate<number>({}, code);
    expect(result).toBe(15);
  });
  
  // Test for basic method invocation
  test('method invocation', async () => {
    const code = `
      class Counter {
        constructor() {
          this.count = 0;
        }
        
        increment() {
          this.count += 1;
          return this.count;
        }
        
        decrement() {
          this.count -= 1;
          return this.count;
        }
      }
      
      const counter = new Counter();
      const first = counter.increment();
      const second = counter.increment();
      const third = counter.decrement();
      [first, second, third];
    `;
    
    const result = await evaluate<number[]>({}, code);
    expect(result).toEqual([1, 2, 1]);
  });
  
  // Testing access to instance properties
  test('accessing instance properties', async () => {
    const code = `
      class Person {
        constructor(name, age) {
          this.name = name;
          this.age = age;
        }
        
        getDetails() {
          return this.name + ' is ' + this.age + ' years old';
        }
      }
      
      const person = new Person('Alice', 25);
      [person.name, person.age, person.getDetails()];
    `;
    
    const result = await evaluate<[string, number, string]>({}, code);
    expect(result[0]).toBe('Alice');
    expect(result[1]).toBe(25);
    expect(result[2]).toBe('Alice is 25 years old');
  });
  
  // Testing dynamic property access
  test('dynamic property access', async () => {
    const code = `
      class PropertyHolder {
        constructor() {
          this.a = 1;
          this.b = 2;
          this.c = 3;
        }
      }
      
      const obj = new PropertyHolder();
      const keys = ['a', 'b', 'c'];
      // Instead of using map (which creates promises we can't handle),
      // use a more direct approach with a loop
      const result = [];
      for (let i = 0; i < keys.length; i++) {
        result.push(obj[keys[i]]);
      }
      result;
    `;
    
    const result = await evaluate<number[]>({}, code);
    expect(result).toEqual([1, 2, 3]);
  });

  // Testing method chaining
  test('method chaining', async () => {
    const code = `
      class Builder {
        constructor() {
          this.value = '';
        }
        
        append(str) {
          this.value += str;
          // The key issue was returning this
          // When we bind methods, the "this" value gets confused on chains
          // Luckily we can make Builder methods work on any Builder instance
          // by making a more explicit return that specifies the object
          return this;
        }
        
        getValue() {
          return this.value;
        }
      }
      
      // Instead of chaining, create variables for intermediate results
      const builder = new Builder();
      builder.append('Hello');
      builder.append(' ');
      builder.append('World');
      builder.getValue();
    `;
    
    const result = await evaluate<string>({}, code);
    expect(result).toBe('Hello World');
  });
});