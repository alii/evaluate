import {evaluate} from '../src';

const globalObject = {
	Math,
};

const code = `
    Math.sin(2);
`;

console.log(await evaluate(globalObject, code));
