import {evaluate} from '../src';

// Simple calculator example
const globalObject = {Math};

const code = `
function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
function divide(a, b) { return a / b; }

// Calculate area of a circle and hypotenuse
const circleArea = radius => Math.PI * radius * radius;
const hypotenuse = (a, b) => Math.sqrt(a*a + b*b);

// Return calculation results
const results = {
  addition: add(5, 3),            // 8
  subtraction: subtract(10, 4),   // 6
  multiplication: multiply(2, 6), // 12
  division: divide(10, 2),        // 5
  circleArea: circleArea(5),      // 78.53975
  hypotenuse: hypotenuse(3, 4)    // 5
}

results
`;

console.log(await evaluate(globalObject, code));
