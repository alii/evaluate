<div align="center">
<img width="150" src="https://raw.githubusercontent.com/alii/scraggy/refs/heads/main/scraggy.png" />
<h1>Scraggy</h1>
</div>

A relatively safe JavaScript code evaluator that doesn't use `eval()` or `Function()`. This library parses and executes JavaScript code using an AST-based approach.

[![Tests](https://github.com/alii/scraggy/actions/workflows/bun-test.yml/badge.svg)](https://github.com/alii/scraggy/actions/workflows/bun-test.yml)

## Features

- Evaluates JavaScript code without using the built-in `eval()` or `Function()` constructor
- Supports a subset of common JavaScript language features
- Provides proper memory management and cleanup
- Uses Acorn for parsing JavaScript into an AST

## Installation

```bash
bun install scraggy
```

## Usage

```typescript
import {evaluate} from 'scraggy';

// Simple evaluation with an empty context
const result = await evaluate({}, '2 + 3'); // returns 5 (basic arithmetic works with no globals)

// Evaluation with a context object
const context = {x: 10, y: 20};
const result = await evaluate(context, 'x + y'); // returns 30

// More complex evaluations - no globals needed
const code = `
  function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  }
  factorial(5)
`;
const result = await evaluate({}, code); // returns 120
```

## Supported Features

- Literals (numbers, strings, booleans, null, undefined)
- Variables and scope handling (although there's no difference between var, const, let). There is also no hoisting
- Object and array literals
- Object property access (both dot notation and bracket notation)
- Array element access
- Function declarations and function expressions
- Arrow functions
- Rest parameters and spread operators
- Binary expressions (+, -, \*, /, %, etc.)
- Logical expressions (&&, ||, ??)
- Unary expressions (+, -, !, ~, typeof)
- if/else statements
- while loops
- try/catch/finally blocks
- async/await with Promises
- switch statements
- Class declarations and class expressions with inheritance
- Destructuring assignments (object and array)
- Super references in class methods
- Destructuring in function parameters
- Template literals with expression interpolation

## Security Features

This evaluator is designed with security in mind:

- **No Default Globals**: Unlike JavaScript's `eval()`, this evaluator does not provide ANY built-in global objects by default. This means features like `Promise`, `setTimeout`, `console` are not available unless you explicitly provide them.
- **Explicit Context**: You must explicitly provide any global objects that your code needs through the context parameter, giving you fine-grained control over what's accessible.
- **Sandboxed Execution**: The evaluator cannot access the host environment outside what you provide in the context.

## Limitations and Unsupported Features

To avoid running into unexpected issues, be aware of the following unsupported features:

### Unsupported Syntax

- For loops (for, for...in, for...of)
- Module import/export statements
- Optional chaining (?.)
- Private fields (#property)
- Generator functions and yield
- BigInt literals
- Default values in destructuring assignments

### Partially Supported

- Regular expression literals (should be provided via global context)
- Object method definitions use function expressions under the hood
- Only basic error handling is implemented
- Built-in objects like Promise, Error, Math, JSON, Date, etc. must be explicitly provided in the global context if needed
- Nullish coalescing (??) is supported in binary expressions

### Runtime Environment

- No DOM or Web API support
- Limited global object
- No access to Node.js or Bun built-in modules

## Development

To run tests:

```bash
bun test
```

To typecheck:

```bash
bun tsc --noEmit
```

## License

MIT
