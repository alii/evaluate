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
  isDestructuring: boolean;
  destructuringPattern?: acorn.Pattern;
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

  /**
   * Process a destructuring pattern for function parameters
   * @param pattern The destructuring pattern (ObjectPattern or ArrayPattern)
   * @param value The value to destructure
   * @param scope The scope to define variables in
   */
  private async processDestructuringParameter(
    pattern: acorn.Pattern, 
    value: any, 
    scope: Scope
  ): Promise<void> {
    if (pattern.type === 'ObjectPattern') {
      if (value === null || typeof value !== 'object') {
        throw new TypeError('Cannot destructure non-object in function parameter');
      }

      for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
          if (property.argument.type !== 'Identifier') {
            throw new Error('Rest element must be an identifier in object destructuring');
          }

          const restObj = { ...value };
          
          for (const otherProp of pattern.properties) {
            if (otherProp !== property && otherProp.type === 'Property') {
              const key =
                otherProp.key.type === 'Identifier'
                  ? otherProp.key.name
                  : otherProp.key.type === 'Literal'
                  ? String(otherProp.key.value)
                  : undefined;

              if (key) {
                delete restObj[key];
              }
            }
          }

          scope.define(property.argument.name, restObj);
        } else if (property.type === 'Property') {
          let key: string;

          if (property.key.type === 'Identifier') {
            key = property.key.name;
          } else if (property.key.type === 'Literal') {
            key = String(property.key.value);
          } else {
            throw new Error('Unsupported property key type in object destructuring');
          }

          if (property.value.type === 'Identifier') {
            scope.define(property.value.name, value[key]);
          } else if (property.value.type === 'ObjectPattern' || property.value.type === 'ArrayPattern') {
            await this.processDestructuringParameter(property.value, value[key], scope);
          } else {
            throw new Error('Unsupported property value type in object destructuring');
          }
        }
      }
    } else if (pattern.type === 'ArrayPattern') {
      if (!Array.isArray(value)) {
        throw new TypeError('Cannot destructure non-array in function parameter');
      }

      for (let i = 0; i < pattern.elements.length; i++) {
        const element = pattern.elements[i];
        if (!element) continue;

        if (element.type === 'Identifier') {
          scope.define(element.name, value[i]);
        } else if (element.type === 'RestElement') {
          if (element.argument.type !== 'Identifier') {
            throw new Error('Rest element must be an identifier in array destructuring');
          }

          const restValue = value.slice(i);
          scope.define(element.argument.name, restValue);
          break;
        } else if (element.type === 'ObjectPattern' || element.type === 'ArrayPattern') {
          await this.processDestructuringParameter(element, value[i], scope);
        } else {
          throw new Error('Unsupported element type in array destructuring');
        }
      }
    } else {
      throw new Error(`Unsupported destructuring pattern type: ${pattern.type}`);
    }
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
        } else if (param.isDestructuring && param.destructuringPattern) {
          await this.processDestructuringParameter(param.destructuringPattern, args[i], functionScope);
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
