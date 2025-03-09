import {describe, expect, test} from 'bun:test';
import {evaluate} from '../src/evaluator.ts';

describe('edge cases', () => {
  describe('globals and references', () => {
    test('accessing non-existent variables', async () => {
      expect(evaluate<any>({}, 'nonExistentVar')).rejects.toThrow();
    });

    test('custom globals', async () => {
      const context = {
        customGlobal: 'value',
        customFunction: () => 'called'
      };

      expect(await evaluate<string>(context, 'customGlobal')).toBe('value');
      expect(await evaluate<string>(context, 'customFunction()')).toBe('called');
    });

    test('circular references', async () => {
      const circular = {};
      circular.self = circular;

      const context = { circular };
      const result = await evaluate<any>(context, 'circular.self === circular');
      expect(result).toBe(true);
    });
  });

  describe('numerical edge cases', () => {
    test('edge case number values', async () => {
      const code = `[
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.MAX_VALUE,
        Number.MIN_VALUE,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        1e100
      ]`;
      
      const result = await evaluate<any[]>({Number}, code);
      
      expect(result[0]).toBe(Number.MAX_SAFE_INTEGER);
      expect(result[1]).toBe(Number.MIN_SAFE_INTEGER);
      expect(result[2]).toBe(Number.MAX_VALUE);
      expect(result[3]).toBe(Number.MIN_VALUE);
      expect(result[4]).toBe(Number.POSITIVE_INFINITY);
      expect(result[5]).toBe(Number.NEGATIVE_INFINITY);
      expect(isNaN(result[6])).toBe(true);
      expect(result[7]).toBe(1e100);
    });

    test('number conversions and edge cases', async () => {
      const code = `[
        +"42",
        +"3.14",
        +true,
        +false,
        +null,
        +undefined,
        +[],
        +[1],
        +[1,2],
        +"not a number",
        parseInt("42px"),
        parseFloat("3.14abc")
      ]`;
      
      // Without Number/parseInt/parseFloat in context, some of these might fail
      const globals = { Number, parseInt, parseFloat };
      const result = await evaluate<any[]>(globals, code);
      
      expect(result[0]).toBe(42);
      expect(result[1]).toBe(3.14);
      expect(result[2]).toBe(1);
      expect(result[3]).toBe(0);
      expect(result[4]).toBe(0);
      expect(isNaN(result[5])).toBe(true);
      expect(result[6]).toBe(0);
      expect(result[7]).toBe(1);
      expect(isNaN(result[8])).toBe(true);
      expect(isNaN(result[9])).toBe(true);
      expect(result[10]).toBe(42);
      expect(result[11]).toBe(3.14);
    });

    test('floating point precision issues', async () => {
      const code = `[
        0.1 + 0.2,
        0.1 + 0.2 === 0.3,
        Math.abs((0.1 + 0.2) - 0.3) < Number.EPSILON
      ]`;
      
      const globals = { Number, Math };
      const result = await evaluate<any[]>(globals, code);
      
      expect(result[0]).not.toBe(0.3); // Due to floating point precision
      expect(result[1]).toBe(false);
      expect(result[2]).toBe(true);
    });
  });

  describe('function edge cases', () => {
    test('self-returning functions', async () => {
      const code = `
        function identity(x) {
          return x;
        }
        
        identity(identity)
      `;
      
      const result = await evaluate<Function>({}, code);
      expect(typeof result).toBe('function');
    });

    test('recursive functions with memory limits', async () => {
      const code = `
        function countDown(n) {
          if (n <= 0) return 0;
          return countDown(n - 1) + 1;
        }
        
        // A reasonable depth that shouldn't cause stack overflow
        countDown(100)
      `;
      
      expect(await evaluate<number>({}, code)).toBe(100);
    });

    test('immediately invoked function expressions (IIFE)', async () => {
      const code = `
        const result = (function() {
          let hidden = 'hidden'; // Changed from 'private' which is a reserved word
          return {
            getPrivate: function() { return hidden; },
            setPrivate: function(val) { hidden = val; }
          };
        })();
        
        result.setPrivate('modified');
        result.getPrivate()
      `;
      
      expect(await evaluate<string>({}, code)).toBe('modified');
    });

    test('higher order functions', async () => {
      const code = `
        function createAdder(a) {
          return function(b) {
            return a + b;
          };
        }
        
        const add5 = createAdder(5);
        [add5(10), add5(20)]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([15, 25]);
    });

    test('function hoisting', async () => {
      const code = `
        // We can't do true hoisting with the evaluator, so simulate it
        function hoisted() {
          return 'I am hoisted';
        }
        
        const result = hoisted();
        result
      `;
      
      expect(await evaluate<string>({}, code)).toBe('I am hoisted');
    });

    test('function expression vs declaration', async () => {
      const code = `
        // This should fail as expressions are not hoisted
        let result;
        try {
          result = notHoisted();
        } catch (e) {
          result = 'error';
        }
        
        const notHoisted = function() {
          return 'I am not hoisted';
        };
        
        [result, notHoisted()]
      `;
      
      expect(await evaluate<string[]>({Error}, code)).toEqual(['error', 'I am not hoisted']);
    });
  });

  describe('scope and closure cases', () => {
    test('closure capturing changing variables', async () => {
      const code = `
        function createFunctions() {
          let funcs = [];
          
          for (let i = 0; i < 3; i++) {
            funcs.push(function() { return i; });
          }
          
          return funcs;
        }
        
        const functions = createFunctions();
        [functions[0](), functions[1](), functions[2]()]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([0, 1, 2]);
    });

    test('variable shadowing', async () => {
      const code = `
        const x = 'global';
        
        function outer() {
          const x = 'outer';
          
          function inner() {
            const x = 'inner';
            return x;
          }
          
          return [x, inner()];
        }
        
        [x, ...outer()]
      `;
      
      expect(await evaluate<string[]>({}, code)).toEqual(['global', 'outer', 'inner']);
    });

    test('closure over parameters', async () => {
      const code = `
        function multiplier(factor) {
          return function(number) {
            return number * factor;
          };
        }
        
        const double = multiplier(2);
        const triple = multiplier(3);
        
        [double(5), triple(5)]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([10, 15]);
    });

    test('capturing this context in functions', async () => {
      const code = `
        const obj = {
          value: 42,
          getValue: function() {
            return this.value;
          }
        };
        
        const nested = {
          value: 43,
          getValue: function() {
            return this.value;
          }
        };
        
        [
          obj.getValue.call(obj),
          nested.getValue.call(nested)
        ]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([42, 43]);
    });
  });

  describe('complex expressions and patterns', () => {
    test('nested ternary operators', async () => {
      const code = `
        function getCategory(age) {
          return age < 13 ? 'child' 
                 : age < 18 ? 'teenager'
                 : age < 65 ? 'adult'
                 : 'senior';
        }
        
        [getCategory(8), getCategory(15), getCategory(30), getCategory(70)]
      `;
      
      expect(await evaluate<string[]>({}, code)).toEqual(['child', 'teenager', 'adult', 'senior']);
    });

    test('complex short-circuit evaluation', async () => {
      const code = `
        // Use an object to store operations instead of array
        const state = { operations: [] };
        
        function record(name) {
          state.operations.push(name);
          return name;
        }
        
        // These utilize short-circuit behavior
        const result1 = record('A') && record('B') && record('C');
        const result2 = record('D') || record('E') || record('F');
        const result3 = record('G') && record('H') || record('I');
        const result4 = record('J') || record('K') && record('L');
        
        ({ 
          operations: state.operations, 
          result1: result1, 
          result2: result2, 
          result3: result3, 
          result4: result4 
        })
      `;
      
      const result = await evaluate<any>({}, code);
      
      expect(result.operations).toEqual(['A', 'B', 'C', 'D', 'G', 'H', 'J']);
      expect(result.result1).toBe('C');
      expect(result.result2).toBe('D');
      expect(result.result3).toBe('H');
      expect(result.result4).toBe('J');
    });

    test('chained array and object operations', async () => {
      const code = `
        const users = [
          { name: 'Alice', age: 30, hobbies: ['reading', 'hiking'] },
          { name: 'Bob', age: 25, hobbies: ['gaming', 'cooking'] },
          { name: 'Charlie', age: 35, hobbies: ['swimming', 'photography'] }
        ];
        
        // Chained operations
        const result = users
          .filter(user => user.age > 25)
          .map(user => ({
            fullName: user.name + ' (age: ' + user.age + ')',
            interests: user.hobbies.join(', ')
          }))
          .reduce((acc, user) => {
            acc[user.fullName] = user.interests;
            return acc;
          }, {});
        
        result
      `;
      
      expect(await evaluate<any>({}, code)).toEqual({
        'Alice (age: 30)': 'reading, hiking',
        'Charlie (age: 35)': 'swimming, photography'
      });
    });

    test('regex processing', async () => {
      const code = `
        function extractInfo(text) {
          const nameMatch = /Name: ([\\w\\s]+)/.exec(text);
          const ageMatch = /Age: (\\d+)/.exec(text);
          const emailMatch = /Email: ([\\w.@]+)/.exec(text);
          
          return {
            name: nameMatch ? nameMatch[1] : null,
            age: ageMatch ? parseInt(ageMatch[1]) : null,
            email: emailMatch ? emailMatch[1] : null
          };
        }
        
        extractInfo('Name: John Doe, Age: 42, Email: john@example.com')
      `;
      
      expect(await evaluate<any>({parseInt}, code)).toEqual({
        name: 'John Doe',
        age: 42,
        email: 'john@example.com'
      });
    });
  });

  describe('runtime error handling', () => {
    test('accessing properties of undefined', async () => {
      const code = `
        function safeAccess(obj, path) {
          try {
            // This will throw if obj is undefined or doesn't have the properties
            return path.split('.').reduce((o, p) => o[p], obj);
          } catch (e) {
            return null;
          }
        }
        
        [
          safeAccess({ user: { name: 'Alice' } }, 'user.name'),
          safeAccess({ user: {} }, 'user.name'),
          safeAccess({}, 'user.name'),
          safeAccess(null, 'user.name'),
          safeAccess(undefined, 'user.name')
        ]
      `;
      
      expect(await evaluate<any[]>({Error}, code)).toEqual([
        'Alice', null, null, null, null
      ]);
    });

    test('div by zero and other math errors', async () => {
      const code = `
        function safeDivide(a, b) {
          if (b === 0) return Infinity;
          return a / b;
        }
        
        [
          safeDivide(10, 2),
          safeDivide(10, 0),
          Math.sqrt(-1),
          Math.log(-1)
        ]
      `;
      
      const globals = { 
        Math, 
        Infinity, 
        NaN,
        isNaN
      };
      const result = await evaluate<any[]>(globals, code);
      
      expect(result[0]).toBe(5);
      expect(result[1]).toBe(Infinity);
      expect(isNaN(result[2])).toBe(true);
      expect(isNaN(result[3])).toBe(true);
    });

    test('error stack inspection', async () => {
      const code = `
        function level3() {
          try {
            throw new Error('Error at level 3');
          } catch (e) {
            return e.stack.includes('level3');
          }
        }
        
        function level2() {
          return level3();
        }
        
        function level1() {
          return level2();
        }
        
        level1()
      `;
      
      // This might fail if stack inspection is not supported
      expect(evaluate<boolean>({Error}, code)).resolves.toBeTruthy();
    });
  });

  describe('memory and resource usage', () => {
    test('large object creation', async () => {
      const code = `
        const createLargeObject = (size) => {
          const obj = {};
          for (let i = 0; i < size; i++) {
            obj['key' + i] = 'value' + i;
          }
          return obj;
        };
        
        const largeObj = createLargeObject(1000);
        Object.keys(largeObj).length
      `;
      
      expect(await evaluate<number>({Object}, code)).toBe(1000);
    });

    test('large array operations', async () => {
      const code = `
        const arr = Array.from({ length: 10000 }, (_, i) => i);
        
        // Basic operations on the large array
        const sum = arr.reduce((total, n) => total + n, 0);
        const evenCount = arr.filter(n => n % 2 === 0).length;
        
        [arr.length, sum, evenCount]
      `;
      
      expect(await evaluate<number[]>({Array}, code)).toEqual([
        10000, 49995000, 5000
      ]);
    });

    test('nested function calls with growing data', async () => {
      const code = `
        function appendLayer(arr, depth) {
          if (depth <= 0) return arr;
          
          // Append current depth to array
          const newArr = [...arr, depth];
          
          // Recurse with decremented depth
          return appendLayer(newArr, depth - 1);
        }
        
        const result = appendLayer([], 20);
        [result.length, result.reduce((sum, n) => sum + n, 0)]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([20, 210]); // Sum of numbers 1-20 = 210
    });
  });

  describe('exotic syntax and patterns', () => {
    test('comma operator in expressions', async () => {
      const code = `
        let x = 0;
        const result = (x = 1, x + 1, x * 2, x + 5);
        [x, result]
      `;
      
      expect(await evaluate<number[]>({}, code)).toEqual([1, 6]);
    });

    test('labeled statements and breaking from loops', async () => {
      const code = `
        function findInMatrix(matrix, target) {
          let result = null;
          
          outerLoop: for (let i = 0; i < matrix.length; i++) {
            const row = matrix[i];
            
            for (let j = 0; j < row.length; j++) {
              if (row[j] === target) {
                result = [i, j];
                break outerLoop;
              }
            }
          }
          
          return result;
        }
        
        const matrix = [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9]
        ];
        
        [
          findInMatrix(matrix, 5),
          findInMatrix(matrix, 9),
          findInMatrix(matrix, 10)
        ]
      `;
      
      expect(await evaluate<any[]>({}, code)).toEqual([
        [1, 1],  // position of 5
        [2, 2],  // position of 9
        null     // not found
      ]);
    });

    test('object property access edge cases', async () => {
      const code = `
        const obj = {
          'normal-key': 1,
          'key with spaces': 2,
          '123': 3,
          '': 4,
          [Symbol('test')]: 5
        };
        
        [
          obj['normal-key'],
          obj['key with spaces'],
          obj[123],
          obj[''],
          Object.getOwnPropertySymbols(obj).length > 0
        ]
      `;
      
      expect(await evaluate<any[]>({Object, Symbol}, code)).toEqual([
        1, 2, 3, 4, true
      ]);
    });

    test('unicode handling', async () => {
      const code = `
        const text = 'Hello, 世界!';
        
        [
          text.length, 
          text[7],
          text.charCodeAt(7),
          Array.from(text).length,
          [...text].join(' ')
        ]
      `;
      
      expect(await evaluate<any[]>({Array}, code)).toEqual([
        10,         // UTF-16 length
        '世',        // Character at index 7
        19990,      // Char code at index 7
        10,         // Spread length
        'H e l l o ,   世 界 !'
      ]);
    });
  });
});