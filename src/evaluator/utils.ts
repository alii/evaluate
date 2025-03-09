/**
 * Type guard function to ensure a value is of a specific type
 * @param value The value to check
 * @param check A function that checks if the value is of the expected type
 * @param errorMessage Error message to throw if the value is not of the expected type
 * @returns The value with the correct type
 */
export function ensure<In, T extends In>(
  value: In,
  check: (val: In) => val is T,
  errorMessage: string,
): T {
  if (!check(value)) {
    throw new Error(errorMessage);
  }

  return value;
}

/**
 * Type for error location information
 */
export type ErrorLocation = {
  line: number;
  column: number;
  source?: string;
};

/**
 * Formats an error with line and column indicators
 * @param script The original script where the error occurred
 * @param error The error that was thrown
 * @param location Error location information (can be undefined for non-syntax errors)
 * @returns A formatted error message with line and position indicators
 */
export function formatError(script: string, error: Error, location?: ErrorLocation): Error {
  const lines = script.split('\n');

  if (!location) {
    if (error instanceof SyntaxError) {
      const locMatch = error.message.match(/\((\d+):(\d+)\)/);
      if (locMatch) {
        location = {
          line: parseInt(locMatch[1], 10),
          column: parseInt(locMatch[2], 10),
        };
      } else {
        return error;
      }
    } else {
      return error;
    }
  }

  const lineNumber = location.line;
  const columnNumber = location.column;

  let formattedError = `${error.name}: ${error.message}\n\n`;

  const startLine = Math.max(0, lineNumber - 2);
  const endLine = Math.min(lines.length - 1, lineNumber);

  for (let i = startLine; i <= endLine; i++) {
    const isErrorLine = i === lineNumber - 1;
    const lineNum = String(i + 1).padStart(4, ' ');

    const line = i < lines.length ? lines[i] : '';
    formattedError += `${lineNum} | ${line}\n`;

    if (isErrorLine) {
      const caretPadding = ' '.repeat(columnNumber + 7);
      formattedError += `${caretPadding}^ here\n`;
    }
  }

  const ErrorConstructor = error.constructor as new (message: string) => Error;
  try {
    return new ErrorConstructor(formattedError);
  } catch (e) {
    return new Error(formattedError);
  }
}

export function isModuleDeclaration(statement: any) {
  return (
    statement.type === 'ImportDeclaration' ||
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration' ||
    statement.type === 'ExportAllDeclaration'
  );
}