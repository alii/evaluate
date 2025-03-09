import {evaluate} from '../src';

// Objects and arrays example
const globalObject = {};

const code = `
// Object and nested properties
const person = {
  firstName: "John",
  lastName: "Doe",
  address: { city: "Anytown", country: "USA" },
  hobbies: ["reading", "coding"]
};

// Destructuring examples
const { firstName, lastName } = person;
const { address: { city } } = person;
const [hobby1, hobby2] = person.hobbies;

// Spread operator
const updatedPerson = {
  ...person,
  age: 30,
  address: { ...person.address, city: "New City" }
};

// Array methods with arrow functions
const people = [
  { name: "Alice", age: 25 },
  { name: "Bob", age: 32 }
];
const adults = people.filter(p => p.age >= 30);
const names = people.map(p => p.name);

// Return results
{
  destructuring: { firstName, lastName, city, hobby1 },
  spreadResults: {
    updatedCity: updatedPerson.address.city,
    hasOriginalProps: !!updatedPerson.hobbies
  },
  arrays: { adults, names }
}
`;

console.log(await evaluate(globalObject, code));