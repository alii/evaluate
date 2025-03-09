import {evaluate} from '../src';

// Conditional logic example
const globalObject = {
  Array: { isArray: Array.isArray }
};

const code = `
// If/else example
function getGrade(score) {
  if (score >= 90) return 'A';
  else if (score >= 80) return 'B';
  else if (score >= 70) return 'C';
  else if (score >= 60) return 'D';
  else return 'F';
}

// While loop
function sumToN(n) {
  let sum = 0;
  let i = 1;
  while (i <= n) {
    sum += i;
    i++;
  }
  return sum;
}

// Try/catch
function safeDivide(a, b) {
  try {
    if (b === 0) throw new Error("Cannot divide by zero");
    return a / b;
  } catch (error) {
    return error.message;
  }
}

// Switch statement
function getDayType(day) {
  switch (day) {
    case 0:
    case 6:
      return "Weekend";
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return "Weekday";
    default:
      return "Invalid day";
  }
}

// Logical operators and nullish coalescing
const config = { theme: null };
const theme = config.theme ?? "default";

// Return results
{
  grades: {
    score95: getGrade(95),
    score85: getGrade(85),
    score55: getGrade(55)
  },
  whileLoop: sumToN(5),
  errorHandling: {
    success: safeDivide(10, 2),
    error: safeDivide(10, 0)
  },
  switchExample: {
    monday: getDayType(1),
    sunday: getDayType(0),
    invalid: getDayType(10)
  },
  nullishCoalescing: theme
}
`;

console.log(await evaluate(globalObject, code));