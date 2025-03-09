import {evaluate} from '../src';

// Async/await example
const globalObject = {
  Promise,
  setTimeout,
  console: { log: (...args) => console.log("Eval:", ...args) }
};

const code = `
// Simple delay function with promise
async function delay(ms) {
  return new Promise(resolve => setTimeout(() => resolve(\`Waited \${ms}ms\`), ms));
}

// Function using async/await
async function getUserData(id) {
  const message = await delay(10);  // Short delay for demo
  console.log(message);
  return { id, name: \`User \${id}\` };
}

// Execute async operations
async function main() {
  // Sequential vs parallel execution
  const start = Date.now();
  
  // Sequential execution
  const user1 = await getUserData(1);
  const user2 = await getUserData(2);
  
  // Parallel execution
  const [user3, user4] = await Promise.all([
    getUserData(3),
    getUserData(4)
  ]);
  
  return {
    sequential: [user1, user2],
    parallel: [user3, user4],
    time: Date.now() - start
  };
}

main();
`;

console.log(await evaluate(globalObject, code));