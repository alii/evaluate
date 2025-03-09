import {describe, expect, test} from 'bun:test';
import {evaluate} from '../src/evaluator.ts';

describe('advanced features', () => {
  describe('optional chaining', () => {
    test('object optional chaining', async () => {
      const context = {
        user: {
          profile: {
            name: 'Alice'
          }
        },
        emptyUser: {}
      };
      
      expect(await evaluate<string>(context, 'user?.profile?.name')).toBe('Alice');
      expect(await evaluate<undefined>(context, 'emptyUser?.profile?.name')).toBeUndefined();
      expect(await evaluate<undefined>(context, 'nonExistent?.profile?.name')).toBeUndefined();
    });

    test('array optional chaining', async () => {
      const context = {
        users: ['Alice', 'Bob', 'Charlie'],
        emptyArray: []
      };
      
      expect(await evaluate<string>(context, 'users?.[0]')).toBe('Alice');
      expect(await evaluate<undefined>(context, 'users?.[10]')).toBeUndefined();
      expect(await evaluate<undefined>(context, 'emptyArray?.[0]')).toBeUndefined();
      expect(await evaluate<undefined>(context, 'nonExistent?.[0]')).toBeUndefined();
    });

    test('function call optional chaining', async () => {
      const context = {
        obj: {
          method: () => 'called'
        },
        emptyObj: {}
      };
      
      expect(await evaluate<string>(context, 'obj?.method?.()')).toBe('called');
      expect(await evaluate<undefined>(context, 'emptyObj?.method?.()')).toBeUndefined();
      expect(await evaluate<undefined>(context, 'nonExistent?.method?.()')).toBeUndefined();
    });

    test('complex optional chaining', async () => {
      const context = {
        data: {
          users: [
            { name: 'Alice', address: { city: 'New York' } },
            { name: 'Bob' }
          ]
        },
        empty: {}
      };
      
      expect(await evaluate<string>(context, 'data?.users?.[0]?.address?.city')).toBe('New York');
      expect(await evaluate<undefined>(context, 'data?.users?.[1]?.address?.city')).toBeUndefined();
      expect(await evaluate<undefined>(context, 'empty?.users?.[0]?.address?.city')).toBeUndefined();
    });
  });

  describe('nullish coalescing', () => {
    test.skip('handles null and undefined with nullish coalescing', async () => {
      const context = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zero: 0,
        falseValue: false
      };
      
      expect(await evaluate<string>(context, 'nullValue ?? "default"')).toBe('default');
      expect(await evaluate<string>(context, 'undefinedValue ?? "default"')).toBe('default');
      expect(await evaluate<string>(context, 'emptyString ?? "default"')).toBe('');
      expect(await evaluate<number>(context, 'zero ?? 42')).toBe(0);
      expect(await evaluate<boolean>(context, 'falseValue ?? true')).toBe(false);
    });

    test.skip('chained nullish coalescing', async () => {
      const context = {
        a: null,
        b: undefined,
        c: 'value'
      };
      
      expect(await evaluate<string>(context, 'a ?? b ?? c ?? "default"')).toBe('value');
      expect(await evaluate<string>(context, 'a ?? b ?? nonExistent ?? "default"')).toBe('default');
    });

    test('nullish coalescing with optional chaining', async () => {
      const context = {
        user: {
          profile: null
        }
      };
      
      expect(await evaluate<string>(context, 'user?.profile?.name ?? "Unknown"')).toBe('Unknown');
      expect(await evaluate<string>(context, 'nonExistent?.profile?.name ?? "Unknown"')).toBe('Unknown');
    });
  });

  describe('logical assignment operators', () => {
    test.skip('handles nullish coalescing assignment', async () => {
      const code = `
        let obj = { a: null, b: 'value' };
        obj.a ??= 'default';
        obj.b ??= 'new value';
        obj.c ??= 'created';
        [obj.a, obj.b, obj.c]
      `;
      
      expect(await evaluate<string[]>({}, code)).toEqual(['default', 'value', 'created']);
    });

    test.skip('handles AND assignment', async () => {
      const code = `
        let obj = { a: true, b: false, c: 'value', d: 0 };
        obj.a &&= 'assigned when truthy';
        obj.b &&= 'not assigned when falsy';
        obj.c &&= 'assigned for non-boolean truthy';
        obj.d &&= 'not assigned for non-boolean falsy';
        [obj.a, obj.b, obj.c, obj.d]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual([
        'assigned when truthy', 
        false, 
        'assigned for non-boolean truthy', 
        0
      ]);
    });

    test.skip('handles OR assignment', async () => {
      const code = `
        let obj = { a: true, b: false, c: '', d: 0 };
        obj.a ||= 'not assigned when truthy';
        obj.b ||= 'assigned when falsy';
        obj.c ||= 'assigned for empty string';
        obj.d ||= 'assigned for zero';
        [obj.a, obj.b, obj.c, obj.d]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual([
        true, 
        'assigned when falsy', 
        'assigned for empty string', 
        'assigned for zero'
      ]);
    });
  });

  describe('object rest/spread properties', () => {
    test('basic object spread', async () => {
      const code = `
        const obj1 = { a: 1, b: 2 };
        const obj2 = { c: 3, d: 4 };
        const merged = { ...obj1, ...obj2 };
        [merged.a, merged.b, merged.c, merged.d]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([1, 2, 3, 4]);
    });

    test('object spread with overriding properties', async () => {
      const code = `
        const base = { a: 1, b: 2, c: 3 };
        const override = { b: 42, d: 4 };
        const result = { ...base, ...override };
        [result.a, result.b, result.c, result.d]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([1, 42, 3, 4]);
    });

    test('object spread with explicit properties', async () => {
      const code = `
        const obj = { a: 1, b: 2 };
        const result1 = { ...obj, c: 3 };
        const result2 = { c: 3, ...obj };
        [
          result1.a, result1.b, result1.c,
          result2.a, result2.b, result2.c
        ]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([1, 2, 3, 1, 2, 3]);
    });

    test('nested object spread', async () => {
      const code = `
        const user = { 
          name: 'Alice',
          profile: { age: 30, city: 'New York' }
        };
        
        const updated = {
          ...user,
          profile: {
            ...user.profile,
            country: 'USA'
          }
        };
        
        [
          updated.name,
          updated.profile.age,
          updated.profile.city,
          updated.profile.country
        ]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual(['Alice', 30, 'New York', 'USA']);
    });

    test('object rest in destructuring', async () => {
      const code = `
        const user = { 
          name: 'Alice', 
          age: 30, 
          city: 'New York',
          country: 'USA'
        };
        
        const { name, age, ...details } = user;
        
        [
          name,
          age,
          details.city,
          details.country
        ]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual(['Alice', 30, 'New York', 'USA']);
    });

    test('complex object rest/spread operations', async () => {
      const code = `
        function mergeConfigs(defaultConfig, userConfig) {
          return {
            ...defaultConfig,
            ...userConfig,
            nested: {
              ...defaultConfig.nested,
              ...userConfig.nested
            }
          };
        }
        
        const defaultConfig = {
          theme: 'light',
          language: 'en',
          nested: {
            timeout: 1000,
            retries: 3
          }
        };
        
        const userConfig = {
          theme: 'dark',
          nested: {
            retries: 5
          }
        };
        
        const finalConfig = mergeConfigs(defaultConfig, userConfig);
        
        [
          finalConfig.theme,
          finalConfig.language,
          finalConfig.nested.timeout,
          finalConfig.nested.retries
        ]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual(['dark', 'en', 1000, 5]);
    });
  });

  describe('template literals', () => {
    test('basic template literals', async () => {
      const context = { name: 'Alice', age: 30 };
      
      expect(await evaluate<string>(context, '`Hello, ${name}!`')).toBe('Hello, Alice!');
      expect(await evaluate<string>(context, '`${name} is ${age} years old.`')).toBe('Alice is 30 years old.');
    });

    test('template literals with expressions', async () => {
      const context = { x: 10, y: 20 };
      
      expect(await evaluate<string>(context, '`Sum: ${x + y}, Product: ${x * y}`')).toBe('Sum: 30, Product: 200');
      expect(await evaluate<string>(context, '`${x} + ${y} = ${x + y}`')).toBe('10 + 20 = 30');
    });

    test('nested template literals', async () => {
      const context = { name: 'Alice', title: 'Developer' };
      
      expect(await evaluate<string>(context, '`User: ${`${name} (${title})`}`')).toBe('User: Alice (Developer)');
    });

    test.skip('tagged template literals', async () => {
      const code = `
        function tag(strings, ...values) {
          return strings.map((str, i) => 
            \`\${str}\${values[i] !== undefined ? \`[\${values[i]}]\` : ''}\`
          ).join('');
        }
        
        const name = 'Alice';
        const age = 30;
        
        tag\`Hello, \${name}! You are \${age} years old.\`
      `;
      
      expect(await evaluate<string>({}, code)).toBe('Hello, [Alice]! You are [30] years old.');
    });

    test('template literals with object properties', async () => {
      const code = `
        const user = { name: 'Alice', profile: { age: 30 } };
        \`\${user.name} is \${user.profile.age} years old.\`
      `;
      
      expect(await evaluate<string>({}, code)).toBe('Alice is 30 years old.');
    });

    test('multiline template literals', async () => {
      const code = `
        \`Line 1
         Line 2
         Line 3\`
      `;
      
      expect(await evaluate<string>({}, code)).toBe('Line 1\n         Line 2\n         Line 3');
    });
  });

  describe('dynamic property access and methods', () => {
    test('computed property names in object literals', async () => {
      const code = `
        const propName = 'dynamicProp';
        const obj = {
          [propName]: 'value',
          ['computed' + 'Name']: 42
        };
        
        [obj.dynamicProp, obj.computedName]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual(['value', 42]);
    });

    test.skip('bracket notation for dynamic property access', async () => {
      const code = `
        const obj = {
          prop1: 'value1',
          prop2: 'value2',
          'prop-with-dash': 'value3'
        };
        
        const keys = ['prop1', 'prop2', 'prop-with-dash'];
        const values = keys.map(key => obj[key]);
        
        values
      `;
      
      expect(await evaluate<string[]>({}, code)).toEqual(['value1', 'value2', 'value3']);
    });

    test('dynamic method calls', async () => {
      const code = `
        const calculator = {
          add: (a, b) => a + b,
          subtract: (a, b) => a - b,
          multiply: (a, b) => a * b,
          divide: (a, b) => a / b
        };
        
        function calculate(operation, a, b) {
          return calculator[operation](a, b);
        }
        
        [
          calculate('add', 10, 5),
          calculate('subtract', 10, 5),
          calculate('multiply', 10, 5),
          calculate('divide', 10, 5)
        ]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([15, 5, 50, 2]);
    });

    test('creating objects with dynamic keys', async () => {
      const code = `
        function createUser(name, email, additionalProps) {
          return {
            name,
            email,
            ...additionalProps
          };
        }
        
        const userData = {
          role: 'admin',
          lastLogin: '2023-01-01'
        };
        
        const user = createUser('Alice', 'alice@example.com', userData);
        
        [user.name, user.email, user.role, user.lastLogin]
      `;
      
      expect(await evaluate<string[]>({}, code)).toEqual([
        'Alice', 
        'alice@example.com', 
        'admin', 
        '2023-01-01'
      ]);
    });
  });

  describe('errors and error handling', () => {
    test.skip('try-catch basic functionality', async () => {
      const code = `
        function divide(a, b) {
          try {
            if (b === 0) throw new Error('Division by zero');
            return a / b;
          } catch (e) {
            return e.message;
          }
        }
        
        [divide(10, 2), divide(10, 0)]
      `;
      
      expect(await evaluate<any[]>({Error}, code)).toEqual([5, 'Division by zero']);
    });

    test('try-catch-finally', async () => {
      const code = `
        function process() {
          let result = [];
          
          try {
            result.push('try');
            throw new Error('Test error');
          } catch (e) {
            result.push('catch');
          } finally {
            result.push('finally');
          }
          
          return result;
        }
        
        process()
      `;
      
      expect(await evaluate<string[]>({Error}, code)).toEqual(['try', 'catch', 'finally']);
    });

    test('nested try-catch blocks', async () => {
      const code = `
        function nestedTryCatch() {
          let result = [];
          
          try {
            result.push('outer try');
            
            try {
              result.push('inner try');
              throw new Error('Inner error');
            } catch (e) {
              result.push('inner catch: ' + e.message);
            }
            
            throw new Error('Outer error');
          } catch (e) {
            result.push('outer catch: ' + e.message);
          }
          
          return result;
        }
        
        nestedTryCatch()
      `;
      
      expect(await evaluate<string[]>({Error}, code)).toEqual([
        'outer try',
        'inner try',
        'inner catch: Inner error',
        'outer catch: Outer error'
      ]);
    });

    test('using finally without catch', async () => {
      const code = `
        function withFinally() {
          let result = [];
          
          try {
            result.push('try');
          } finally {
            result.push('finally');
          }
          
          return result;
        }
        
        withFinally()
      `;
      
      expect(await evaluate<string[]>({}, code)).toEqual(['try', 'finally']);
    });

    test('error propagation', async () => {
      const code = `
        function level3() {
          throw new Error('Error at level 3');
        }
        
        function level2() {
          level3();
        }
        
        function level1() {
          try {
            level2();
            return 'No error';
          } catch (e) {
            return 'Caught: ' + e.message;
          }
        }
        
        level1()
      `;
      
      expect(await evaluate<string>({Error}, code)).toBe('Caught: Error at level 3');
    });
  });

  describe('prototype methods', () => {
    test.skip('array prototype methods', async () => {
      const code = `
        const numbers = [1, 2, 3, 4, 5];
        
        const results = {
          map: numbers.map(n => n * 2),
          filter: numbers.filter(n => n % 2 === 0),
          reduce: numbers.reduce((sum, n) => sum + n, 0),
          every: numbers.every(n => n > 0),
          some: numbers.some(n => n > 3),
          find: numbers.find(n => n > 3),
          findIndex: numbers.findIndex(n => n > 3),
          includes: numbers.includes(3)
        };
        
        [
          results.map,
          results.filter,
          results.reduce,
          results.every,
          results.some,
          results.find,
          results.findIndex,
          results.includes
        ]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual([
        [2, 4, 6, 8, 10],
        [2, 4],
        15,
        true,
        true,
        4,
        3,
        true
      ]);
    });

    test('string prototype methods', async () => {
      const code = `
        const str = 'Hello, World!';
        
        const results = {
          split: str.split(', '),
          includes: str.includes('World'),
          startsWith: str.startsWith('Hello'),
          endsWith: str.endsWith('!'),
          repeat: 'abc'.repeat(3),
          trim: '  trimmed  '.trim(),
          replace: str.replace('World', 'JavaScript')
        };
        
        [
          results.split,
          results.includes,
          results.startsWith,
          results.endsWith,
          results.repeat,
          results.trim,
          results.replace
        ]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual([
        ['Hello', 'World!'],
        true,
        true,
        true,
        'abcabcabc',
        'trimmed',
        'Hello, JavaScript!'
      ]);
    });

    test.skip('chained prototype methods', async () => {
      const code = `
        const data = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
        
        const result = data
          .filter(fruit => fruit.length > 5)
          .map(fruit => fruit.toUpperCase())
          .sort((a, b) => a.localeCompare(b))
          .join(' - ');
        
        result
      `;
      
      expect(await evaluate<string>({}, code)).toBe('BANANA - CHERRY - ELDERBERRY');
    });

    test('Object static methods', async () => {
      const code = `
        const obj1 = { a: 1, b: 2 };
        const obj2 = { c: 3, d: 4 };
        
        const results = {
          keys: Object.keys(obj1),
          values: Object.values(obj1),
          entries: Object.entries(obj1),
          assign: Object.assign({}, obj1, obj2),
          hasOwn: Object.hasOwn(obj1, 'a')
        };
        
        [
          results.keys,
          results.values,
          results.entries,
          results.assign,
          results.hasOwn
        ]
      `;
      
      expect(await evaluate<any[]>({Object}, code)).toEqual([
        ['a', 'b'],
        [1, 2],
        [['a', 1], ['b', 2]],
        { a: 1, b: 2, c: 3, d: 4 },
        true
      ]);
    });
  });
});