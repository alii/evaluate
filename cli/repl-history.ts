import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path/posix';

export class ReplHistory {
  private history: string[] = [];
  private historyFile: string;
  private maxHistory: number = 1000;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const scraggyDir = join(homeDir, '.scraggy');

    if (!existsSync(scraggyDir)) {
      mkdirSync(scraggyDir, { recursive: true });
    }

    this.historyFile = join(scraggyDir, 'history.json');

    try {
      if (existsSync(this.historyFile)) {
        const content = readFileSync(this.historyFile, 'utf-8');
        this.history = JSON.parse(content);
      }
    } catch (error: any) {
      console.error(`Error loading history: ${error?.message || String(error)}`);

      this.history = [];
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
    this.saveHistory();
  }

  get entries(): string[] {
    return [...this.history];
  }
}
