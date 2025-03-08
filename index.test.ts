import { describe, expect, test } from 'bun:test';
import { evaluate } from './src/evaluator.ts';

describe('myEval', () => {
  describe('literals', () => {
    test('evaluates number literals', async () => {
      expect(await evaluate<number>({}, '42')).toBe(42);
      expect(await evaluate<number>({}, '3.14')).toBe(3.14);
    });

    test('evaluates string literals', async () => {
      expect(await evaluate<string>({}, "'hello'")).toBe('hello');
      expect(await evaluate<string>({}, '"world"')).toBe('world');
    });

    test('evaluates boolean literals', async () => {
      expect(await evaluate<boolean>({}, 'true')).toBe(true);
      expect(await evaluate<boolean>({}, 'false')).toBe(false);
    });

    test('evaluates null and undefined', async () => {
      expect(await evaluate<null>({}, 'null')).toBe(null);
      expect(await evaluate<undefined>({}, 'undefined')).toBeUndefined();
    });
  });

  describe('identifiers', () => {
    test('evaluates identifiers from global context', async () => {
      const context = { x: 42, y: 'hello' };
      expect(await evaluate<number>(context, 'x')).toBe(42);
      expect(await evaluate<string>(context, 'y')).toBe('hello');
    });

    test('throws on undefined identifiers', async () => {
      expect(evaluate<any>({}, 'undefinedVar')).rejects.toThrow('Reference Error');
    });
  });

  describe('binary expressions', () => {
    test('evaluates arithmetic operators', async () => {
      expect(await evaluate<number>({}, '2 + 3')).toBe(5);
      expect(await evaluate<number>({}, '5 - 2')).toBe(3);
      expect(await evaluate<number>({}, '4 * 3')).toBe(12);
      expect(await evaluate<number>({}, '12 / 3')).toBe(4);
      expect(await evaluate<number>({}, '7 % 3')).toBe(1);
      expect(await evaluate<number>({}, '2 ** 3')).toBe(8);
    });

    test('evaluates comparison operators', async () => {
      expect(await evaluate<boolean>({}, '5 > 3')).toBe(true);
      expect(await evaluate<boolean>({}, '3 >= 3')).toBe(true);
      expect(await evaluate<boolean>({}, '2 < 3')).toBe(true);
      expect(await evaluate<boolean>({}, '3 <= 3')).toBe(true);
      expect(await evaluate<boolean>({}, '3 === 3')).toBe(true);
      expect(await evaluate<boolean>({}, '3 !== 4')).toBe(true);
    });

    test('evaluates logical operators', async () => {
      expect(await evaluate<boolean>({}, 'true && true')).toBe(true);
      expect(await evaluate<boolean>({}, 'true && false')).toBe(false);
      expect(await evaluate<boolean>({}, 'false && true')).toBe(false);
      expect(await evaluate<any>({}, '1 && 2')).toBe(2);
      expect(await evaluate<any>({}, '0 && 2')).toBe(0);

      expect(await evaluate<boolean>({}, 'true || false')).toBe(true);
      expect(await evaluate<boolean>({}, 'false || true')).toBe(true);
      expect(await evaluate<boolean>({}, 'false || false')).toBe(false);
      expect(await evaluate<any>({}, '1 || 2')).toBe(1);
      expect(await evaluate<any>({}, '0 || 2')).toBe(2);

      expect(await evaluate<number>({}, 'null ?? 42')).toBe(42);
      expect(await evaluate<number>({}, 'undefined ?? 42')).toBe(42);
      expect(await evaluate<number>({}, '0 ?? 42')).toBe(0);
      expect(await evaluate<string>({}, '"" ?? "default"')).toBe('');
      expect(await evaluate<boolean>({}, 'false ?? 42')).toBe(false);
    });

    test('evaluates bitwise operators', async () => {
      expect(await evaluate<number>({}, '5 & 3')).toBe(1);
      expect(await evaluate<number>({}, '5 | 3')).toBe(7);
      expect(await evaluate<number>({}, '5 ^ 3')).toBe(6);
      expect(await evaluate<number>({}, '8 << 1')).toBe(16);
      expect(await evaluate<number>({}, '8 >> 1')).toBe(4);
      expect(await evaluate<number>({}, '-8 >>> 1')).toBeGreaterThan(0);
    });
  });

  describe('unary expressions', () => {
    test('evaluates unary operators', async () => {
      expect(await evaluate<number>({}, '+5')).toBe(5);
      expect(await evaluate<number>({}, '-5')).toBe(-5);
      expect(await evaluate<boolean>({}, '!true')).toBe(false);
      expect(await evaluate<number>({}, '~5')).toBe(-6);
      expect(await evaluate<string>({}, 'typeof 42')).toBe('number');
    });
  });

  describe('member expressions', () => {
    test('evaluates object property access', async () => {
      const context = { obj: { x: 42, y: 'hello' } };
      expect(await evaluate<number>(context, 'obj.x')).toBe(42);
      expect(await evaluate<string>(context, 'obj.y')).toBe('hello');
    });

    test('evaluates computed property access', async () => {
      const context = { arr: [1, 2, 3] };
      expect(await evaluate<number>(context, 'arr[0]')).toBe(1);
      expect(await evaluate<number>(context, 'arr[1]')).toBe(2);
    });
  });

  describe('object expressions', () => {
    test('evaluates object literals', async () => {
      type TestObj = { x: number; y: string };
      expect(await evaluate<TestObj>({}, "({ x: 42, y: 'hello' })")).toEqual({ x: 42, y: 'hello' });
    });

    test('evaluates nested object literals', async () => {
      type NestedObj = { outer: { inner: number } };
      expect(await evaluate<NestedObj>({}, '({ outer: { inner: 42 } })')).toEqual({
        outer: { inner: 42 },
      });
    });

    test('handles object spread operator', async () => {
      const code = `
        const obj1 = { a: 1, b: 2 };
        const obj2 = { b: 3, c: 4 };
        ({ ...obj1, ...obj2 })
      `;
      expect(await evaluate<any>({}, code)).toEqual({ a: 1, b: 3, c: 4 });
    });
  });

  describe('array expressions', () => {
    test('evaluates array literals', async () => {
      expect(await evaluate<number[]>({}, '[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    test('evaluates nested arrays', async () => {
      expect(await evaluate<number[][]>({}, '[[1, 2], [3, 4]]')).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    test('handles sparse arrays', async () => {
      expect(await evaluate<(number | undefined)[]>({}, '[1, , 3]')).toEqual([1, undefined, 3]);
    });

    test('handles spread operator in arrays', async () => {
      const context = { arr: [2, 3, 4] };
      expect(await evaluate<number[]>(context, '[1, ...arr, 5]')).toEqual([1, 2, 3, 4, 5]);
      expect(await evaluate<number[]>(context, '[...arr, ...arr]')).toEqual([2, 3, 4, 2, 3, 4]);
    });

    test('throws for non-iterable spread in arrays', async () => {
      expect(evaluate<any>({}, '[...42]')).rejects.toThrow('Spread element is not iterable');
    });
  });

  describe('complex expressions', () => {
    test('evaluates complex arithmetic expressions', async () => {
      expect(await evaluate<number>({}, '(2 + 3) * 4')).toBe(20);
      expect(await evaluate<number>({}, '2 + 3 * 4')).toBe(14);
    });

    test('evaluates complex object and array expressions', async () => {
      type ComplexObj = { arr: [number, number, { x: number }] };
      const result = await evaluate<ComplexObj>({}, '({ arr: [1, 2, { x: 3 }] })');
      expect(result).toEqual({ arr: [1, 2, { x: 3 }] });
    });

    test('evaluates expressions with context', async () => {
      const context = {
        x: 10,
        obj: { y: 20 },
        arr: [1, 2, 3],
      };
      expect(await evaluate<number>(context, 'x + obj.y + arr[0]')).toBe(31);
    });
  });

  describe('variable declarations', () => {
    test('declares and initializes variables', async () => {
      expect(await evaluate<number>({}, 'let x = 42; x')).toBe(42);
      expect(await evaluate<string>({}, 'let str = "hello"; str')).toBe('hello');
    });

    test('handles multiple declarations', async () => {
      expect(await evaluate<number>({}, 'let x = 1, y = 2; x + y')).toBe(3);
    });

    test('allows reassignment', async () => {
      expect(await evaluate<number>({}, 'let x = 1; x = 2; x')).toBe(2);
    });
  });

  describe('functions', () => {
    test('declares and calls functions', async () => {
      const code = `
        function add(a, b) {
          return a + b;
        }
        add(2, 3)
      `;
      expect(await evaluate<number>({}, code)).toBe(5);
    });

    test('supports function expressions', async () => {
      const code = `
        let multiply = function(a, b) {
          return a * b;
        };
        multiply(4, 5)
      `;
      expect(await evaluate<number>({}, code)).toBe(20);
    });

    test('handles nested functions and closures', async () => {
      const code = `
        function makeAdder(x) {
          return function(y) {
            return x + y;
          };
        }
        let add5 = makeAdder(5);
        add5(3)
      `;
      expect(await evaluate<number>({}, code)).toBe(8);
    });

    test('handles recursive functions', async () => {
      const code = `
        function factorial(n) {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
        factorial(5)
      `;
      expect(await evaluate<number>({}, code)).toBe(120);
    });

    test('handles spread arguments in function calls', async () => {
      const code = `
        let sum = function(...args) {
          return args[0] + args[1] + args[2] + args[3] + args[4];
        };
        sum(1, 2, 3, 4, 5)
      `;
      expect(await evaluate<number>({}, code)).toBe(15);
    });

    test('handles spreading arrays into function arguments', async () => {
      const code = `
        function sum(a, b, c) {
          return a + b + c;
        }
        const numbers = [1, 2, 3];
        sum(...numbers)
      `;
      expect(await evaluate<number>({}, code)).toBe(6);
    });

    test('supports mixed regular and spread arguments', async () => {
      const code = `
        function join(separator, ...parts) {
          return parts.join(separator);
        }
        const words = ['world', '!'];
        join('-', 'hello', ...words)
      `;
      expect(await evaluate<string>({}, code)).toBe('hello-world-!');
    });
  });

  describe('control flow', () => {
    test('handles if statements', async () => {
      expect(await evaluate<number>({}, 'let x = 5; if (x > 3) { x = 10; } x')).toBe(10);
      expect(
        await evaluate<number>({}, 'let x = 2; if (x > 3) { x = 10; } else { x = 0; } x')
      ).toBe(0);
    });

    test('handles while loops', async () => {
      const code = `
        let sum = 0;
        let i = 1;
        while (i <= 5) {
          sum = sum + i;
          i = i + 1;
        }
        sum
      `;
      expect(await evaluate<number>({}, code)).toBe(15);
    });

    test('handles complex control flow', async () => {
      const code = `
        function sumEven(n) {
          let sum = 0;
          let i = 0;
          while (i <= n) {
            if (i % 2 === 0) {
              sum = sum + i;
            }
            i = i + 1;
          }
          return sum;
        }
        sumEven(6)
      `;
      expect(await evaluate<number>({}, code)).toBe(12);
    });
  });

  describe('scoping', () => {
    test('handles block scope', async () => {
      const code = `
        let x = 1;
        {
          let x = 2;
          x = 3;
        }
        x
      `;
      expect(await evaluate<number>({}, code)).toBe(1);
    });

    test('handles function scope', async () => {
      const code = `
        let x = 1;
        function test() {
          let x = 2;
          return x;
        }
        test();
        x
      `;
      expect(await evaluate<number>({}, code)).toBe(1);
    });

    test('accesses outer scope variables', async () => {
      const code = `
        let x = 1;
        function addX(y) {
          return x + y;
        }
        addX(2)
      `;
      expect(await evaluate<number>({}, code)).toBe(3);
    });
  });

  describe('async/await', () => {
    test('supports async functions', async () => {
      const code = `
        async function delay(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        }
        async function test() {
          await delay(100);
          return 42;
        }
        test()
      `;
      const result = await evaluate<Promise<number>>({}, code);
      expect(result).toBe(42);
    });

    test('handles async/await with promises', async () => {
      const code = `
        async function fetchData() {
          return Promise.resolve({ data: 'test' });
        }
        async function process() {
          const result = await fetchData();
          return result.data;
        }
        process()
      `;
      const result = await evaluate<Promise<string>>({}, code);
      expect(result).toBe('test');
    });

    test('supports multiple await expressions', async () => {
      const code = `
        async function getData(id) {
          return Promise.resolve(id * 2);
        }
        async function processAll() {
          const a = await getData(1);
          const b = await getData(2);
          return a + b;
        }
        processAll()
      `;
      const result = await evaluate<Promise<number>>({}, code);
      expect(result).toBe(6);
    });

    test('handles async function expressions', async () => {
      const code = `
        const compute = async function(x) {
          await Promise.resolve();
          return x * 2;
        };
        compute(5)
      `;
      const result = await evaluate<Promise<number>>({}, code);
      expect(result).toBe(10);
    });

    test('supports async arrow functions', async () => {
      const code = `
        const double = async x => {
          await Promise.resolve();
          return x * 2;
        };
        double(3)
      `;
      const result = await evaluate<Promise<number>>({}, code);
      expect(result).toBe(6);
    });

    test('handles async error handling', async () => {
      const code = `
        async function throwError() {
          throw new Error('Test error');
        }
        async function handleError() {
          try {
            await throwError();
            return 'success';
          } catch (e) {
            return 'error caught';
          }
        }
        handleError()
      `;
      const result = await evaluate<Promise<string>>({}, code);
      expect(result).toBe('error caught');
    });

    test('supports Promise.all', async () => {
      const code = `
        async function getData(id) {
          return Promise.resolve(id);
        }
        async function parallel() {
          const results = await Promise.all([
            getData(1),
            getData(2),
            getData(3)
          ]);
          return results.reduce((a, b) => a + b, 0);
        }
        parallel()
      `;
      const result = await evaluate<Promise<number>>({}, code);
      expect(result).toBe(6);
    });

    test('supports spread with async functions', async () => {
      const code = `
        async function getData(...ids) {
          return Promise.all(ids.map(id => Promise.resolve(id * 2)));
        }
        async function test() {
          const numbers = [1, 2, 3];
          return await getData(...numbers);
        }
        test()
      `;
      const result = await evaluate<Promise<number[]>>({}, code);
      expect(result).toEqual([2, 4, 6]);
    });
  });

  describe('spread operator corner cases', () => {
    test('handles multiple spreads in function calls', async () => {
      const code = `
        function concat(...args) {
          return args;
        }
        const arr1 = [1, 2];
        const arr2 = [3, 4];
        concat(...arr1, ...arr2, 5)
      `;
      expect(await evaluate<number[]>({}, code)).toEqual([1, 2, 3, 4, 5]);
    });

    test('handles spread in constructor calls', async () => {
      const code = `
        function createPoint(coords) {
          const result = {};
          result.x = coords[0];
          result.y = coords[1];
          return result;
        }
        const coords = [10, 20];
        createPoint(coords)
      `;
      const result = await evaluate<any>({}, code);
      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
    });
  });
});
