// Edge Case Tests for Duplicate Detection

// Edge Case 1: Single-line vs multi-line (should be exact duplicates)
const singleLine = (arr) => arr.filter(x => x > 0).map(x => x * 2);

function multiLine(arr) {
  return arr
    .filter(x => x > 0)
    .map(x => x * 2);
}

// Edge Case 2: Arrow function vs regular function (should be structural duplicates)
const arrowSum = (a, b) => a + b;
function regularSum(a, b) { return a + b; }

// Edge Case 3: Template literals vs string concatenation (NOT duplicates - different approach)
function greetTemplate(name) {
  return `Hello, ${name}!`;
}

function greetConcat(name) {
  return 'Hello, ' + name + '!';
}

// Edge Case 4: Destructuring vs property access (should be structural duplicates)
function getUserNameDestruct({ name }) {
  return name;
}

function getUserNameAccess(user) {
  return user.name;
}

// Edge Case 5: Ternary vs if-else (should be structural duplicates)
function isAdultTernary(age) {
  return age >= 18 ? 'adult' : 'minor';
}

function isAdultIfElse(age) {
  if (age >= 18) {
    return 'adult';
  }
  return 'minor';
}

// Edge Case 6: Very similar but semantically different (NOT duplicates)
function findMax(arr) {
  return Math.max(...arr); // Returns maximum value
}

function findMin(arr) {
  return Math.min(...arr); // Returns minimum value - opposite logic
}

// Edge Case 7: Same logic, different order (should be exact duplicates)
function validateUser1(user) {
  if (!user) return false;
  if (!user.name) return false;
  if (!user.email) return false;
  return true;
}

function validateUser2(user) {
  if (!user) return false;
  if (!user.name) return false;
  if (!user.email) return false;
  return true;
}

// Edge Case 8: Nested functions (should detect outer function duplicates)
function processItems1(items) {
  return items.map(item => {
    return item.value * 2;
  });
}

function processItems2(items) {
  return items.map(item => {
    return item.value * 2;
  });
}

// Edge Case 9: Try-catch with different error messages (should be structural duplicates)
async function fetchData1() {
  try {
    return await fetch('/api/data');
  } catch (error) {
    console.error('Failed to fetch data');
    throw error;
  }
}

async function fetchData2() {
  try {
    return await fetch('/api/data');
  } catch (error) {
    console.error('Data fetch error');
    throw error;
  }
}

// Edge Case 10: Default parameters (should be structural duplicates)
function greet1(name = 'Guest') {
  return `Hello, ${name}`;
}

function greet2(name = 'User') {
  return `Hello, ${name}`;
}

// Edge Case 11: Array vs spread operator (NOT duplicates - different approach)
function mergeArrays1(arr1, arr2) {
  return arr1.concat(arr2);
}

function mergeArrays2(arr1, arr2) {
  return [...arr1, ...arr2];
}

// Edge Case 12: Empty function bodies (should NOT be duplicates - no logic)
function noop1() {}
function noop2() {}

// Edge Case 13: Constants with same value (should be exact duplicates)
const MAX_RETRIES_1 = 3;
const MAX_RETRIES_2 = 3;

// Edge Case 14: Complex nested logic (exact duplicates)
function complexValidation1(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (Array.isArray(data.items)) {
    return data.items.every(item => item.valid === true);
  }

  return false;
}

function complexValidation2(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (Array.isArray(data.items)) {
    return data.items.every(item => item.valid === true);
  }

  return false;
}

// Edge Case 15: Chained methods (exact duplicates)
function processString1(str) {
  return str.trim().toLowerCase().replace(/\s+/g, '-');
}

function processString2(str) {
  return str.trim().toLowerCase().replace(/\s+/g, '-');
}
