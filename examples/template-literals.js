import {evaluate} from '../src';

// Template literals example
const globalObject = {};

const code = `
// Basic template literals
const name = "Alice";
const greeting = \`Hello, \${name}!\`;

// With expressions
const a = 5;
const b = 10;
const sum = \`\${a} + \${b} = \${a + b}\`;

// Multi-line template
const multiLine = \`First line
Second line
Third line\`;

// With function calls
function formatName(first, last) {
  return \`\${first} \${last}\`;
}
const full = \`Welcome, \${formatName("John", "Doe")}!\`;

// With conditional expressions
const age = 20;
const message = \`You are \${age >= 18 ? "an adult" : "a minor"}\`;

// With array methods
const numbers = [1, 2, 3, 4, 5];
const squares = \`Squares: \${numbers.map(n => n * n).join(", ")}\`;

// Return results
{
  basic: greeting,
  withExpressions: sum,
  multiLine: multiLine.split("\\n").length,
  withFunctions: full,
  withConditionals: message,
  withArrays: squares
}
`;

console.log(await evaluate(globalObject, code));