import {evaluate} from '../src';

// Security sandbox example
// Shows how Scraggy restricts global access

// Part 1: Try without any globals provided
const code1 = `
// Try to access different globals
let results = {};

try {
  console.log("This shouldn't work");
} catch (error) {
  results.console = error.message;
}

try {
  setTimeout(() => {}, 1000);
} catch (error) {
  results.setTimeout = error.message;
}

try {
  Math.random();
} catch (error) {
  results.math = error.message;
}

try {
  new Date();
} catch (error) {
  results.date = error.message;
}

try {
  JSON.stringify({a: 1});
} catch (error) {
  results.json = error.message;
}

results;
`;

console.log('Without globals:');
console.log(await evaluate({}, code1));

// Part 2: Now with safe globals explicitly provided
const safeGlobals = {
  console: {
    log: (...args) => console.log('SAFE:', ...args)
  },
  Math: {
    random: () => 0.42 // Deterministic random
  }
};

const code2 = `
// Using explicitly provided globals
console.log("This works now!");
const randomValue = Math.random();

{
  message: "Globals are accessible when explicitly provided",
  random: randomValue 
}
`;

console.log('\nWith explicit globals:');
console.log(await evaluate(safeGlobals, code2));