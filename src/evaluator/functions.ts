import {RuntimeFunction} from '../runtime.ts';

const functionMap = new WeakMap<Function, RuntimeFunction>();

/**
 * Creates a wrapper function around a RuntimeFunction
 */
export function createWrappedFunction(runtimeFunc: RuntimeFunction): Function {
	const wrapper = async (...args: any[]) => {
		return runtimeFunc.call(null, args);
	};

	functionMap.set(wrapper, runtimeFunc);

	return wrapper;
}

/**
 * Gets the associated RuntimeFunction for a function
 */
export function getRuntimeFunction(func: Function): RuntimeFunction | undefined {
	return functionMap.get(func);
}
