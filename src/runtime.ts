import * as acorn from 'acorn';
import { MemoryTracker } from './memory.ts';
import { Scope } from './scope.ts';

export class ReturnValue extends Error {
  constructor(public value: any) {
    super('ReturnValue');
    Object.setPrototypeOf(this, ReturnValue.prototype);
  }
}

export type FunctionParameter = {
  name: string;
  isRest: boolean;
};

export class RuntimeFunction {
  private ownerScope: Scope;
  private destroyed: boolean = false;

  constructor(
    private params: FunctionParameter[],
    private body: acorn.BlockStatement | acorn.Expression,
    private scope: Scope,
    private evaluator: (node: acorn.Expression | acorn.Statement, scope: Scope) => Promise<any>,
    private isAsync: boolean = false
  ) {
    this.scope.addRef();
    this.ownerScope = scope;
    MemoryTracker.getInstance().trackFunction(this);
    this.ownerScope.trackFunction(this);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scope.release();
    MemoryTracker.getInstance().untrackFunction(this);
    this.ownerScope.untrackFunction(this);
  }

  async call(thisArg: any, args: any[]): Promise<any> {
    if (this.destroyed) {
      throw new Error('Cannot call destroyed function');
    }

    const functionScope = new Scope(this.scope);

    try {
      for (let i = 0; i < this.params.length; i++) {
        const param = this.params[i];

        if (param.isRest) {
          const restArgs = args.slice(i);
          functionScope.define(param.name, restArgs);
          break;
        } else {
          functionScope.define(param.name, args[i]);
        }
      }

      try {
        const result = await this.evaluator(this.body, functionScope);
        return this.isAsync ? await result : result;
      } catch (e) {
        if (e instanceof ReturnValue) {
          const value = e.value;
          return this.isAsync ? await value : value;
        }
        throw e;
      }
    } finally {
      functionScope.release();
    }
  }
}
