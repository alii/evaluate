import { describe, expect, test } from 'bun:test';
import { evaluate } from '../src/evaluator/index.ts';

describe('Classes', () => {
  test('class with static methods', async () => {
    const code = `
      class Calculator {
        static add(a, b) {
          return a + b;
        }
        
        static multiply(a, b) {
          return a * b;
        }
      }
      
      [Calculator.add(2, 3), Calculator.multiply(4, 5)]
    `;
    
    const result = await evaluate<[number, number]>({}, code);
    expect(result[0]).toBe(5);
    expect(result[1]).toBe(20);
  });
  
  test('inheritance of static methods', async () => {
    const code = `
      class Parent {
        static sayHello() {
          return 'Hello from Parent';
        }
      }
      
      class Child extends Parent {
        static sayGoodbye() {
          return 'Goodbye from Child';
        }
      }
      
      [Parent.sayHello(), Child.sayHello(), Child.sayGoodbye()]
    `;
    
    const result = await evaluate<[string, string, string]>({}, code);
    expect(result[0]).toBe('Hello from Parent');
    expect(result[1]).toBe('Hello from Parent');
    expect(result[2]).toBe('Goodbye from Child');
  });
  
  test('constructor returning custom object', async () => {
    const code = `
      class Strange {
        constructor() {
          // Constructors can return objects to override normal instance creation
          return { custom: true };
        }
      }
      
      const obj = new Strange();
      obj.custom
    `;
    
    const result = await evaluate<boolean>({}, code);
    expect(result).toBe(true);
  });
});