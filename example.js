async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Starting counter');

let i = 1;
while (i <= 3) {
  await delay(1000);
  console.log(i);
  i = i + 1;
}

console.log('Done!');

('this is the last expression, so gets returned');
