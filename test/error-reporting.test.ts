import {describe, expect, test} from 'bun:test';
import {evaluate} from '../src/evaluator.ts';

describe('Error Reporting', () => {
	test('reports syntax errors with line and column indicators', async () => {
		const code = `
			const x = 1;
			const y = 2;
			const z = x +* y; // Invalid syntax (plus-asterisk)
			const sum = x + y;
		`;

		// Expect the function to throw a SyntaxError
		try {
			await evaluate({}, code);
			// If we reach here, the test should fail
			expect(true).toBe(false); // Force failure if no exception
		} catch (error) {
			// Verify it's a SyntaxError
			expect(error).toBeInstanceOf(SyntaxError);
			// Verify the error message contains line and column information
			const errorMessage = error.message;

			// Check for key elements in the formatted error
			expect(errorMessage).toContain('SyntaxError');
			expect(errorMessage).toContain('|');
			expect(errorMessage).toContain('^');

			// Should include the problematic line
			expect(errorMessage).toContain('const z = x +* y;');
		}
	});

	test('reports reference errors with location information', async () => {
		const code = `
			const x = 1;
			const y = 2;
			const z = x + nonExistentVariable; // Reference error
		`;

		try {
			await evaluate({}, code);
			expect(true).toBe(false); // Force failure if no exception
		} catch (error) {
			// Check that the error message contains formatted information
			const errorMessage = error.message;

			// Basic error information should be present
			expect(errorMessage).toContain('nonExistentVariable');

			// Formatted error should include line and pointer
			expect(errorMessage).toContain('|');
			expect(errorMessage).toContain('^');
			expect(errorMessage).toContain('here');

			// Should include the problematic line
			expect(errorMessage).toContain('const z = x + nonExistentVariable;');
		}
	});
});
