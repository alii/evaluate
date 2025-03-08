#!/usr/bin/env bun

import * as acorn from 'acorn';
import { createInterface } from 'readline';
import pkg from '../package.json' with { type: 'json' };
import { evaluate } from '../src/evaluator.ts';
import { ReplHistory } from './repl-history.ts';

const args = process.argv.slice(2);
const globalContext = {
  isEvaluate: true,
  console: {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  },
  Promise: Promise,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
};

if (args.length === 0) {
  startREPL();
} else {
  const filename = args[0];

  try {
    const result = await evaluate(globalContext, await Bun.file(filename).text());

    if (result !== undefined) {
      console.log(result);
    }
  } catch (error: any) {
    console.error(`Error executing file: ${error?.message || String(error)}`);
    process.exit(1);
  }
}

/**
 * Starts an interactive Read-Eval-Print Loop with standard readline
 */
async function startREPL() {
  console.log(`\n🦆 Scraggy REPL v${pkg.version}`);
  console.log('Type .exit or press Ctrl+C to exit\n');

  const replContext = { ...globalContext };

  const hist = new ReplHistory();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    historySize: 1000,

    history: hist.entries,
  });

  let multilineInput = false;
  let buffer = '';

  rl.prompt();

  rl.on('line', async line => {
    if (line.trim() === '.exit') {
      console.log('Exiting...');
      process.exit(0);
    }

    buffer += line;

    try {
      try {
        acorn.parse(buffer, {
          ecmaVersion: 2025,
          sourceType: 'module',
        });
        multilineInput = false;
      } catch (error: any) {
        if (error?.message?.includes('Unexpected')) {
          multilineInput = true;
          buffer += '\n';
          rl.setPrompt('... ');
          rl.prompt();
          return;
        }
      }

      if (buffer.trim() !== '') {
        hist.add(buffer);
      }

      const result = await evaluate(replContext, buffer);

      if (result !== undefined) {
        console.log(result);
      }

      buffer = '';
      multilineInput = false;
      rl.setPrompt('> ');
    } catch (error: any) {
      console.error(`Error: ${error?.message || String(error)}`);
      buffer = '';
      multilineInput = false;
      rl.setPrompt('> ');
    }

    rl.prompt();
  });

  rl.on('SIGINT', () => {
    console.log('\nExiting...');
    process.exit(0);
  });
}
