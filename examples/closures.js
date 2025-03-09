import {evaluate} from '../src';

// Closures example
const globalObject = {};

const code = `
// Simple counter with closure
function createCounter(initialCount = 0) {
  let count = initialCount;
  
  return {
    increment: () => ++count,
    decrement: () => --count,
    getValue: () => count
  };
}

// Function factory
function createMultiplier(factor) {
  // The factor is captured in the closure
  return x => x * factor;
}

// Usage examples
const counter = createCounter(10);
counter.increment(); // 11
counter.increment(); // 12
counter.decrement(); // 11

// Create specialized functions
const double = createMultiplier(2);
const triple = createMultiplier(3);

// Private data example
function createPerson(name) {
  // This variable is private
  let _secretScore = 100;
  
  return {
    name,
    getScore: () => _secretScore,
    updateScore: (points) => {
      _secretScore += points;
    }
  };
}

const person = createPerson("Alice");
person.updateScore(-10);

// Return results
{
  counterValue: counter.getValue(),
  multipliers: {
    doubleOf5: double(5),
    tripleOf5: triple(5)
  },
  person: {
    name: person.name,
    score: person.getScore(),
    canAccessDirectly: typeof _secretScore !== 'undefined'
  }
}
`;

console.log(await evaluate(globalObject, code));