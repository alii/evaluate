import * as acorn from 'acorn';
import {Scope} from '../scope.ts';
import {getRuntimeFunction} from './functions.ts';
import {ClassContext, evaluateNode} from './nodes.ts';
import {formatError, isModuleDeclaration} from './utils.ts';

export type GlobalObject = Record<string, any>;

/**
 * Evaluates JavaScript code without using the built-in eval function
 * @param globalObj The global object context to use when evaluating
 * @param script The JavaScript code to evaluate
 * @returns The result of evaluating the script
 */
export async function evaluate<T>(globalObj: GlobalObject, script: string): Promise<T> {
	try {
		const ast = acorn.parse(script, {
			ecmaVersion: 2025,
			sourceType: 'module',
			allowAwaitOutsideFunction: true,
			locations: true,
		});

		return evaluateAST(globalObj, ast, script);
	} catch (error) {
		if (error instanceof Error) {
			throw formatError(script, error);
		}

		throw error;
	}
}

export async function evaluateAST(
	globalObj: GlobalObject,
	ast: acorn.Program,
	originalScript?: string,
) {
	if (!globalObj.console) {
		globalObj.console = console;
	}

	if (!globalObj.Object) {
		globalObj.Object = Object;
	}

	if (!globalObj.Array) {
		globalObj.Array = Array;
	}

	if (!globalObj.Promise) {
		globalObj.Promise = Promise;
	}

	const globalScope = new Scope(null, globalObj);
	let currentClassContext: ClassContext | null = null;

	const setCurrentClassContext = (context: ClassContext | null) => {
		currentClassContext = context;
	};

	try {
		let result: any = undefined;
		for (const statement of ast.body) {
			if (isModuleDeclaration(statement)) {
				throw new Error('Module declarations are not supported');
			}

			try {
				const validStatement = statement as acorn.Statement;

				result = await evaluateNode(
					validStatement,
					globalScope,
					currentClassContext,
					setCurrentClassContext,
				);
			} catch (error) {
				if (error instanceof Error && originalScript && statement.loc) {
					const location = {
						line: statement.loc.start.line,
						column: statement.loc.start.column,
					};
					throw formatError(originalScript, error, location);
				} else {
					throw error;
				}
			}
		}

		for (const [key, value] of globalScope.getVariables()) {
			globalObj[key] = value;
		}

		return result;
	} finally {
		globalScope.release();
	}
}

export {getRuntimeFunction};
