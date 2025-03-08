#!/usr/bin/env bun

import { evaluate } from './src/evaluator.ts';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Please provide a JavaScript file to execute');
  console.error('Usage: bun cli.ts <file.js>');
  process.exit(1);
}

const filename = args[0];

const globalContext = {
  isEvaluate: true,
  console: {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  },
};

const result = await evaluate(globalContext, await Bun.file(filename).text());

if (result !== undefined) {
  console.log(result);
}
