import * as acorn from 'acorn';
import {Scope} from '../scope.ts';
import {ensure} from './utils.ts';

/**
 * Evaluates a binary expression
 */
export async function evaluateBinaryExpression(
	node: acorn.BinaryExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
): Promise<any> {
	const [leftValue, rightValue] = await Promise.all([
		evaluateNode(
			ensure(
				node.left,
				val => val.type !== 'PrivateIdentifier',
				'PrivateIdentifier is not supported for the left of a binary expression',
			),
			scope,
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

/**
 * Evaluates a unary expression
 */
export async function evaluateUnaryExpression(
	node: acorn.UnaryExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
): Promise<any> {
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

/**
 * Evaluates a member expression
 */
export async function evaluateMemberExpression(
	node: acorn.MemberExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
	currentClassContext: any,
): Promise<any> {
	if (node.object.type === 'Super') {
		if (!currentClassContext) {
			throw new Error('Super reference is not properly bound to a class method');
		}

		const {thisObj, superClass} = currentClassContext;

		if (!superClass) {
			throw new Error('Cannot use super in a class with no superclass');
		}

		if (node.computed) {
			const propertyExpr = ensure(
				node.property,
				val => val.type !== 'PrivateIdentifier',
				'PrivateIdentifier is not supported in computed MemberExpression',
			);

			const property = await evaluateNode(propertyExpr, scope);

			const method = Object.getPrototypeOf(thisObj.constructor.prototype)[property];

			if (typeof method === 'function') {
				return method.bind(thisObj);
			}

			return method;
		} else {
			if (node.property.type !== 'Identifier') {
				throw new Error('Unsupported property type in Super MemberExpression');
			}

			const propName = node.property.name;

			const method = Object.getPrototypeOf(thisObj.constructor.prototype)[propName];

			if (typeof method === 'function') {
				return method.bind(thisObj);
			}

			return method;
		}
	} else {
		const objectExpr = node.object as acorn.Expression;
		const object = await evaluateNode(objectExpr, scope);

		if (node.computed) {
			const propertyExpr = ensure(
				node.property,
				val => val.type !== 'PrivateIdentifier',
				'PrivateIdentifier is not supported in computed MemberExpression',
			);

			const property = await evaluateNode(propertyExpr, scope);
			const propValue = object[property];

			if (
				typeof propValue === 'function' &&
				!propValue.hasOwnProperty('prototype') &&
				object !== null &&
				object !== undefined
			) {
				return propValue.bind(object);
			}

			return propValue;
		} else {
			if (node.property.type !== 'Identifier') {
				throw new Error('Unsupported property type in MemberExpression');
			}

			if (object === undefined || object === null) {
				throw new TypeError(
					`Cannot read property '${node.property.name}' of ${object === undefined ? 'undefined' : 'null'}`,
				);
			}

			const propName = node.property.name;

			let propValue = object[propName];

			if (typeof propValue === 'function' && object !== null && object !== undefined) {
				const boundMethod = propValue.bind(object);

				return boundMethod;
			}

			return propValue;
		}
	}
}

/**
 * Evaluates an object expression
 */
export async function evaluateObjectExpression(
	node: acorn.ObjectExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
): Promise<any> {
	const result: Record<string, any> = {};

	for (const prop of node.properties) {
		if (prop.type === 'Property') {
			let key: string | number | symbol;

			if (prop.computed) {
				key = await evaluateNode(prop.key, scope);
			} else if (prop.key.type === 'Identifier') {
				key = prop.key.name;
			} else if (prop.key.type === 'Literal') {
				key = String((prop.key as acorn.Literal).value);
			} else {
				throw new Error('Unsupported object property key type: ' + prop.key.type);
			}

			let value: any;
			if (prop.shorthand && prop.key.type === 'Identifier') {
				value = scope.lookup(prop.key.name);
			} else {
				value = await evaluateNode(prop.value, scope);
			}

			if (prop.method && prop.value.type === 'FunctionExpression') {
			}

			if (typeof key === 'symbol') {
				result[key as unknown as string] = value;
			} else {
				result[key] = value;
			}
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

/**
 * Evaluates an array expression
 */
export async function evaluateArrayExpression(
	node: acorn.ArrayExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
): Promise<any[]> {
	const result: any[] = [];

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

/**
 * Evaluates a logical expression
 */
export async function evaluateLogicalExpression(
	node: acorn.LogicalExpression,
	scope: Scope,
	evaluateNode: (node: any, scope: Scope) => Promise<any>,
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
