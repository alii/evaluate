import * as acorn from 'acorn';
import { ReturnValue, RuntimeFunction } from './runtime.ts';
import { Scope } from './scope.ts';

export type GlobalObject = Record<string, any>;

type ClassContext = {
  thisObj: any;
  superClass: any;
};

let currentClassContext: ClassContext | null = null;

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
export async function evaluate<T>(globalObj: GlobalObject, script: string): Promise<T> {
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
        const initValue = declarator.init ? await evaluateNode(declarator.init, scope) : undefined;

        if (declarator.id.type === 'Identifier') {
          scope.define(declarator.id.name, initValue);
        } else if (declarator.id.type === 'ObjectPattern') {
          if (initValue === null || typeof initValue !== 'object') {
            throw new TypeError('Cannot destructure non-object');
          }

          for (const property of declarator.id.properties) {
            if (property.type === 'RestElement') {
              if (property.argument.type !== 'Identifier') {
                throw new Error('Rest element must be an identifier in object destructuring');
              }

              const restObj = { ...initValue };

              for (const otherProp of declarator.id.properties) {
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
              let value: any;

              if (property.key.type === 'Identifier') {
                key = property.key.name;
              } else if (property.key.type === 'Literal') {
                key = String(property.key.value);
              } else {
                throw new Error('Unsupported property key type in object destructuring');
              }

              if (property.value.type === 'Identifier') {
                value = initValue[key];
                scope.define(property.value.name, value);
              } else if (property.value.type === 'ObjectPattern') {
                const nestedObj = initValue[key];
                if (nestedObj === null || typeof nestedObj !== 'object') {
                  throw new TypeError(`Cannot destructure non-object property ${key}`);
                }

                for (const nestedProp of property.value.properties) {
                  if (nestedProp.type !== 'Property' || nestedProp.value.type !== 'Identifier') {
                    throw new Error(
                      'Nested object destructuring with non-identifier values not supported'
                    );
                  }

                  let nestedKey: string;
                  if (nestedProp.key.type === 'Identifier') {
                    nestedKey = nestedProp.key.name;
                  } else if (nestedProp.key.type === 'Literal') {
                    nestedKey = String(nestedProp.key.value);
                  } else {
                    throw new Error('Unsupported property key type in nested object destructuring');
                  }

                  scope.define(nestedProp.value.name, nestedObj[nestedKey]);
                }
              } else if (property.value.type === 'ArrayPattern') {
                const nestedArr = initValue[key];
                if (!Array.isArray(nestedArr)) {
                  throw new TypeError(`Cannot destructure non-array property ${key}`);
                }

                for (let i = 0; i < property.value.elements.length; i++) {
                  const element = property.value.elements[i];
                  if (!element) continue;

                  if (element.type === 'Identifier') {
                    scope.define(element.name, nestedArr[i]);
                  } else {
                    throw new Error(
                      'Nested array destructuring with non-identifier elements not supported'
                    );
                  }
                }
              } else {
                throw new Error('Unsupported property value type in object destructuring');
              }
            }
          }
        } else if (declarator.id.type === 'ArrayPattern') {
          if (!Array.isArray(initValue)) {
            throw new TypeError('Cannot destructure non-array');
          }

          for (let i = 0; i < declarator.id.elements.length; i++) {
            const element = declarator.id.elements[i];
            if (!element) continue;

            if (element.type === 'Identifier') {
              scope.define(element.name, initValue[i]);
            } else if (element.type === 'RestElement') {
              if (element.argument.type !== 'Identifier') {
                throw new Error('Rest element must be an identifier in array destructuring');
              }

              const restValue = initValue.slice(i);
              scope.define(element.argument.name, restValue);
              break;
            } else if (element.type === 'ObjectPattern') {
              const nestedObj = initValue[i];
              if (nestedObj === null || typeof nestedObj !== 'object') {
                throw new TypeError(`Cannot destructure non-object at index ${i}`);
              }

              for (const prop of element.properties) {
                if (prop.type !== 'Property' || prop.value.type !== 'Identifier') {
                  throw new Error(
                    'Nested object destructuring with non-identifier values not supported'
                  );
                }

                let key: string;
                if (prop.key.type === 'Identifier') {
                  key = prop.key.name;
                } else if (prop.key.type === 'Literal') {
                  key = String(prop.key.value);
                } else {
                  throw new Error('Unsupported property key type in nested object destructuring');
                }

                scope.define(prop.value.name, nestedObj[key]);
              }
            } else if (element.type === 'ArrayPattern') {
              const nestedArr = initValue[i];
              if (!Array.isArray(nestedArr)) {
                throw new TypeError(`Cannot destructure non-array at index ${i}`);
              }

              for (let j = 0; j < element.elements.length; j++) {
                const nestedElement = element.elements[j];
                if (!nestedElement) continue;

                if (nestedElement.type === 'Identifier') {
                  scope.define(nestedElement.name, nestedArr[j]);
                } else {
                  throw new Error('Deeply nested array destructuring not supported');
                }
              }
            }
          }
        } else {
          throw new Error(`Unsupported variable declaration pattern: ${declarator.id.type}`);
        }
      }
      return undefined;

    case 'FunctionDeclaration': {
      if (!node.id) throw new Error('Function declaration must have a name');
      const funcName = node.id.name;
      const funcParams = node.params.map((param, index) => {
        if (param.type === 'Identifier') {
          return { name: param.name, isRest: false, isDestructuring: false };
        } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
          return { name: param.argument.name, isRest: true, isDestructuring: false };
        } else if (param.type === 'ObjectPattern') {
          return {
            name: `arg${index}`,
            isRest: false,
            isDestructuring: true,
            destructuringPattern: param,
          };
        } else if (param.type === 'ArrayPattern') {
          return {
            name: `arg${index}`,
            isRest: false,
            isDestructuring: true,
            destructuringPattern: param,
          };
        } else {
          throw new Error(`Unsupported parameter type: ${param.type}`);
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

    case 'BreakStatement': {
      return undefined;
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

    case 'SwitchStatement': {
      const discriminant = await evaluateNode(node.discriminant, scope);
      const switchScope = new Scope(scope);

      try {
        let result: any;
        let matched = false;
        let fallthrough = false;

        for (let i = 0; i < node.cases.length; i++) {
          const caseClause = node.cases[i];

          if (!caseClause.test) {
            if (!matched && !fallthrough) {
              fallthrough = true;
            }
          } else {
            if (!fallthrough) {
              const testValue = await evaluateNode(caseClause.test, switchScope);

              if (discriminant === testValue) {
                matched = true;
                fallthrough = true;
              }
            }
          }

          if (fallthrough) {
            for (const statement of caseClause.consequent) {
              if (statement.type === 'BreakStatement') {
                return result;
              }

              result = await evaluateNode(statement, switchScope);
            }
          }
        }

        return result;
      } finally {
        switchScope.release();
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
      const arrowParams = node.params.map((param, index) => {
        if (param.type === 'Identifier') {
          return { name: param.name, isRest: false, isDestructuring: false };
        } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
          return { name: param.argument.name, isRest: true, isDestructuring: false };
        } else if (param.type === 'ObjectPattern') {
          return {
            name: `arg${index}`,
            isRest: false,
            isDestructuring: true,
            destructuringPattern: param,
          };
        } else if (param.type === 'ArrayPattern') {
          return {
            name: `arg${index}`,
            isRest: false,
            isDestructuring: true,
            destructuringPattern: param,
          };
        } else {
          throw new Error(`Unsupported parameter type: ${param.type}`);
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
      if (node.operator !== '=') {
        if (node.left.type === 'Identifier') {
          const leftValue = scope.lookup(node.left.name);
          if (leftValue === undefined && !scope.lookup(node.left.name)) {
            throw new Error(`Reference Error: ${node.left.name} is not defined`);
          }

          const rightValue = await evaluateNode(node.right, scope);
          let result;

          switch (node.operator) {
            case '+=':
              result = leftValue + rightValue;
              break;
            case '-=':
              result = leftValue - rightValue;
              break;
            case '*=':
              result = leftValue * rightValue;
              break;
            case '/=':
              result = leftValue / rightValue;
              break;
            case '%=':
              result = leftValue % rightValue;
              break;
            case '**=':
              result = leftValue ** rightValue;
              break;
            case '&=':
              result = leftValue & rightValue;
              break;
            case '|=':
              result = leftValue | rightValue;
              break;
            case '^=':
              result = leftValue ^ rightValue;
              break;
            case '<<=':
              result = leftValue << rightValue;
              break;
            case '>>=':
              result = leftValue >> rightValue;
              break;
            case '>>>=':
              result = leftValue >>> rightValue;
              break;
            default:
              throw new Error(`Unsupported compound assignment operator: ${node.operator}`);
          }

          if (!scope.assign(node.left.name, result)) {
            throw new Error(`Cannot assign to undefined variable ${node.left.name}`);
          }
          return result;
        } else if (node.left.type === 'MemberExpression') {
          if (node.left.object.type === 'Super') {
            throw new Error('Super is not supported for compound AssignmentExpression');
          }

          if (node.left.property.type === 'PrivateIdentifier') {
            throw new Error('Private identifiers are not supported for AssignmentExpression');
          }

          const obj = await evaluateNode(node.left.object, scope);
          const prop = node.left.computed
            ? await evaluateNode(node.left.property, scope)
            : ensure(
                node.left.property,
                val => val.type === 'Identifier',
                'Expected an identifier in non-computed MemberExpression'
              ).name;

          const leftValue = obj[prop];
          const rightValue = await evaluateNode(node.right, scope);
          let result;

          switch (node.operator) {
            case '+=':
              result = leftValue + rightValue;
              break;
            case '-=':
              result = leftValue - rightValue;
              break;
            case '*=':
              result = leftValue * rightValue;
              break;
            case '/=':
              result = leftValue / rightValue;
              break;
            case '%=':
              result = leftValue % rightValue;
              break;
            case '**=':
              result = leftValue ** rightValue;
              break;
            case '&=':
              result = leftValue & rightValue;
              break;
            case '|=':
              result = leftValue | rightValue;
              break;
            case '^=':
              result = leftValue ^ rightValue;
              break;
            case '<<=':
              result = leftValue << rightValue;
              break;
            case '>>=':
              result = leftValue >> rightValue;
              break;
            case '>>>=':
              result = leftValue >>> rightValue;
              break;
            default:
              throw new Error(`Unsupported compound assignment operator: ${node.operator}`);
          }

          obj[prop] = result;
          return result;
        } else {
          throw new Error('Compound assignment not supported for this target type');
        }
      } else {
        if (node.left.type === 'Identifier') {
          const assignValue = await evaluateNode(node.right, scope);
          if (!scope.assign(node.left.name, assignValue)) {
            throw new Error(`Cannot assign to undefined variable ${node.left.name}`);
          }
          return assignValue;
        } else if (node.left.type === 'MemberExpression') {
          const obj = await evaluateNode(
            ensure(
              node.left.object,
              val => val.type !== 'Super',
              'Super is not supported for AssignmentExpression'
            ),
            scope
          );

          if (node.left.property.type === 'PrivateIdentifier') {
            throw new Error('Private identifiers are not supported for AssignmentExpression');
          }

          const prop = node.left.computed
            ? await evaluateNode(node.left.property, scope)
            : ensure(
                node.left.property,
                val => val.type === 'Identifier',
                'Expected an identifier in non-computed MemberExpression'
              ).name;

          const memberValue = await evaluateNode(node.right, scope);

          if (obj === undefined || obj === null) {
            throw new TypeError(`Cannot set property '${prop}' of ${obj}`);
          }

          obj[prop] = memberValue;
          return memberValue;
        } else if (node.left.type === 'ObjectPattern') {
          const rightValue = await evaluateNode(node.right, scope);

          if (rightValue === null || typeof rightValue !== 'object') {
            throw new TypeError('Cannot destructure non-object in assignment');
          }

          for (const property of node.left.properties) {
            if (property.type === 'RestElement') {
              if (property.argument.type !== 'Identifier') {
                throw new Error(
                  'Rest element must be an identifier in object destructuring assignment'
                );
              }

              const restObj = { ...rightValue };

              for (const otherProp of node.left.properties) {
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

              if (!scope.assign(property.argument.name, restObj)) {
                throw new Error(`Cannot assign to undefined variable ${property.argument.name}`);
              }
            } else if (property.type === 'Property') {
              let key: string;

              if (property.key.type === 'Identifier') {
                key = property.key.name;
              } else if (property.key.type === 'Literal') {
                key = String(property.key.value);
              } else {
                throw new Error('Unsupported property key type in object destructuring assignment');
              }

              if (property.value.type === 'Identifier') {
                const value = rightValue[key];
                if (!scope.assign(property.value.name, value)) {
                  throw new Error(`Cannot assign to undefined variable ${property.value.name}`);
                }
              } else {
                throw new Error('Nested destructuring in assignment expressions not supported');
              }
            }
          }

          return rightValue;
        } else if (node.left.type === 'ArrayPattern') {
          const rightValue = await evaluateNode(node.right, scope);

          if (!Array.isArray(rightValue)) {
            throw new TypeError('Cannot destructure non-array in assignment');
          }

          for (let i = 0; i < node.left.elements.length; i++) {
            const element = node.left.elements[i];
            if (!element) continue;

            if (element.type === 'Identifier') {
              if (!scope.assign(element.name, rightValue[i])) {
                throw new Error(`Cannot assign to undefined variable ${element.name}`);
              }
            } else if (element.type === 'RestElement') {
              if (element.argument.type !== 'Identifier') {
                throw new Error(
                  'Rest element must be an identifier in array destructuring assignment'
                );
              }

              const restValue = rightValue.slice(i);
              if (!scope.assign(element.argument.name, restValue)) {
                throw new Error(`Cannot assign to undefined variable ${element.argument.name}`);
              }
              break;
            } else {
              throw new Error('Nested destructuring in assignment expressions not supported');
            }
          }

          return rightValue;
        } else {
          throw new Error(`Unsupported assignment target type: ${node.left.type}`);
        }
      }
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

    case 'ThisExpression': {
      const thisValue = scope.lookup('this');

      if (thisValue === undefined) {
        if (currentClassContext) {
          return currentClassContext.thisObj;
        }

        return undefined;
      }

      return thisValue;
    }

    case 'BinaryExpression':
      return evaluateBinaryExpression(node, scope);

    case 'MemberExpression':
      return evaluateMemberExpression(node, scope);

    case 'CallExpression': {
      if (node.callee.type === 'Super') {
        if (!currentClassContext) {
          throw new Error('Super constructor call is not properly bound to a class constructor');
        }

        const { thisObj, superClass } = currentClassContext;

        if (!superClass) {
          throw new Error('Cannot use super() in a class with no superclass');
        }

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

        try {
          Reflect.apply(superClass, thisObj, flatArgs);
        } catch (error) {
          throw new Error(`Error in super() call: ${String(error)}`);
        }

        return undefined;
      } else {
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
            if (node.callee.object.type === 'Super') {
              return callee(...flatArgs);
            }

            const obj = await evaluateNode(node.callee.object as acorn.Expression, scope);

            return callee.apply(obj, flatArgs);
          }
          return callee(...flatArgs);
        }

        throw new Error('Attempted to call a non-function');
      }
    }

    case 'ObjectExpression':
      return evaluateObjectExpression(node, scope);

    case 'ArrayExpression':
      return evaluateArrayExpression(node, scope);

    case 'UnaryExpression':
      return evaluateUnaryExpression(node, scope);

    case 'FunctionExpression': {
      const exprParams = node.params.map((param, index) => {
        if (param.type === 'Identifier') {
          return { name: param.name, isRest: false, isDestructuring: false };
        } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
          return { name: param.argument.name, isRest: true, isDestructuring: false };
        } else if (param.type === 'ObjectPattern') {
          return {
            name: `arg${index}`,
            isRest: false,
            isDestructuring: true,
            destructuringPattern: param,
          };
        } else if (param.type === 'ArrayPattern') {
          return {
            name: `arg${index}`,
            isRest: false,
            isDestructuring: true,
            destructuringPattern: param,
          };
        } else {
          throw new Error(`Unsupported parameter type: ${param.type}`);
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

    case 'ClassDeclaration': {
      if (!node.id) throw new Error('Class declaration must have a name');
      const className = node.id.name;

      const classValue = await evaluateClassDefinition(node, scope);

      scope.define(className, classValue);
      return undefined;
    }

    case 'ClassExpression': {
      return evaluateClassDefinition(node, scope);
    }

    case 'TemplateLiteral': {
      let result = '';

      for (let i = 0; i < node.quasis.length; i++) {
        result += node.quasis[i].value.cooked;

        if (i < node.expressions.length) {
          const exprValue = await evaluateNode(node.expressions[i], scope);
          result += String(exprValue);
        }
      }

      return result;
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

async function evaluateBinaryExpression(node: acorn.BinaryExpression, scope: Scope): Promise<any> {
  const [leftValue, rightValue] = await Promise.all([
    evaluateNode(
      ensure(
        node.left,
        val => val.type !== 'PrivateIdentifier',
        'PrivateIdentifier is not supported for the left of a binary expression'
      ),
      scope
    ),
    evaluateNode(node.right, scope),
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
  const argument = await evaluateNode(node.argument, scope);

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
  if (node.object.type === 'Super') {
    if (!currentClassContext) {
      throw new Error('Super reference is not properly bound to a class method');
    }

    const { thisObj, superClass } = currentClassContext;

    if (!superClass) {
      throw new Error('Cannot use super in a class with no superclass');
    }

    const superProto = Object.getPrototypeOf(Object.getPrototypeOf(thisObj));

    if (node.computed) {
      const propertyExpr = ensure(
        node.property,
        val => val.type !== 'PrivateIdentifier',
        'PrivateIdentifier is not supported in computed MemberExpression'
      );

      const property = await evaluateNode(propertyExpr, scope);

      const propValue = superProto[property];

      if (typeof propValue === 'function') {
        return propValue.bind(thisObj);
      }

      return propValue;
    } else {
      if (node.property.type !== 'Identifier') {
        throw new Error('Unsupported property type in Super MemberExpression');
      }

      const propValue = superProto[node.property.name];

      if (typeof propValue === 'function') {
        return propValue.bind(thisObj);
      }

      return propValue;
    }
  } else {
    const objectExpr = node.object as acorn.Expression;
    const object = await evaluateNode(objectExpr, scope);

    if (node.computed) {
      const propertyExpr = ensure(
        node.property,
        val => val.type !== 'PrivateIdentifier',
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

/**
 * Evaluates a class definition (either declaration or expression)
 * @param node The class node from the AST
 * @param scope The current scope
 * @returns The constructed class
 */
async function evaluateClassDefinition(
  node: acorn.ClassDeclaration | acorn.ClassExpression,
  scope: Scope
): Promise<any> {
  let superClass = null;
  if (node.superClass) {
    superClass = await evaluateNode(node.superClass, scope);
    if (typeof superClass !== 'function') {
      throw new TypeError('Class extends value is not a constructor');
    }
  }

  const createClass = (constructorFn: Function | null): any => {
    let constructor: Function;

    if (constructorFn) {
      constructor = constructorFn;
    } else {
      if (superClass) {
        constructor = function (this: any, ...args: any[]) {
          currentClassContext = {
            thisObj: this,
            superClass: superClass,
          };

          try {
            superClass!.apply(this, args);
          } finally {
            currentClassContext = null;
          }
        };
      } else {
        constructor = function () {};
      }
    }

    if (superClass) {
      Object.setPrototypeOf(constructor.prototype, superClass.prototype);

      Object.setPrototypeOf(constructor, superClass);
    }

    return constructor;
  };

  let constructorMethod: Function | null = null;
  const staticMethods: Record<string, any> = {};
  const instanceMethods: Record<string, any> = {};

  for (const element of node.body.body) {
    if (element.type !== 'MethodDefinition') {
      throw new Error(`Unsupported class element type: ${element.type}`);
    }

    if (element.key.type === 'PrivateIdentifier') {
      throw new Error('Private class elements are not supported');
    }

    let methodName: string;
    if (element.key.type === 'Identifier') {
      methodName = element.key.name;
    } else if (element.key.type === 'Literal') {
      methodName = String(element.key.value);
    } else {
      throw new Error(`Unsupported method key type: ${element.key.type}`);
    }

    if (element.value.type !== 'FunctionExpression') {
      throw new Error(`Class methods must be function expressions, got ${element.value.type}`);
    }

    const methodParams = element.value.params.map((param, index) => {
      if (param.type === 'Identifier') {
        return { name: param.name, isRest: false, isDestructuring: false };
      } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
        return { name: param.argument.name, isRest: true, isDestructuring: false };
      } else if (param.type === 'ObjectPattern') {
        return {
          name: `arg${index}`,
          isRest: false,
          isDestructuring: true,
          destructuringPattern: param,
        };
      } else if (param.type === 'ArrayPattern') {
        return {
          name: `arg${index}`,
          isRest: false,
          isDestructuring: true,
          destructuringPattern: param,
        };
      } else {
        throw new Error(`Unsupported parameter type in class method: ${param.type}`);
      }
    });

    const isConstructor = element.kind === 'constructor';
    const isAsync = element.value.async || false;

    if (isConstructor) {
      const runtimeFunc = new RuntimeFunction(
        methodParams,
        element.value.body,
        scope,
        evaluateNode,
        isAsync
      );

      constructorMethod = function (this: any, ...args: any[]) {
        const methodScope = new Scope(scope);
        methodScope.define('this', this);
        methodScope.define('super', superClass);

        currentClassContext = {
          thisObj: this,
          superClass: superClass,
        };

        try {
          return runtimeFunc.call(this, args);
        } finally {
          currentClassContext = null;
          methodScope.release();
        }
      };
    } else {
      const runtimeFunc = new RuntimeFunction(
        methodParams,
        element.value.body,
        scope,
        evaluateNode,
        isAsync
      );

      const methodFunction = function (this: any, ...args: any[]) {
        const methodScope = new Scope(scope);
        methodScope.define('this', this);
        methodScope.define('super', superClass);

        currentClassContext = {
          thisObj: this,
          superClass: superClass,
        };

        try {
          return runtimeFunc.call(this, args);
        } finally {
          currentClassContext = null;
          methodScope.release();
        }
      };

      if (element.static) {
        staticMethods[methodName] = methodFunction;
      } else {
        instanceMethods[methodName] = methodFunction;
      }
    }
  }

  const classConstructor = createClass(constructorMethod);

  Object.assign(classConstructor.prototype, instanceMethods);

  Object.assign(classConstructor, staticMethods);

  return classConstructor;
}
