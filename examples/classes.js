import {evaluate} from '../src';

// Classes example
const globalObject = {};

const code = `
// Basic class example with inheritance
class Animal {
  constructor(name) {
    this.name = name;
    this.energy = 100;
  }
  
  makeSound() {
    this.energy -= 3;
    return \`\${this.name} makes a sound. Energy: \${this.energy}\`;
  }
  
  static create(name) {
    return new Animal(name);
  }
}

// Inheritance
class Dog extends Animal {
  constructor(name, breed) {
    super(name);
    this.breed = breed;
  }
  
  makeSound() {
    this.energy -= 5;
    return \`\${this.name} barks! Energy: \${this.energy}\`;
  }
  
  fetch() {
    this.energy -= 10;
    return \`\${this.name} fetches a ball\`;
  }
}

// Create instances and use methods
const animal = new Animal("Generic");
const dog = new Dog("Buddy", "Golden Retriever");

// Create using static method
const anotherAnimal = Animal.create("Created");

// Return results
{
  animalSound: animal.makeSound(),
  dogSound: dog.makeSound(),
  dogFetch: dog.fetch(),
  dogEnergy: dog.energy,
  inheritance: {
    isDogAnimal: dog instanceof Animal,
    hasOwnMethod: dog.fetch !== undefined,
    hasParentProperty: dog.name !== undefined
  }
}
`;

console.log(await evaluate(globalObject, code));
