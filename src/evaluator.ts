import * as acorn from 'acorn';
import { ReturnValue, RuntimeFunction } from './runtime.ts';
import { Scope } from './scope.ts';

export type GlobalObject = Record<string, any>;

// Context for class methods to find this and super
type ClassContext = {
  thisObj: any;
  superClass: any;
};

// Global variable to track the current class context for super references
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
        const initValue = declarator.init ? await evaluateNode(declarator.init, scope) : undefined;
        
        if (declarator.id.type === 'Identifier') {
          // Simple case: let x = value;
          scope.define(declarator.id.name, initValue);
        } 
        else if (declarator.id.type === 'ObjectPattern') {
          // Object destructuring: let { a, b } = obj;
          if (initValue === null || typeof initValue !== 'object') {
            throw new TypeError('Cannot destructure non-object');
          }
          
          for (const property of declarator.id.properties) {
            if (property.type === 'RestElement') {
              // Rest property: let { a, ...rest } = obj;
              if (property.argument.type !== 'Identifier') {
                throw new Error('Rest element must be an identifier in object destructuring');
              }
              
              const restObj = { ...initValue };
              
              // Remove all other properties that were explicitly destructured
              for (const otherProp of declarator.id.properties) {
                if (otherProp !== property && otherProp.type === 'Property') {
                  const key = otherProp.key.type === 'Identifier' 
                    ? otherProp.key.name 
                    : (otherProp.key.type === 'Literal' ? String(otherProp.key.value) : undefined);
                    
                  if (key) {
                    delete restObj[key];
                  }
                }
              }
              
              scope.define(property.argument.name, restObj);
            } 
            else if (property.type === 'Property') {
              let key: string;
              let value: any;
              
              // Get the property key
              if (property.key.type === 'Identifier') {
                key = property.key.name;
              } else if (property.key.type === 'Literal') {
                key = String(property.key.value);
              } else {
                throw new Error('Unsupported property key type in object destructuring');
              }
              
              // Handle property value
              if (property.value.type === 'Identifier') {
                // Simple case: let { a } = obj;  (a gets obj.a)
                value = initValue[key];
                scope.define(property.value.name, value);
              } 
              else if (property.value.type === 'ObjectPattern') {
                // Nested object destructuring: let { a: { b } } = obj;
                const nestedObj = initValue[key];
                if (nestedObj === null || typeof nestedObj !== 'object') {
                  throw new TypeError(`Cannot destructure non-object property ${key}`);
                }
                
                // Recursively handle nested object pattern
                for (const nestedProp of property.value.properties) {
                  if (nestedProp.type !== 'Property' || nestedProp.value.type !== 'Identifier') {
                    throw new Error('Nested object destructuring with non-identifier values not supported');
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
              }
              else if (property.value.type === 'ArrayPattern') {
                // Mixed destructuring: let { a: [b, c] } = obj;
                const nestedArr = initValue[key];
                if (!Array.isArray(nestedArr)) {
                  throw new TypeError(`Cannot destructure non-array property ${key}`);
                }
                
                for (let i = 0; i < property.value.elements.length; i++) {
                  const element = property.value.elements[i];
                  if (!element) continue; // Skip holes in pattern
                  
                  if (element.type === 'Identifier') {
                    scope.define(element.name, nestedArr[i]);
                  } else {
                    throw new Error('Nested array destructuring with non-identifier elements not supported');
                  }
                }
              } 
              else {
                throw new Error('Unsupported property value type in object destructuring');
              }
            }
          }
        } 
        else if (declarator.id.type === 'ArrayPattern') {
          // Array destructuring: let [a, b] = arr;
          if (!Array.isArray(initValue)) {
            throw new TypeError('Cannot destructure non-array');
          }
          
          for (let i = 0; i < declarator.id.elements.length; i++) {
            const element = declarator.id.elements[i];
            if (!element) continue; // Skip holes in pattern
            
            if (element.type === 'Identifier') {
              // Simple case: let [a, b] = arr;
              scope.define(element.name, initValue[i]);
            } 
            else if (element.type === 'RestElement') {
              // Rest element: let [a, ...rest] = arr;
              if (element.argument.type !== 'Identifier') {
                throw new Error('Rest element must be an identifier in array destructuring');
              }
              
              // Get all remaining elements
              const restValue = initValue.slice(i);
              scope.define(element.argument.name, restValue);
              break; // Rest element must be the last one
            } 
            else if (element.type === 'ObjectPattern') {
              // Nested destructuring: let [{ a, b }] = arr;
              const nestedObj = initValue[i];
              if (nestedObj === null || typeof nestedObj !== 'object') {
                throw new TypeError(`Cannot destructure non-object at index ${i}`);
              }
              
              for (const prop of element.properties) {
                if (prop.type !== 'Property' || prop.value.type !== 'Identifier') {
                  throw new Error('Nested object destructuring with non-identifier values not supported');
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
            } 
            else if (element.type === 'ArrayPattern') {
              // Nested array destructuring: let [[a, b]] = arr;
              const nestedArr = initValue[i];
              if (!Array.isArray(nestedArr)) {
                throw new TypeError(`Cannot destructure non-array at index ${i}`);
              }
              
              for (let j = 0; j < element.elements.length; j++) {
                const nestedElement = element.elements[j];
                if (!nestedElement) continue; // Skip holes
                
                if (nestedElement.type === 'Identifier') {
                  scope.define(nestedElement.name, nestedArr[j]);
                } else {
                  throw new Error('Deeply nested array destructuring not supported');
                }
              }
            }
          }
        } 
        else {
          throw new Error(`Unsupported variable declaration pattern: ${declarator.id.type}`);
        }
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
    
    case 'BreakStatement': {
      // This is a special case that gets handled by the switch statement
      // We don't actually need to do anything here since the break logic is in the switch handler
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
        
        // Execute statements from the first matching case through subsequent cases
        // until a break statement is encountered
        for (let i = 0; i < node.cases.length; i++) {
          const caseClause = node.cases[i];
          
          // For default case
          if (!caseClause.test) {
            // Execute default case only if no previous case matched
            if (!matched && !fallthrough) {
              fallthrough = true; // Start executing from here
            }
            // Otherwise skip default (for now) if we're already executing statements
          } 
          // For regular cases
          else {
            // If we're already in fallthrough mode, just continue executing
            if (!fallthrough) {
              // Evaluate the case condition
              const testValue = await evaluateNode(caseClause.test, switchScope);
              
              // Check if this case matches
              if (discriminant === testValue) {
                matched = true;
                fallthrough = true; // Start executing from here
              }
            }
          }
          
          // If this is a case we should execute (either matched or in fallthrough)
          if (fallthrough) {
            // Execute all statements for this case
            for (const statement of caseClause.consequent) {
              if (statement.type === 'BreakStatement') {
                // If we hit a break, stop executing switch
                return result;
              }
              
              // Execute the statement
              result = await evaluateNode(statement, switchScope);
            }
            
            // If we reach here without a break, continue to the next case (fallthrough)
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
      // Handle compound assignments (+=, -=, etc.)
      if (node.operator !== '=') {
        if (node.left.type === 'Identifier') {
          // Get the current value for identifier
          const leftValue = scope.lookup(node.left.name);
          if (leftValue === undefined && !scope.lookup(node.left.name)) {
            throw new Error(`Reference Error: ${node.left.name} is not defined`);
          }
          
          const rightValue = await evaluateNode(node.right, scope);
          let result;
          
          // Apply the compound operation
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
          
          // Assign the result back
          if (!scope.assign(node.left.name, result)) {
            throw new Error(`Cannot assign to undefined variable ${node.left.name}`);
          }
          return result;
        } 
        else if (node.left.type === 'MemberExpression') {
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
                (val): val is acorn.Identifier =>
                  val !== null &&
                  typeof val === 'object' &&
                  'type' in val &&
                  val.type === 'Identifier',
                'Expected an identifier in non-computed MemberExpression'
              ).name;

          const leftValue = obj[prop];
          const rightValue = await evaluateNode(node.right, scope);
          let result;
          
          // Apply the compound operation
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
        }
        else {
          throw new Error('Compound assignment not supported for this target type');
        }
      } 
      // Regular assignment (operator is '=')
      else {
        if (node.left.type === 'Identifier') {
          // Simple assignment: x = value
          const assignValue = await evaluateNode(node.right, scope);
          if (!scope.assign(node.left.name, assignValue)) {
            throw new Error(`Cannot assign to undefined variable ${node.left.name}`);
          }
          return assignValue;
        } 
        else if (node.left.type === 'MemberExpression') {
          // Simple property assignment: obj.prop = value
          const obj = await evaluateNode(
            ensure(
              node.left.object,
              (val): val is acorn.Expression =>
                val !== null && typeof val === 'object' && 'type' in val && val.type !== 'Super',
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
        else if (node.left.type === 'ObjectPattern') {
          // Object destructuring assignment: { a, b } = obj
          const rightValue = await evaluateNode(node.right, scope);
          
          if (rightValue === null || typeof rightValue !== 'object') {
            throw new TypeError('Cannot destructure non-object in assignment');
          }
          
          // Process each property in the object pattern
          for (const property of node.left.properties) {
            if (property.type === 'RestElement') {
              // Rest property: { a, ...rest } = obj
              if (property.argument.type !== 'Identifier') {
                throw new Error('Rest element must be an identifier in object destructuring assignment');
              }
              
              const restObj = { ...rightValue };
              
              // Remove all other properties that were explicitly destructured
              for (const otherProp of node.left.properties) {
                if (otherProp !== property && otherProp.type === 'Property') {
                  const key = otherProp.key.type === 'Identifier' 
                    ? otherProp.key.name 
                    : (otherProp.key.type === 'Literal' ? String(otherProp.key.value) : undefined);
                    
                  if (key) {
                    delete restObj[key];
                  }
                }
              }
              
              if (!scope.assign(property.argument.name, restObj)) {
                throw new Error(`Cannot assign to undefined variable ${property.argument.name}`);
              }
            } 
            else if (property.type === 'Property') {
              let key: string;
              
              // Get the property key
              if (property.key.type === 'Identifier') {
                key = property.key.name;
              } else if (property.key.type === 'Literal') {
                key = String(property.key.value);
              } else {
                throw new Error('Unsupported property key type in object destructuring assignment');
              }
              
              // Handle property value
              if (property.value.type === 'Identifier') {
                // Simple case: { a } = obj  (a gets obj.a)
                const value = rightValue[key];
                if (!scope.assign(property.value.name, value)) {
                  throw new Error(`Cannot assign to undefined variable ${property.value.name}`);
                }
              }
              else {
                throw new Error('Nested destructuring in assignment expressions not supported');
              }
            }
          }
          
          return rightValue;
        }
        else if (node.left.type === 'ArrayPattern') {
          // Array destructuring assignment: [a, b] = arr
          const rightValue = await evaluateNode(node.right, scope);
          
          if (!Array.isArray(rightValue)) {
            throw new TypeError('Cannot destructure non-array in assignment');
          }
          
          for (let i = 0; i < node.left.elements.length; i++) {
            const element = node.left.elements[i];
            if (!element) continue; // Skip holes in pattern
            
            if (element.type === 'Identifier') {
              // Simple case: [a, b] = arr
              if (!scope.assign(element.name, rightValue[i])) {
                throw new Error(`Cannot assign to undefined variable ${element.name}`);
              }
            } 
            else if (element.type === 'RestElement') {
              // Rest element: [a, ...rest] = arr
              if (element.argument.type !== 'Identifier') {
                throw new Error('Rest element must be an identifier in array destructuring assignment');
              }
              
              // Get all remaining elements
              const restValue = rightValue.slice(i);
              if (!scope.assign(element.argument.name, restValue)) {
                throw new Error(`Cannot assign to undefined variable ${element.argument.name}`);
              }
              break; // Rest element must be the last one
            }
            else {
              throw new Error('Nested destructuring in assignment expressions not supported');
            }
          }
          
          return rightValue;
        }
        else {
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
      // Get the current 'this' value from scope
      const thisValue = scope.lookup('this');
      
      if (thisValue === undefined) {
        // If we're in a class method, the currentClassContext should have this
        if (currentClassContext) {
          return currentClassContext.thisObj;
        }
        
        // Otherwise, 'this' is not defined in the current context
        return undefined;
      }
      
      return thisValue;
    }

    case 'BinaryExpression':
      return evaluateBinaryExpression(node, scope);

    case 'MemberExpression':
      return evaluateMemberExpression(node, scope);

    case 'CallExpression': {
      // Handle super() constructor calls
      if (node.callee.type === 'Super') {
        // This is a super() call in a constructor
        if (!currentClassContext) {
          throw new Error('Super constructor call is not properly bound to a class constructor');
        }
        
        const { thisObj, superClass } = currentClassContext;
        
        // Process arguments
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
        
        // Call the super constructor with this
        Reflect.apply(superClass, thisObj, flatArgs);
        return undefined;
      }
      // Handle regular function calls and method calls
      else {
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
            // Handle super method calls that were already processed in evaluateMemberExpression
            // The super method will already be bound to 'this'
            if (node.callee.object.type === 'Super') {
              return callee(...flatArgs);
            }
            
            // Regular method calls
            const obj = await evaluateNode(node.callee.object as acorn.Expression, scope);
  
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
      
    case 'ClassDeclaration': {
      // Handle class declaration
      if (!node.id) throw new Error('Class declaration must have a name');
      const className = node.id.name;
      
      // Create the class
      const classValue = await evaluateClassDefinition(node, scope);
      
      // Define the class in the scope
      scope.define(className, classValue);
      return undefined;
    }
    
    case 'ClassExpression': {
      // Handle class expression - similar to class declaration but returns the class
      return evaluateClassDefinition(node, scope);
    }
    
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
  // Handle 'super' references
  if (node.object.type === 'Super') {
    // Get this and super from the current class context
    if (!currentClassContext) {
      throw new Error('Super reference is not properly bound to a class method');
    }
    
    const { thisObj, superClass } = currentClassContext;
    
    // Get the property from the super's prototype
    const superProto = Object.getPrototypeOf(superClass.prototype);
    
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
      // Return the property bound to 'this'
      const propValue = superProto[property];
      return typeof propValue === 'function' ? propValue.bind(thisObj) : propValue;
    } else {
      if (node.property.type !== 'Identifier') {
        throw new Error('Unsupported property type in Super MemberExpression');
      }
  
      // Return the method bound to 'this'
      const propValue = superProto[node.property.name];
      return typeof propValue === 'function' ? propValue.bind(thisObj) : propValue;
    }
  }
  // Regular member expression (non-super)
  else {
    const objectExpr = node.object as acorn.Expression;
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
  // Evaluate the superclass if specified
  let superClass = null;
  if (node.superClass) {
    superClass = await evaluateNode(node.superClass, scope);
    if (typeof superClass !== 'function') {
      throw new TypeError('Class extends value is not a constructor');
    }
  }
  
  // Create class constructor function
  const createClass = (constructorFn: Function | null): any => {
    // If no constructor is defined, create a default one
    let constructor: Function;
    
    if (constructorFn) {
      constructor = constructorFn;
    } else {
      if (superClass) {
        // Default constructor with super() call
        constructor = function(this: any, ...args: any[]) {
          superClass!.apply(this, args);
        };
      } else {
        // Default constructor with no super
        constructor = function() {};
      }
    }
    
    // Setup the prototype chain
    if (superClass) {
      Object.setPrototypeOf(constructor.prototype, superClass.prototype);
      Object.setPrototypeOf(constructor, superClass);
    }
    
    return constructor;
  };
  
  // Process class body elements
  let constructorMethod: Function | null = null;
  const staticMethods: Record<string, any> = {};
  const instanceMethods: Record<string, any> = {};
  
  for (const element of node.body.body) {
    if (element.type !== 'MethodDefinition') {
      throw new Error(`Unsupported class element type: ${element.type}`);
    }
    
    // Skip private methods (they're not supported)
    if (element.key.type === 'PrivateIdentifier') {
      throw new Error('Private class elements are not supported');
    }
    
    // Get the method key name
    let methodName: string;
    if (element.key.type === 'Identifier') {
      methodName = element.key.name;
    } else if (element.key.type === 'Literal') {
      methodName = String(element.key.value);
    } else {
      throw new Error(`Unsupported method key type: ${element.key.type}`);
    }
    
    // Get the method value (function)
    if (element.value.type !== 'FunctionExpression') {
      throw new Error(`Class methods must be function expressions, got ${element.value.type}`);
    }
    
    const methodParams = element.value.params.map(param => {
      if (param.type === 'Identifier') {
        return { name: param.name, isRest: false };
      } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
        return { name: param.argument.name, isRest: true };
      } else {
        throw new Error('Only identifier and rest parameters are supported in class methods');
      }
    });
    
    // Create a special scope for the method that includes 'this' and 'super'
    // We'll set the actual values when the method is called
    const isConstructor = element.kind === 'constructor';
    const isAsync = element.value.async || false;
    
    // Create method function - special handling for constructor
    if (isConstructor) {
      const runtimeFunc = new RuntimeFunction(
        methodParams,
        element.value.body,
        scope,
        evaluateNode,
        isAsync
      );
      
      // Create wrapper function that will be used as the actual constructor
      constructorMethod = function(this: any, ...args: any[]) {
        // Create a new scope that includes 'this' and 'super'
        const methodScope = new Scope(scope);
        methodScope.define('this', this);
        methodScope.define('super', superClass);
        
        // Set the current context so super calls can access it
        currentClassContext = {
          thisObj: this,
          superClass: superClass
        };
        
        try {
          // Call the runtime function with proper 'this' binding
          return runtimeFunc.call(this, args);
        } finally {
          currentClassContext = null;
          methodScope.release();
        }
      };
    } else {
      // Regular method (not constructor)
      const runtimeFunc = new RuntimeFunction(
        methodParams,
        element.value.body,
        scope,
        evaluateNode,
        isAsync
      );
      
      // Create wrapper function that will be the actual method
      const methodFunction = function(this: any, ...args: any[]) {
        // Create a new scope that includes 'this' and 'super'
        const methodScope = new Scope(scope);
        methodScope.define('this', this);
        methodScope.define('super', superClass);
        
        // Set the current context so super calls can access it
        currentClassContext = {
          thisObj: this,
          superClass: superClass
        };
        
        try {
          // Call the runtime function with proper 'this' binding
          return runtimeFunc.call(this, args);
        } finally {
          currentClassContext = null;
          methodScope.release();
        }
      };
      
      // Add method to appropriate collection based on whether it's static or not
      if (element.static) {
        staticMethods[methodName] = methodFunction;
      } else {
        instanceMethods[methodName] = methodFunction;
      }
    }
  }
  
  // Create the class with the constructor we found (or default)
  const classConstructor = createClass(constructorMethod);
  
  // Add instance methods to prototype
  Object.assign(classConstructor.prototype, instanceMethods);
  
  // Add static methods directly to constructor
  Object.assign(classConstructor, staticMethods);
  
  return classConstructor;
}
