import {describe, expect, test} from 'bun:test';
import {evaluate} from '../src/evaluator.ts';

// Helper for creating consistent test environments
function getAsyncTestGlobals() {
  return {
    Promise,
    Error,
    setTimeout,
    clearTimeout
  };
}

describe('async operations', () => {
  describe('promises', () => {
    test('basic promise creation and resolution', async () => {
      const code = `
        const promise = new Promise(resolve => {
          resolve('success');
        });
        
        promise
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('success');
    });

    test('promise rejection', async () => {
      const code = `
        const promise = new Promise((resolve, reject) => {
          reject(new Error('failure'));
        }).catch(err => err.message);
        
        promise
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('failure');
    });

    test('promise chaining', async () => {
      const code = `
        const promise = Promise.resolve(1)
          .then(value => value + 1)
          .then(value => value * 2)
          .then(value => \`Result: \${value}\`);
        
        promise
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Result: 4');
    });

    test('error handling in promise chains', async () => {
      const code = `
        const promise = Promise.resolve()
          .then(() => {
            throw new Error('Something went wrong');
          })
          .then(() => 'This will be skipped')
          .catch(err => \`Caught: \${err.message}\`)
          .then(msg => \`Final: \${msg}\`);
        
        promise
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Final: Caught: Something went wrong');
    });

    test('promise all', async () => {
      const code = `
        const promises = [
          Promise.resolve(1),
          Promise.resolve(2),
          Promise.resolve(3)
        ];
        
        const result = await Promise.all(promises);
        result
      `;
      
      expect(await evaluate<number[]>(getAsyncTestGlobals(), code)).toEqual([1, 2, 3]);
    });

    test('promise race', async () => {
      const code = `
        const slow = new Promise(resolve => {
          setTimeout(() => resolve('slow'), 100);
        });
        
        const fast = new Promise(resolve => {
          setTimeout(() => resolve('fast'), 10);
        });
        
        const result = await Promise.race([slow, fast]);
        result
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('fast');
    });

    test('async iterations with timers', async () => {
      const code = `
        async function delayedCounter() {
          let count = 0;
          
          for (let i = 0; i < 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 10));
            count++;
          }
          
          return count;
        }
        
        delayedCounter()
      `;
      
      expect(await evaluate<number>(getAsyncTestGlobals(), code)).toBe(3);
    });
  });

  describe('async/await', () => {
    test('basic async/await', async () => {
      const code = `
        async function fetchData() {
          return 'data';
        }
        
        async function process() {
          const data = await fetchData();
          return \`Processed: \${data}\`;
        }
        
        process()
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Processed: data');
    });

    test('async error handling with try/catch', async () => {
      const code = `
        async function failingOperation() {
          throw new Error('Operation failed');
        }
        
        async function handleErrors() {
          try {
            await failingOperation();
            return 'Success';
          } catch (error) {
            return \`Error: \${error.message}\`;
          }
        }
        
        handleErrors()
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Error: Operation failed');
    });

    test('multiple awaits in sequence', async () => {
      const code = `
        async function operation(id, delay = 10) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return \`Result \${id}\`;
        }
        
        async function sequentialOperations() {
          const result1 = await operation(1);
          const result2 = await operation(2);
          const result3 = await operation(3);
          
          return [result1, result2, result3];
        }
        
        sequentialOperations()
      `;
      
      expect(await evaluate<string[]>(getAsyncTestGlobals(), code)).toEqual([
        'Result 1', 'Result 2', 'Result 3'
      ]);
    });

    test('concurrent operations with Promise.all', async () => {
      const code = `
        async function operation(id, delay = 10) {
          await new Promise(resolve => setTimeout(resolve, delay));
          return \`Result \${id}\`;
        }
        
        async function concurrentOperations() {
          const promises = [
            operation(1),
            operation(2),
            operation(3)
          ];
          
          const results = await Promise.all(promises);
          return results;
        }
        
        concurrentOperations()
      `;
      
      expect(await evaluate<string[]>(getAsyncTestGlobals(), code)).toEqual([
        'Result 1', 'Result 2', 'Result 3'
      ]);
    });

    test('async functions returning values directly', async () => {
      const code = `
        async function immediate() {
          return 42;
        }
        
        immediate()
      `;
      
      expect(await evaluate<number>(getAsyncTestGlobals(), code)).toBe(42);
    });

    test('async functions with delays', async () => {
      const code = `
        async function delayValue(value, ms = 10) {
          await new Promise(resolve => setTimeout(resolve, ms));
          return value;
        }
        
        delayValue('delayed result')
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('delayed result');
    });

    test('async IIFE (Immediately Invoked Function Expression)', async () => {
      const code = `
        (async function() {
          const result = await Promise.resolve('From IIFE');
          return result;
        })()
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('From IIFE');
    });

    test('async arrow functions', async () => {
      const code = `
        const delayedGreeting = async (name) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return \`Hello, \${name}!\`;
        };
        
        delayedGreeting('World')
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Hello, World!');
    });
  });

  describe('advanced async patterns', () => {
    test('promise timeout pattern', async () => {
      const code = `
        function timeout(ms) {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Operation timed out')), ms);
          });
        }
        
        function fetchWithTimeout(ms) {
          return Promise.race([
            new Promise(resolve => setTimeout(() => resolve('Data'), 10)),
            timeout(ms)
          ]);
        }
        
        async function test() {
          try {
            // This should succeed as the fetch (10ms) is faster than timeout (50ms)
            const successResult = await fetchWithTimeout(50);
            
            return successResult;
          } catch (error) {
            return error.message;
          }
        }
        
        test()
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Data');
    });

    test('sequential vs parallel performance', async () => {
      const code = `
        async function operation(ms) {
          await new Promise(resolve => setTimeout(resolve, ms));
          return ms;
        }
        
        async function sequential() {
          const start = Date.now();
          
          await operation(10);
          await operation(10);
          await operation(10);
          
          return Date.now() - start;
        }
        
        async function parallel() {
          const start = Date.now();
          
          await Promise.all([
            operation(10),
            operation(10),
            operation(10)
          ]);
          
          return Date.now() - start;
        }
        
        async function compare() {
          const sequentialTime = await sequential();
          const parallelTime = await parallel();
          
          return { 
            faster: parallelTime < sequentialTime ? 'parallel' : 'sequential',
            sequentialTime,
            parallelTime 
          };
        }
        
        compare()
      `;
      
      const globals = {
        ...getAsyncTestGlobals(),
        Date
      };
      
      const result = await evaluate<any>(globals, code);
      expect(result.faster).toBe('parallel');
    });

    test('async iteration', async () => {
      const code = `
        async function processItems(items) {
          const results = [];
          
          for (const item of items) {
            const processed = await new Promise(resolve => {
              setTimeout(() => resolve(\`Processed \${item}\`), 5);
            });
            
            results.push(processed);
          }
          
          return results;
        }
        
        processItems(['a', 'b', 'c'])
      `;
      
      expect(await evaluate<string[]>(getAsyncTestGlobals(), code)).toEqual([
        'Processed a', 'Processed b', 'Processed c'
      ]);
    });

    test('async map pattern', async () => {
      const code = `
        async function asyncMap(array, asyncFn) {
          return Promise.all(array.map(asyncFn));
        }
        
        async function processItem(item) {
          await new Promise(resolve => setTimeout(resolve, 5));
          return item.toUpperCase();
        }
        
        asyncMap(['a', 'b', 'c'], processItem)
      `;
      
      expect(await evaluate<string[]>(getAsyncTestGlobals(), code)).toEqual(['A', 'B', 'C']);
    });

    test('promise chaining with different value types', async () => {
      const code = `
        Promise.resolve(5)
          .then(num => num * 2)
          .then(num => [num, num + 1, num + 2])
          .then(array => ({ array, sum: array.reduce((sum, n) => sum + n, 0) }))
          .then(obj => \`Array: [\${obj.array.join(', ')}], Sum: \${obj.sum}\`)
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Array: [10, 11, 12], Sum: 33');
    });

    test('async error propagation', async () => {
      const code = `
        async function level3() {
          throw new Error('Error at level 3');
        }
        
        async function level2() {
          await level3();
        }
        
        async function level1() {
          try {
            await level2();
            return 'No error';
          } catch (error) {
            return \`Caught at level 1: \${error.message}\`;
          }
        }
        
        level1()
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Caught at level 1: Error at level 3');
    });

    test('async recursion', async () => {
      const code = `
        async function countdown(n) {
          if (n <= 0) return 'Done';
          await new Promise(resolve => setTimeout(resolve, 5));
          return await countdown(n - 1);
        }
        
        countdown(5)
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Done');
    });
  });

  describe('timing functions', () => {
    test('basic setTimeout', async () => {
      const code = `
        let result = 'initial';
        
        await new Promise(resolve => {
          setTimeout(() => {
            result = 'changed';
            resolve(null);
          }, 10);
        });
        
        result
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('changed');
    });

    test('clearTimeout', async () => {
      const code = `
        let called = false;
        
        const timerId = setTimeout(() => {
          called = true;
        }, 50);
        
        clearTimeout(timerId);
        
        // Give it time to make sure the timeout doesn't fire
        await new Promise(resolve => setTimeout(resolve, 60));
        
        called
      `;
      
      expect(await evaluate<boolean>(getAsyncTestGlobals(), code)).toBe(false);
    });

    test('nested timeouts', async () => {
      const code = `
        let sequence = [];
        
        await new Promise(resolve => {
          setTimeout(() => {
            sequence.push(1);
            
            setTimeout(() => {
              sequence.push(2);
              
              setTimeout(() => {
                sequence.push(3);
                resolve(null);
              }, 10);
            }, 10);
          }, 10);
        });
        
        sequence
      `;
      
      expect(await evaluate<number[]>(getAsyncTestGlobals(), code)).toEqual([1, 2, 3]);
    });

    test('setTimeout with function arguments', async () => {
      const code = `
        let result;
        
        await new Promise(resolve => {
          setTimeout((a, b) => {
            result = a + b;
            resolve(null);
          }, 10, 'Hello, ', 'World!');
        });
        
        result
      `;
      
      expect(await evaluate<string>(getAsyncTestGlobals(), code)).toBe('Hello, World!');
    });
  });
});