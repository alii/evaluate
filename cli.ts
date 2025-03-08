#!/usr/bin/env bun

import * as acorn from 'acorn';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import pkg from './package.json' with { type: 'json' };
import { evaluate } from './src/evaluator.ts';
  
const args = process.argv.slice(2);
const globalContext = {
  isEvaluate: true,
  console: {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  },
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
 * History handler for the REPL
 */
class History {
  private history: string[] = [];
  private position: number = 0;
  private historyFile: string;
  private maxHistory: number = 1000;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const scraggyDir = join(homeDir, '.scraggy');

    if (!existsSync(scraggyDir)) {
      mkdirSync(scraggyDir, { recursive: true });
    }

    this.historyFile = join(scraggyDir, 'history.json');
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      if (existsSync(this.historyFile)) {
        const content = readFileSync(this.historyFile, 'utf-8');
        this.history = JSON.parse(content);
        this.position = this.history.length;
      }
    } catch (error: any) {
      console.error(`Error loading history: ${error?.message || String(error)}`);

      this.history = [];
      this.position = 0;
    }
  }

  private saveHistory(): void {
    try {
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }
      writeFileSync(this.historyFile, JSON.stringify(this.history));
    } catch (error: any) {
      console.error(`Error saving history: ${error?.message || String(error)}`);
    }
  }

  add(entry: string): void {
    if (
      entry.trim() === '' ||
      (this.history.length > 0 && this.history[this.history.length - 1] === entry)
    ) {
      return;
    }

    this.history.push(entry);
    this.position = this.history.length;
    this.saveHistory();
  }

  get entries(): string[] {
    return [...this.history];
  }
}

/**
 * Starts an interactive Read-Eval-Print Loop with standard readline
 */
async function startREPL() {
  console.log('\n🦆 Scraggy REPL v' + pkg.version);
  console.log('Type .exit or press Ctrl+C to exit\n');

  const replContext = { ...globalContext };

  const history = new History();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    historySize: 1000,

    history: history.entries,
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
        history.add(buffer);
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
