import {RuntimeFunction} from './runtime.ts';
import {Scope} from './scope.ts';

export class MemoryTracker {
	private static instance: MemoryTracker;
	private activeScopes: Set<Scope> = new Set();
	private activeFunctions: Set<RuntimeFunction> = new Set();

	private constructor() {}

	static getInstance(): MemoryTracker {
		if (!MemoryTracker.instance) {
			MemoryTracker.instance = new MemoryTracker();
		}
		return MemoryTracker.instance;
	}

	trackScope(scope: Scope): void {
		this.activeScopes.add(scope);
	}

	untrackScope(scope: Scope): void {
		this.activeScopes.delete(scope);
	}

	trackFunction(func: RuntimeFunction): void {
		this.activeFunctions.add(func);
	}

	untrackFunction(func: RuntimeFunction): void {
		this.activeFunctions.delete(func);
	}

	getStats() {
		return {
			activeScopes: this.activeScopes.size,
			activeFunctions: this.activeFunctions.size,
		};
	}

	reset(): void {
		this.activeScopes.clear();
		this.activeFunctions.clear();
	}
}
