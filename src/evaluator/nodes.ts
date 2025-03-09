import * as acorn from 'acorn';
import {BreakValue, ContinueValue, ReturnValue, RuntimeFunction} from '../runtime.ts';
import {Scope} from '../scope.ts';
import {evaluateClassDefinition} from './classes.ts';
import {
	evaluateArrayExpression,
	evaluateBinaryExpression,
	evaluateLogicalExpression,
	evaluateMemberExpression,
	evaluateObjectExpression,
	evaluateUnaryExpression,
} from './expressions.ts';
import {createWrappedFunction} from './functions.ts';
import {ensure} from './utils.ts';

const labelStack: string[] = [];

function getCurrentLabel(): string | undefined {
	return labelStack.length > 0 ? labelStack[labelStack.length - 1] : undefined;
}

export type ClassContext = {
	thisObj: any;
	superClass: any;
};

/**
 * Evaluates a node from the AST
 */
export async function evaluateNode(
	node: acorn.Expression | acorn.Statement,
	scope: Scope,
	currentClassContext: ClassContext | null,
	setCurrentClassContext: (context: ClassContext | null) => void,
): Promise<any> {
	const evaluate = (n: any, s: Scope) => {
		return evaluateNode(n, s, currentClassContext, setCurrentClassContext);
	};

	switch (node.type) {
		case 'ExpressionStatement':
			return evaluate(node.expression, scope);

		case 'UpdateExpression': {
			const argument = node.argument;

			if (argument.type === 'Identifier') {
				const name = argument.name;
				let value = scope.lookup(name);

				if (value === undefined && !scope.lookup(name)) {
					throw new Error(`Reference Error: ${name} is not defined`);
				}

				if (node.prefix) {
					value = node.operator === '++' ? value + 1 : value - 1;
					scope.assign(name, value);
					return value;
				} else {
					const oldValue = value;
					value = node.operator === '++' ? value + 1 : value - 1;
					scope.assign(name, value);
					return oldValue;
				}
			} else if (argument.type === 'MemberExpression') {
				const obj = await evaluate(argument.object as acorn.Expression, scope);
				const prop = argument.computed
					? await evaluate(argument.property as acorn.Expression, scope)
					: (argument.property as acorn.Identifier).name;

				if (obj === undefined || obj === null) {
					throw new TypeError(`Cannot update property '${prop}' of ${obj}`);
				}

				let value = obj[prop];

				if (node.prefix) {
					value = node.operator === '++' ? value + 1 : value - 1;
					obj[prop] = value;
					return value;
				} else {
					const oldValue = value;
					value = node.operator === '++' ? value + 1 : value - 1;
					obj[prop] = value;
					return oldValue;
				}
			} else {
				throw new Error(`Unsupported update expression argument: ${argument.type}`);
			}
		}

		case 'BlockStatement': {
			const blockScope = new Scope(scope);
			try {
				let blockResult: any;
				for (const statement of node.body) {
					blockResult = await evaluate(statement, blockScope);
				}
				return blockResult;
			} finally {
				blockScope.release();
			}
		}

		case 'AwaitExpression': {
			const awaitValue = await evaluate(node.argument, scope);
			return await awaitValue;
		}

		case 'VariableDeclaration':
			for (const declarator of node.declarations) {
				const initValue = declarator.init ? await evaluate(declarator.init, scope) : undefined;

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

							const restObj = {...initValue};

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
											'Nested object destructuring with non-identifier values not supported',
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
											'Nested array destructuring with non-identifier elements not supported',
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
										'Nested object destructuring with non-identifier values not supported',
									);
								}

								let key: string;
								if (prop.key.type === 'Identifier') {
									key = prop.key.name;
								} else if (prop.key.type === 'Literal') {
									key = String((prop.key as acorn.Literal).value);
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
					return {name: param.name, isRest: false, isDestructuring: false};
				} else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
					return {
						name: param.argument.name,
						isRest: true,
						isDestructuring: false,
					};
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

			const isAsync = node.async;
			const evalFn = (n: any, s: Scope) => evaluate(n, s);
			const runtimeFunc = new RuntimeFunction(funcParams, node.body, scope, evalFn, isAsync);
			const func = createWrappedFunction(runtimeFunc);
			scope.define(funcName, func);
			return undefined;
		}

		case 'ReturnStatement': {
			const returnValue = node.argument ? await evaluate(node.argument, scope) : undefined;
			throw new ReturnValue(returnValue);
		}

		case 'BreakStatement': {
			const labelName = node.label?.name;

			if (labelName && !labelStack.includes(labelName)) {
				throw new Error(`Undefined label: ${labelName}`);
			}

			throw new BreakValue(labelName);
		}

		case 'ContinueStatement': {
			const labelName = node.label?.name;

			if (labelName && !labelStack.includes(labelName)) {
				throw new Error(`Undefined label: ${labelName}`);
			}

			throw new ContinueValue(labelName);
		}

		case 'ThrowStatement': {
			const value = await evaluate(node.argument, scope);
			throw value instanceof Error ? value : new Error(String(value));
		}

		case 'IfStatement': {
			const test = await evaluate(node.test, scope);
			if (test) {
				return evaluate(node.consequent, scope);
			} else if (node.alternate) {
				return evaluate(node.alternate, scope);
			}
			return undefined;
		}

		case 'WhileStatement': {
			let whileResult: any;
			const label = getCurrentLabel();

			try {
				while (await evaluate(node.test, scope)) {
					try {
						whileResult = await evaluate(node.body, scope);
					} catch (e) {
						if (e instanceof ContinueValue) {
							if (!e.label || e.label === label) {
								continue;
							}

							throw e;
						}
						throw e;
					}
				}
				return whileResult;
			} catch (e) {
				if (e instanceof BreakValue) {
					if (!e.label || e.label === label) {
						return whileResult;
					}

					throw e;
				}
				throw e;
			}
		}

		case 'TryStatement': {
			try {
				return await evaluate(node.block, scope);
			} catch (error) {
				if (node.handler) {
					const catchScope = new Scope(scope);
					if (node.handler.param?.type === 'Identifier') {
						catchScope.define(node.handler.param.name, error);
					}
					return await evaluate(node.handler.body, catchScope);
				}
				throw error;
			} finally {
				if (node.finalizer) {
					await evaluate(node.finalizer, scope);
				}
			}
		}

		case 'SwitchStatement': {
			const discriminant = await evaluate(node.discriminant, scope);
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
							const testValue = await evaluate(caseClause.test, switchScope);

							if (discriminant === testValue) {
								matched = true;
								fallthrough = true;
							}
						}
					}

					if (fallthrough) {
						try {
							for (const statement of caseClause.consequent) {
								result = await evaluate(statement, switchScope);
							}
						} catch (e) {
							if (e instanceof BreakValue && !e.label) {
								return result;
							}
							throw e;
						}
					}
				}

				return result;
			} finally {
				switchScope.release();
			}
		}

		case 'NewExpression': {
			const constructor = await evaluate(node.callee, scope);

			const flatArgs: any[] = [];
			for (const arg of node.arguments) {
				if (arg.type === 'SpreadElement') {
					const spreadArg = await evaluate(arg.argument, scope);
					if (Array.isArray(spreadArg)) {
						flatArgs.push(...spreadArg);
					} else {
						throw new Error('Spread argument must be an array');
					}
				} else {
					flatArgs.push(await evaluate(arg, scope));
				}
			}

			if (typeof constructor !== 'function') {
				throw new TypeError('Constructor must be a function');
			}

			const instance = Object.create(constructor.prototype);

			const result = constructor.apply(instance, flatArgs);

			return result !== null && typeof result === 'object' ? result : instance;
		}

		case 'ArrowFunctionExpression': {
			const arrowParams = node.params.map((param, index) => {
				if (param.type === 'Identifier') {
					return {name: param.name, isRest: false, isDestructuring: false};
				} else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
					return {
						name: param.argument.name,
						isRest: true,
						isDestructuring: false,
					};
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

			const evalFn = (n: any, s: Scope) => evaluate(n, s);
			const runtimeFunc = new RuntimeFunction(arrowParams, node.body, scope, evalFn, node.async);

			return createWrappedFunction(runtimeFunc);
		}

		case 'AssignmentExpression': {
			if (node.operator !== '=') {
				if (node.left.type === 'Identifier') {
					const leftValue = scope.lookup(node.left.name);
					if (leftValue === undefined && !scope.lookup(node.left.name)) {
						throw new Error(`Reference Error: ${node.left.name} is not defined`);
					}

					const rightValue = await evaluate(node.right, scope);
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

					const obj = await evaluate(node.left.object, scope);
					const prop = node.left.computed
						? await evaluate(node.left.property, scope)
						: ensure(
								node.left.property,
								val => val.type === 'Identifier',
								'Expected an identifier in non-computed MemberExpression',
							).name;

					if (obj === undefined || obj === null) {
						throw new TypeError(
							`Cannot read property '${prop}' of ${obj === undefined ? 'undefined' : 'null'}`,
						);
					}
					const leftValue = obj[prop];
					const rightValue = await evaluate(node.right, scope);
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
					const assignValue = await evaluate(node.right, scope);
					if (!scope.assign(node.left.name, assignValue)) {
						throw new Error(`Cannot assign to undefined variable ${node.left.name}`);
					}
					return assignValue;
				} else if (node.left.type === 'MemberExpression') {
					const obj = await evaluate(
						ensure(
							node.left.object,
							val => val.type !== 'Super',
							'Super is not supported for AssignmentExpression',
						),
						scope,
					);

					if (node.left.property.type === 'PrivateIdentifier') {
						throw new Error('Private identifiers are not supported for AssignmentExpression');
					}

					const prop = node.left.computed
						? await evaluate(node.left.property, scope)
						: ensure(
								node.left.property,
								val => val.type === 'Identifier',
								'Expected an identifier in non-computed MemberExpression',
							).name;

					const memberValue = await evaluate(node.right, scope);

					if (obj === undefined || obj === null) {
						throw new TypeError(`Cannot set property '${prop}' of ${obj}`);
					}

					obj[prop] = memberValue;
					return memberValue;
				} else if (node.left.type === 'ObjectPattern') {
					const rightValue = await evaluate(node.right, scope);

					if (rightValue === null || typeof rightValue !== 'object') {
						throw new TypeError('Cannot destructure non-object in assignment');
					}

					for (const property of node.left.properties) {
						if (property.type === 'RestElement') {
							if (property.argument.type !== 'Identifier') {
								throw new Error(
									'Rest element must be an identifier in object destructuring assignment',
								);
							}

							const restObj = {...rightValue};

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
					const rightValue = await evaluate(node.right, scope);

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
									'Rest element must be an identifier in array destructuring assignment',
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
			return evaluateBinaryExpression(node, scope, evaluate);

		case 'MemberExpression':
			return evaluateMemberExpression(node, scope, evaluate, currentClassContext);

		case 'CallExpression': {
			if (node.callee.type === 'Super') {
				if (!currentClassContext) {
					throw new Error('Super constructor call is not properly bound to a class constructor');
				}

				const {thisObj, superClass} = currentClassContext;

				if (!superClass) {
					throw new Error('Cannot use super() in a class with no superclass');
				}

				const flatArgs: any[] = [];
				for (const arg of node.arguments) {
					if (arg.type === 'SpreadElement') {
						const spreadArg = await evaluate(arg.argument, scope);
						if (Array.isArray(spreadArg)) {
							flatArgs.push(...spreadArg);
						} else {
							throw new Error('Spread argument must be an array');
						}
					} else {
						flatArgs.push(await evaluate(arg, scope));
					}
				}

				try {
					Reflect.apply(superClass, thisObj, flatArgs);
				} catch (error) {
					throw new Error(`Error in super() call: ${String(error)}`);
				}

				return undefined;
			} else {
				const callee = await evaluate(node.callee, scope);

				const flatArgs: any[] = [];
				for (const arg of node.arguments) {
					if (arg.type === 'SpreadElement') {
						const spreadArg = await evaluate(arg.argument, scope);
						if (Array.isArray(spreadArg)) {
							flatArgs.push(...spreadArg);
						} else {
							throw new Error('Spread argument must be an array');
						}
					} else {
						flatArgs.push(await evaluate(arg, scope));
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

						const obj = await evaluate(node.callee.object as acorn.Expression, scope);

						if (obj !== null && obj !== undefined) {
							return callee.apply(obj, flatArgs);
						}
					}

					return callee(...flatArgs);
				}

				throw new Error('Attempted to call a non-function');
			}
		}

		case 'ObjectExpression':
			return evaluateObjectExpression(node, scope, evaluate);

		case 'ArrayExpression':
			return evaluateArrayExpression(node, scope, evaluate);

		case 'UnaryExpression':
			return evaluateUnaryExpression(node, scope, evaluate);

		case 'FunctionExpression': {
			const exprParams = node.params.map((param, index) => {
				if (param.type === 'Identifier') {
					return {name: param.name, isRest: false, isDestructuring: false};
				} else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
					return {
						name: param.argument.name,
						isRest: true,
						isDestructuring: false,
					};
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

			const evalFn = (n: any, s: Scope) => evaluate(n, s);
			const runtimeFunc = new RuntimeFunction(exprParams, node.body, scope, evalFn, node.async);

			return createWrappedFunction(runtimeFunc);
		}

		case 'LogicalExpression':
			return evaluateLogicalExpression(node, scope, evaluate);

		case 'ClassDeclaration': {
			if (!node.id) throw new Error('Class declaration must have a name');
			const className = node.id.name;

			const classValue = await evaluateClassDefinition(
				node,
				scope,
				evaluate,
				currentClassContext,
				setCurrentClassContext,
			);

			scope.define(className, classValue);
			return undefined;
		}

		case 'ClassExpression': {
			return evaluateClassDefinition(
				node,
				scope,
				evaluate,
				currentClassContext,
				setCurrentClassContext,
			);
		}

		case 'TemplateLiteral': {
			let result = '';

			for (let i = 0; i < node.quasis.length; i++) {
				result += node.quasis[i].value.cooked;

				if (i < node.expressions.length) {
					const exprValue = await evaluate(node.expressions[i], scope);
					result += String(exprValue);
				}
			}

			return result;
		}

		case 'ConditionalExpression': {
			const test = await evaluate(node.test, scope);
			if (test) {
				return evaluate(node.consequent, scope);
			} else {
				return evaluate(node.alternate, scope);
			}
		}

		case 'ChainExpression': {
			try {
				return await evaluate(node.expression, scope);
			} catch (error) {
				return undefined;
			}
		}

		case 'SequenceExpression': {
			let result;
			for (const expression of node.expressions) {
				result = await evaluate(expression, scope);
			}
			return result;
		}

		case 'ForOfStatement': {
			const forOfScope = new Scope(scope);
			try {
				const iterable = await evaluate(node.right, forOfScope);
				const label = getCurrentLabel();

				if (
					iterable === null ||
					iterable === undefined ||
					typeof iterable[Symbol.iterator as unknown as string] !== 'function'
				) {
					throw new TypeError('Cannot iterate over non-iterable value');
				}

				let lastResult;
				try {
					for (const value of iterable) {
						try {
							if (node.left.type === 'VariableDeclaration') {
								const iterationScope = new Scope(forOfScope);

								const declarator = node.left.declarations[0];

								if (declarator.id.type === 'Identifier') {
									iterationScope.define(declarator.id.name, value);
								} else if (declarator.id.type === 'ObjectPattern') {
									if (value === null || typeof value !== 'object') {
										throw new TypeError('Cannot destructure non-object in for...of loop');
									}

									for (const prop of declarator.id.properties) {
										if (prop.type === 'Property' && prop.value.type === 'Identifier') {
											const key =
												prop.key.type === 'Identifier'
													? prop.key.name
													: String((prop.key as acorn.Literal).value);
											iterationScope.define(prop.value.name, value[key]);
										}
									}
								} else if (declarator.id.type === 'ArrayPattern') {
									if (!Array.isArray(value)) {
										throw new TypeError('Cannot destructure non-array in for...of loop');
									}

									for (let i = 0; i < declarator.id.elements.length; i++) {
										const element = declarator.id.elements[i];
										if (element && element.type === 'Identifier') {
											iterationScope.define(element.name, value[i]);
										}
									}
								}

								lastResult = await evaluate(node.body, iterationScope);
							} else if (node.left.type === 'Identifier') {
								forOfScope.assign(node.left.name, value);
								lastResult = await evaluate(node.body, forOfScope);
							} else {
								throw new Error(`Unsupported for...of left side: ${node.left.type}`);
							}
						} catch (e) {
							if (e instanceof ContinueValue) {
								if (e.label && e.label !== label) {
									throw e;
								}

								continue;
							}
							throw e;
						}
					}
					return lastResult;
				} catch (e) {
					if (e instanceof BreakValue) {
						if (e.label && e.label !== label) {
							throw e;
						}

						return lastResult;
					}
					throw e;
				}
			} finally {
				forOfScope.release();
			}
		}

		case 'ForInStatement': {
			const forInScope = new Scope(scope);
			try {
				const right = await evaluate(node.right, forInScope);
				const label = getCurrentLabel();

				if (right === null || right === undefined) {
					throw new TypeError('Cannot iterate over null or undefined');
				}

				let lastResult;
				try {
					for (const key in right) {
						try {
							if (node.left.type === 'VariableDeclaration') {
								const iterationScope = new Scope(forInScope);

								const declarator = node.left.declarations[0];

								if (declarator.id.type === 'Identifier') {
									iterationScope.define(declarator.id.name, key);
								} else {
									throw new Error(
										`Unsupported for...in variable declaration: ${declarator.id.type}`,
									);
								}

								lastResult = await evaluate(node.body, iterationScope);
							} else if (node.left.type === 'Identifier') {
								forInScope.assign(node.left.name, key);
								lastResult = await evaluate(node.body, forInScope);
							} else {
								throw new Error(`Unsupported for...in left side: ${node.left.type}`);
							}
						} catch (e) {
							if (e instanceof ContinueValue) {
								if (e.label && e.label !== label) {
									throw e;
								}

								continue;
							}
							throw e;
						}
					}
					return lastResult;
				} catch (e) {
					if (e instanceof BreakValue) {
						if (e.label && e.label !== label) {
							throw e;
						}

						return lastResult;
					}
					throw e;
				}
			} finally {
				forInScope.release();
			}
		}

		case 'LabeledStatement': {
			labelStack.push(node.label.name);

			try {
				return await evaluate(node.body, scope);
			} finally {
				labelStack.pop();
			}
		}

		case 'ForStatement': {
			const forScope = new Scope(scope);
			try {
				if (node.init) {
					await evaluate(node.init, forScope);
				}

				let lastResult;
				const label = getCurrentLabel();

				try {
					while (true) {
						if (node.test) {
							const testResult = await evaluate(node.test, forScope);
							if (!testResult) {
								break;
							}
						}

						try {
							const result = await evaluate(node.body, forScope);
							lastResult = result;
						} catch (e) {
							if (e instanceof ContinueValue) {
								if (e.label && e.label !== label) {
									throw e;
								}
							} else {
								throw e;
							}
						}

						if (node.update) {
							await evaluate(node.update, forScope);
						}
					}

					return lastResult;
				} catch (e) {
					if (e instanceof BreakValue) {
						if (e.label && e.label !== label) {
							throw e;
						}

						return lastResult;
					}
					throw e;
				}
			} finally {
				forScope.release();
			}
		}

		default:
			throw new Error(`Unsupported node type: ${node.type}`);
	}
}
