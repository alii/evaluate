import * as acorn from 'acorn';
import { ReturnValue, RuntimeFunction } from './runtime.ts';
import { Scope } from './scope.ts';

export type GlobalObject = Record<string, any>;

/**
 * Type guard function to ensure a value is of a specific type
 * @param value The value to check
 * @param check A function that checks if the value is of the expected type
 * @param errorMessage Error message to throw if the value is not of the expected type
 * @returns The value with the correct type
 */
function ensure<In, T extends In>(
  value: In,
  check: (val: In) => val is T,
  errorMessage: string
): T {
  if (!check(value)) {
    throw new Error(errorMessage);
  }

  return value;
}

/**
 * Evaluates JavaScript code without using the built-in eval function
 * @param globalObj The global object context to use when evaluating
 * @param script The JavaScript code to evaluate
 * @returns The result of evaluating the script
 */
export async function evaluate<T>(globalObj: GlobalObject, script: string): Promise<T | undefined> {
  const ast = acorn.parse(script, {
    ecmaVersion: 2025,
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  });

  return evaluateAST(globalObj, ast);
}

export async function evaluateAST(globalObj: GlobalObject, ast: acorn.Program) {
  const globalScope = new Scope(null, globalObj);

  try {
    let result: any = undefined;
    for (const statement of ast.body) {
      if (isModuleDeclaration(statement)) {
        throw new Error('Module declarations are not supported');
      }

      result = await evaluateNode(statement, globalScope);
    }

    return result;
  } finally {
    globalScope.release();
  }
}

function isModuleDeclaration(statement: acorn.Statement | acorn.ModuleDeclaration) {
  return (
    statement.type === 'ImportDeclaration' ||
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration' ||
    statement.type === 'ExportAllDeclaration'
  );
}

