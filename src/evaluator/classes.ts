import * as acorn from 'acorn';
import {RuntimeFunction} from '../runtime.ts';
import {Scope} from '../scope.ts';

/**
 * Evaluates a class definition (either declaration or expression)
 * @param node The class node from the AST
 * @param scope The current scope
 * @returns The constructed class
 */
export async function evaluateClassDefinition(
	node: acorn.ClassDeclaration | acorn.ClassExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
	currentClassContext: any,
	setCurrentClassContext: (context: any) => void,
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
			constructor = function (this: any, ...args: any[]) {
				return constructorFn.apply(this, args);
			};
		} else {
			if (superClass) {
				constructor = function (this: any, ...args: any[]) {
					setCurrentClassContext({
						thisObj: this,
						superClass: superClass,
					});

					try {
						superClass.apply(this, args);
					} finally {
						setCurrentClassContext(null);
					}
				};
			} else {
				constructor = function (this: any) {};
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
				throw new Error(`Unsupported parameter type in class method: ${param.type}`);
			}
		});

		const isConstructor = element.kind === 'constructor';
		const isAsync = element.value.async;

		if (isConstructor) {
			const runtimeFunc = new RuntimeFunction(
				methodParams,
				element.value.body,
				scope,
				evaluateNode,
				isAsync,
			);

			constructorMethod = function (this: any, ...args: any[]) {
				const methodScope = new Scope(scope);

				if (this === undefined || this === null) {
					throw new Error('Constructor called without a valid "this" context');
				}

				methodScope.define('this', this);
				methodScope.define('super', superClass);

				setCurrentClassContext({
					thisObj: this,
					superClass: superClass,
				});

				try {
					const result = runtimeFunc.call(this, args);

					if (result !== null && typeof result === 'object') {
						return result;
					}

					return this;
				} finally {
					setCurrentClassContext(null);
					methodScope.release();
				}
			};
		} else {
			const runtimeFunc = new RuntimeFunction(
				methodParams,
				element.value.body,
				scope,
				evaluateNode,
				isAsync,
			);

			const methodFunction = function (this: any, ...args: any[]) {
				if (this === undefined) {
					throw new Error('Method called without a proper "this" binding');
				}

				const methodScope = new Scope(scope);
				methodScope.define('this', this);
				methodScope.define('super', superClass);

				setCurrentClassContext({
					thisObj: this,
					superClass: superClass,
				});

				try {
					return runtimeFunc.call(this, args);
				} finally {
					setCurrentClassContext(null);
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

	for (const [name, method] of Object.entries(instanceMethods)) {
		classConstructor.prototype[name] = method;
	}

	Object.assign(classConstructor, staticMethods);

	return classConstructor;
}
