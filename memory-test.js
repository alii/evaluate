function createScopes(depth) {
  if (depth <= 0) return;

  let f = function () {
    return depth;
  };

  f = function () {
    return depth * 2;
  };

  {
    let x = depth;
    {
      let y = x * 2;
      {
        let z = y * 2;
        console.log(z);
      }
    }
  }

  createScopes(depth - 1);
}

createScopes(100);

let i = 0;
while (i < 1000) {
  let temp = function () {
    return i;
  };
  temp = function () {
    return i * 2;
  };
  temp = function () {
    return i * 3;
  };
  i = i + 1;
}

console.log('Memory test completed');