async function evaluateNode(node: acorn.Expression | acorn.Statement, scope: Scope): Promise<any> {
  switch (node.type) {
    case 'ExpressionStatement':
      return evaluateNode(node.expression, scope);

    case 'BlockStatement': {
      const blockScope = new Scope(scope);
      try {
        let blockResult: any;
        for (const statement of node.body) {
          blockResult = await evaluateNode(statement, blockScope);
        }
        return blockResult;
      } finally {
        blockScope.release();
      }
    }

    case 'AwaitExpression': {
      const awaitValue = await evaluateNode(node.argument, scope);
      return await awaitValue;
    }

    case 'VariableDeclaration':
      for (const declarator of node.declarations) {
        if (declarator.id.type !== 'Identifier') {
          throw new Error('Only identifier variable declarations are supported');
        }
        const initValue = declarator.init ? await evaluateNode(declarator.init, scope) : undefined;
        scope.define(declarator.id.name, initValue);
      }
      return undefined;

    case 'FunctionDeclaration': {
      if (!node.id) throw new Error('Function declaration must have a name');
      const funcName = node.id.name;
      const funcParams = node.params.map(param => {
        if (param.type === 'Identifier') {
          return { name: param.name, isRest: false };
        } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
          return { name: param.argument.name, isRest: true };
        } else {
          throw new Error('Only identifier and rest parameters are supported');
        }
      });
      const isAsync = node.async || false;
      const runtimeFunc = new RuntimeFunction(funcParams, node.body, scope, evaluateNode, isAsync);
      const func = createWrappedFunction(runtimeFunc);
      scope.define(funcName, func);
      return undefined;
    }

    case 'ReturnStatement': {
      const returnValue = node.argument ? await evaluateNode(node.argument, scope) : undefined;
      throw new ReturnValue(returnValue);
    }

    case 'IfStatement': {
      const test = await evaluateNode(node.test, scope);
      if (test) {
        return evaluateNode(node.consequent, scope);
      } else if (node.alternate) {
        return evaluateNode(node.alternate, scope);
      }
      return undefined;
    }

    case 'WhileStatement': {
      let whileResult: any;
      while (await evaluateNode(node.test, scope)) {
        whileResult = await evaluateNode(node.body, scope);
      }
      return whileResult;
    }

    case 'TryStatement': {
      try {
        return await evaluateNode(node.block, scope);
      } catch (error) {
        if (node.handler) {
          const catchScope = new Scope(scope);
          if (node.handler.param?.type === 'Identifier') {
            catchScope.define(node.handler.param.name, error);
          }
          return await evaluateNode(node.handler.body, catchScope);
        }
        throw error;
      } finally {
        if (node.finalizer) {
          await evaluateNode(node.finalizer, scope);
        }
      }
    }

    case 'NewExpression': {
      const constructor = await evaluateNode(node.callee, scope);

      const flatArgs: any[] = [];
      for (const arg of node.arguments) {
        if (arg.type === 'SpreadElement') {
          const spreadArg = await evaluateNode(arg.argument, scope);
          if (Array.isArray(spreadArg)) {
            flatArgs.push(...spreadArg);
          } else {
            throw new Error('Spread argument must be an array');
          }
        } else {
          flatArgs.push(await evaluateNode(arg, scope));
        }
      }

      if (typeof constructor !== 'function') {
        throw new TypeError('Constructor must be a function');
      }

      return new constructor(...flatArgs);
    }

    case 'ArrowFunctionExpression': {
      const arrowParams = node.params.map(param => {
        if (param.type === 'Identifier') {
          return { name: param.name, isRest: false };
        } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
          return { name: param.argument.name, isRest: true };
        } else {
          throw new Error('Only identifier and rest parameters are supported');
        }
      });

      const runtimeFunc = new RuntimeFunction(
        arrowParams,
        node.body,
        scope,
        evaluateNode,
        node.async || false
      );

      return createWrappedFunction(runtimeFunc);
    }

    case 'AssignmentExpression': {
      if (node.left.type === 'Identifier') {
        const assignValue = await evaluateNode(node.right, scope);
        if (!scope.assign(node.left.name, assignValue)) {
          throw new Error(`Cannot assign to undefined variable ${node.left.name}`);
        }
        return assignValue;
      } else if (node.left.type === 'MemberExpression') {
        if (node.left.object.type === 'Super') {
          throw new Error('Super is not supported for AssignmentExpression');
        }

        if (node.left.property.type === 'PrivateIdentifier') {
          throw new Error('Private identifiers are not supported for AssignmentExpression');
        }

        const obj = await evaluateNode(node.left.object, scope);
        const prop = node.left.computed
          ? await evaluateNode(node.left.property, scope)
          : ensure(
              node.left.property,
              (val): val is acorn.Identifier =>
                val !== null &&
                typeof val === 'object' &&
                'type' in val &&
                val.type === 'Identifier',
              'Expected an identifier in non-computed MemberExpression'
            ).name;

        const memberValue = await evaluateNode(node.right, scope);
        obj[prop] = memberValue;
        return memberValue;
      }
      throw new Error('Unsupported assignment target');
    }

    case 'Literal':
      return node.value;

    case 'Identifier': {
      if (node.name === 'undefined') return undefined;
      const identValue = scope.lookup(node.name);

      if (identValue === undefined && !scope.lookup(node.name)) {
        throw new Error(`Reference Error: ${node.name} is not defined`);
      }

      return identValue;
    }

    case 'BinaryExpression':
      return evaluateBinaryExpression(node, scope);

    case 'MemberExpression':
      return evaluateMemberExpression(node, scope);

    case 'CallExpression': {
      if (node.callee.type === 'Super') {
        throw new Error('Super is not supported for CallExpression');
      }

      const callee = await evaluateNode(node.callee, scope);

      const flatArgs: any[] = [];
      for (const arg of node.arguments) {
        if (arg.type === 'SpreadElement') {
          const spreadArg = await evaluateNode(arg.argument, scope);
          if (Array.isArray(spreadArg)) {
            flatArgs.push(...spreadArg);
          } else {
            throw new Error('Spread argument must be an array');
          }
        } else {
          flatArgs.push(await evaluateNode(arg, scope));
        }
      }

      if (callee instanceof RuntimeFunction) {
        return callee.call(null, flatArgs);
      }

      if (typeof callee === 'function') {
        if (node.callee.type === 'MemberExpression') {
          const obj = await evaluateNode(
            ensure(
              node.callee.object,
              (val): val is acorn.Expression =>
                val !== null && typeof val === 'object' && 'type' in val && val.type !== 'Super',
              'Super is not supported in MemberExpression object'
            ),
            scope
          );

          if (obj === Promise && callee === Promise.all) {
            const promises = flatArgs[0];
            if (!Array.isArray(promises)) {
              throw new TypeError('Promise.all argument must be an array');
            }
            return Promise.all(
              promises.map(async p => {
                const result = await Promise.resolve(p);
                return result;
              })
            );
          }
          if (Array.isArray(obj) && callee === Array.prototype.reduce) {
            const [callback, initialValue] = flatArgs;
            if (typeof callback !== 'function' && !(callback instanceof RuntimeFunction)) {
              throw new TypeError('Array.prototype.reduce callback must be a function');
            }
            let accumulator = initialValue !== undefined ? initialValue : obj[0];
            const startIndex = initialValue !== undefined ? 0 : 1;
            for (let i = startIndex; i < obj.length; i++) {
              if (callback instanceof RuntimeFunction) {
                accumulator = await callback.call(null, [accumulator, obj[i], i, obj]);
              } else {
                accumulator = callback(accumulator, obj[i], i, obj);
              }
            }
            return accumulator;
          }
          if (obj === globalThis && callee === setTimeout) {
            const [callback, delay] = flatArgs;
            return new Promise(resolve => {
              setTimeout(() => {
                if (callback instanceof RuntimeFunction) {
                  callback.call(null, []).then(resolve);
                } else if (typeof callback === 'function') {
                  resolve(callback());
                }
              }, delay);
            });
          }
          return callee.apply(obj, flatArgs);
        }
        return callee(...flatArgs);
      }

      throw new Error('Attempted to call a non-function');
    }

    case 'ObjectExpression':
      return evaluateObjectExpression(node, scope);

    case 'ArrayExpression':
      return evaluateArrayExpression(node, scope);

    case 'UnaryExpression':
      return evaluateUnaryExpression(node, scope);

    case 'FunctionExpression': {
      const exprParams = node.params.map(param => {
        if (param.type === 'Identifier') {
          return { name: param.name, isRest: false };
        } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
          return { name: param.argument.name, isRest: true };
        } else {
          throw new Error('Only identifier and rest parameters are supported');
        }
      });

      const isAsyncExpr = node.async || false;
      const runtimeFunc = new RuntimeFunction(
        exprParams,
        node.body,
        scope,
        evaluateNode,
        isAsyncExpr
      );

      return createWrappedFunction(runtimeFunc);
    }

    case 'LogicalExpression':
      return evaluateLogicalExpression(node, scope);

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

