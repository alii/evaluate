import {evaluate} from '../src';

// Fetch API example
const globalObject = {
	fetch,
	Promise,
	Response,
	Headers,
	console: {log: (...args) => console.log('Eval:', ...args)},
};

const code = `
// Simplified fetch wrapper
async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);
    return await response.json();
  } catch (error) {
    console.log(\`Fetch error: \${error.message}\`);
    return { error: true };
  }
}

// Using fetch in an async function
async function getTodo(id) {
  const data = await fetchJson(\`https://jsonplaceholder.typicode.com/todos/\${id}\`);
  return data;
}

// Parallel fetches with Promise.all
async function getMultipleTodos() {
  const ids = [1, 2, 3];
  const promises = ids.map(id => fetchJson(\`https://jsonplaceholder.typicode.com/todos/\${id}\`));
  
  const results = await Promise.all(promises);
  return results;
}

// Get a single todo and multiple todos in parallel
const todo = await getTodo(1);
const todos = await getMultipleTodos();

// Return results
const results = {
  singleTodo: todo,
  multipleTodos: todos.map(t => ({ id: t.id, title: t.title }))
}

results
`;

console.log(await evaluate(globalObject, code));
