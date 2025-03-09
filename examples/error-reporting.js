import { evaluate } from '../src/evaluator.ts';

// Example 1: Syntax Error
console.log('Example 1: Syntax Error\n');
try {
  const code = `
const x = 1;
const y = 2;
const z = x +* y; // Invalid syntax
const sum = x + y;
`;
  await evaluate({}, code);
} catch (error) {
  console.error(error.message);
}

console.log('\n--------------------------------------\n');

// Example 2: Reference Error
console.log('Example 2: Reference Error\n');
try {
  const code = `
const x = 10;
const y = 20;
const z = x + undefinedVariable; // Reference error
`;
  await evaluate({}, code);
} catch (error) {
  console.error(error.message);
}

console.log('\n--------------------------------------\n');

// Example 3: Type Error
console.log('Example 3: Type Error\n');
try {
  const code = `
const x = 'string';
x.nonExistentMethod(); // Type error
`;
  await evaluate({}, code);
} catch (error) {
  console.error(error.message);
}