async function evaluateBinaryExpression(node: acorn.BinaryExpression, scope: Scope): Promise<any> {
  const leftExpr = ensure(
    node.left,
    (val): val is acorn.Expression => val !== null && typeof val === 'object' && 'type' in val,
    'Invalid left operand in BinaryExpression'
  );

  const rightExpr = ensure(
    node.right,
    (val): val is acorn.Expression => val !== null && typeof val === 'object' && 'type' in val,
    'Invalid right operand in BinaryExpression'
  );

  const [leftValue, rightValue] = await Promise.all([
    evaluateNode(leftExpr, scope),
    evaluateNode(rightExpr, scope),
  ]);

  switch (node.operator) {
    case '+':
      return leftValue + rightValue;
    case '-':
      return leftValue - rightValue;
    case '*':
      return leftValue * rightValue;
    case '/':
      return leftValue / rightValue;
    case '%':
      return leftValue % rightValue;
    case '**':
      return leftValue ** rightValue;
    case '&':
      return leftValue & rightValue;
    case '|':
      return leftValue | rightValue;
    case '^':
      return leftValue ^ rightValue;
    case '<<':
      return leftValue << rightValue;
    case '>>':
      return leftValue >> rightValue;
    case '>>>':
      return leftValue >>> rightValue;
    case '==':
      return leftValue == rightValue;
    case '!=':
      return leftValue != rightValue;
    case '===':
      return leftValue === rightValue;
    case '!==':
      return leftValue !== rightValue;
    case '<':
      return leftValue < rightValue;
    case '<=':
      return leftValue <= rightValue;
    case '>':
      return leftValue > rightValue;
    case '>=':
      return leftValue >= rightValue;
    default:
      throw new Error(`Unsupported binary operator: ${node.operator}`);
  }
}

