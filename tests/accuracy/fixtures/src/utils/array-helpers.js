// Test fixture: Exact duplicates (Group 1)
// Expected: 3 exact duplicates detected

// Duplicate 1a - filter then map
function getUserNames(users) {
  return users.filter(u => u.active).map(u => u.name);
}

// Duplicate 1b - exact same code
function getActiveUserNames(users) {
  return users.filter(u => u.active).map(u => u.name);
}

// Duplicate 1c - exact same code again
function filterActiveUsers(users) {
  return users.filter(u => u.active).map(u => u.name);
}

// Test fixture: Structural duplicates (Group 2)
// Expected: 2 structural duplicates detected (similar structure, different variables)

// Duplicate 2a - filter products
function getAvailableProducts(products) {
  return products.filter(p => p.inStock).map(p => p.title);
}

// Duplicate 2b - filter items (same structure, different names)
function getActiveItems(items) {
  return items.filter(i => i.enabled).map(i => i.label);
}

// Test fixture: Similar but NOT duplicate
// Expected: NO duplicate detected (different logic)

function getAllUserNames(users) {
  return users.map(u => u.name); // No filter - different behavior
}

function getUserNamesReversed(users) {
  return users.filter(u => u.active).map(u => u.name).reverse(); // Extra operation
}

// Test fixture: Edge case - comments only different
// Expected: Exact duplicate (comments shouldn't matter)

// Duplicate 3a - with comments
function processData(data) {
  // Process the data
  return data.map(item => item.value);
}

// Duplicate 3b - different comments
function transformData(data) {
  // Transform the data differently
  return data.map(item => item.value);
}

// Test fixture: Whitespace differences
// Expected: Exact duplicate (whitespace shouldn't matter)

// Duplicate 4a - compact
function compact(arr) { return arr.filter(Boolean); }

// Duplicate 4b - expanded
function removeEmpty(arr) {
  return arr.filter(Boolean);
}
