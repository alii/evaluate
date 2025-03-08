import { getRuntimeFunction } from './evaluator.ts';
import { MemoryTracker } from './memory.ts';
import { RuntimeFunction } from './runtime.ts';

export class Scope {
  public static DEFAULT_SCOPE = {
    Promise,
    Error,
    ReferenceError,
    SyntaxError,
    TypeError,
    setTimeout,
    setInterval,
    console,
  };

  private variables: Map<string, any>;
  private parent: Scope | null;
  private children: Set<Scope>;
  private refCount: number;
  private functions: Set<RuntimeFunction>;

  constructor(parentScope: Scope | null = null, initial: Record<string, any> = {}) {
    this.variables = new Map(Object.entries(initial));
    this.parent = parentScope;
    this.children = new Set();
    this.functions = new Set();
    this.refCount = 1;

    if (parentScope) {
      parentScope.addChild(this);
    } else {
      this.defineFromObject(Scope.DEFAULT_SCOPE);
    }

    MemoryTracker.getInstance().trackScope(this);
  }

  defineFromObject(scope: Record<string, any>) {
    for (const key in scope) {
      this.define(key, scope[key]);
    }
  }

  trackFunction(func: RuntimeFunction): void {
    this.functions.add(func);
  }

  untrackFunction(func: RuntimeFunction): void {
    this.functions.delete(func);
  }

  addRef(): void {
    this.refCount++;
  }

  release(): void {
    this.refCount--;
    if (this.refCount === 0) {
      this.cleanup();
    }
  }

  private addChild(child: Scope): void {
    this.children.add(child);
    this.addRef();
  }

  private removeChild(child: Scope): void {
    if (this.children.delete(child)) {
      this.release();
    }
  }

  private cleanup(): void {
    for (const value of this.variables.values()) {
      if (value instanceof RuntimeFunction) {
        value.destroy();
      } else if (value && typeof value === 'function') {
        const runtimeFunc = getRuntimeFunction(value);
        if (runtimeFunc) {
          runtimeFunc.destroy();
        }
      }
    }
    this.variables.clear();

    for (const func of this.functions) {
      func.destroy();
    }
    this.functions.clear();

    if (this.parent) {
      this.parent.removeChild(this);
    }

    for (const child of this.children) {
      child.release();
    }

    this.children.clear();

    MemoryTracker.getInstance().untrackScope(this);
  }

  define(name: string, value: any): void {
    const oldValue = this.variables.get(name);
    if (oldValue instanceof RuntimeFunction) {
      oldValue.destroy();
    } else if (oldValue && typeof oldValue === 'function') {
      const runtimeFunc = getRuntimeFunction(oldValue);
      if (runtimeFunc) {
        runtimeFunc.destroy();
      }
    }

    this.variables.set(name, value);

    if (value instanceof RuntimeFunction) {
      this.trackFunction(value);
    } else if (value && typeof value === 'function') {
      const runtimeFunc = getRuntimeFunction(value);
      if (runtimeFunc) {
        this.trackFunction(runtimeFunc);
      }
    }
  }

  assign(name: string, value: any): boolean {
    if (this.variables.has(name)) {
      const oldValue = this.variables.get(name);
      if (oldValue instanceof RuntimeFunction) {
        oldValue.destroy();
      } else if (oldValue && typeof oldValue === 'function') {
        const runtimeFunc = getRuntimeFunction(oldValue);
        if (runtimeFunc) {
          runtimeFunc.destroy();
        }
      }

      this.variables.set(name, value);

      if (value instanceof RuntimeFunction) {
        this.trackFunction(value);
      } else if (value && typeof value === 'function') {
        const runtimeFunc = getRuntimeFunction(value);
        if (runtimeFunc) {
          this.trackFunction(runtimeFunc);
        }
      }

      return true;
    }
    if (this.parent) {
      return this.parent.assign(name, value);
    }
    return false;
  }

  lookup(name: string): any {
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    return undefined;
  }
}