async function evaluateUnaryExpression(node: acorn.UnaryExpression, scope: Scope): Promise<any> {
  const argExpr = ensure(
    node.argument,
    (val): val is acorn.Expression => val !== null && typeof val === 'object' && 'type' in val,
    'Invalid argument type in UnaryExpression'
  );

  const argument = await evaluateNode(argExpr, scope);

  switch (node.operator) {
    case '+':
      return +argument;
    case '-':
      return -argument;
    case '!':
      return !argument;
    case '~':
      return ~argument;
    case 'typeof':
      return typeof argument;
    default:
      throw new Error(`Unsupported unary operator: ${node.operator}`);
  }
}

async function evaluateMemberExpression(node: acorn.MemberExpression, scope: Scope): Promise<any> {
  const objectExpr = ensure(
    node.object,
    (val): val is acorn.Expression =>
      val !== null && typeof val === 'object' && 'type' in val && val.type !== 'Super',
    'Super is not supported in MemberExpression'
  );

  const object = await evaluateNode(objectExpr, scope);

  if (node.computed) {
    const propertyExpr = ensure(
      node.property,
      (val): val is acorn.Expression =>
        val !== null &&
        typeof val === 'object' &&
        'type' in val &&
        val.type !== 'PrivateIdentifier',
      'PrivateIdentifier is not supported in computed MemberExpression'
    );

    const property = await evaluateNode(propertyExpr, scope);
    return object[property];
  } else {
    if (node.property.type !== 'Identifier') {
      throw new Error('Unsupported property type in MemberExpression');
    }

    return object[node.property.name];
  }
}

async function evaluateObjectExpression(node: acorn.ObjectExpression, scope: Scope): Promise<any> {
  const result: Record<string, any> = {};

  for (const prop of node.properties) {
    if (prop.type === 'Property') {
      let key: string;
      if (prop.key.type === 'Identifier') {
        key = prop.key.name;
      } else if (prop.key.type === 'Literal') {
        key = String(prop.key.value);
      } else {
        throw new Error('Unsupported object property key type: ' + prop.key.type);
      }
      const value = await evaluateNode(prop.value, scope);
      result[key] = value;
    } else {
      const spreadValue = await evaluateNode(prop.argument, scope);
      if (spreadValue !== null && typeof spreadValue === 'object') {
        Object.assign(result, spreadValue);
      } else {
        throw new Error('Spread element in object must be an object');
      }
    }
  }

  return result;
}

async function evaluateArrayExpression(node: acorn.ArrayExpression, scope: Scope): Promise<any[]> {
  const result = [];

  for (const element of node.elements) {
    if (!element) {
      result.push(undefined);
    } else if (element.type === 'SpreadElement') {
      const spreadElements = await evaluateNode(element.argument, scope);
      if (Array.isArray(spreadElements)) {
        result.push(...spreadElements);
      } else {
        throw new Error('Spread element is not iterable');
      }
    } else {
      const value = await evaluateNode(element, scope);
      if (Array.isArray(value) && element.type === 'ArrayExpression') {
        result.push(value);
      } else {
        result.push(value);
      }
    }
  }

  return result;
}

async function evaluateLogicalExpression(
  node: acorn.LogicalExpression,
  scope: Scope
): Promise<any> {
  const leftValue = await evaluateNode(node.left, scope);

  switch (node.operator) {
    case '&&':
      return leftValue ? await evaluateNode(node.right, scope) : leftValue;
    case '||':
      return leftValue ? leftValue : await evaluateNode(node.right, scope);
    case '??':
      return leftValue !== null && leftValue !== undefined
        ? leftValue
        : await evaluateNode(node.right, scope);
    default:
      throw new Error(`Unsupported logical operator: ${node.operator}`);
  }
}

const functionMap = new WeakMap<Function, RuntimeFunction>();

function createWrappedFunction(runtimeFunc: RuntimeFunction): Function {
  const wrapper = async (...args: any[]) => {
    return runtimeFunc.call(null, args);
  };

  functionMap.set(wrapper, runtimeFunc);

  return wrapper;
}

export function getRuntimeFunction(func: Function): RuntimeFunction | undefined {
  return functionMap.get(func);
}
