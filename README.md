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
import { evaluate } from 'scraggy';

// Simple evaluation with an empty context
const result = await evaluate({}, '2 + 3'); // returns 5

// Evaluation with a context object
const context = { x: 10, y: 20 };
const result = await evaluate(context, 'x + y'); // returns 30

// More complex evaluations
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

## Limitations and Unsupported Features

To avoid running into unexpected issues, be aware of the following unsupported features:

### Unsupported Syntax

- Class declarations and class expressions
- For loops (for, for...in, for...of)
- Module import/export statements
- Destructuring assignments
- Optional chaining (?.)
- Nullish coalescing (??)
- Private fields (#property)
- Super references
- Generator functions and yield
- BigInt literals
- Regular expression literals

### Partially Supported

- Spread operators in objects are supported, but the property spread logic differs slightly from standard JS
- Object method definitions use function expressions under the hood
- Only basic error handling is implemented

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
