// Test fixture: Object manipulation duplicates

// Duplicate Group 5: JSON stringify duplicates
// Expected: 3 exact duplicates

function serializeUser(user) {
  return JSON.stringify(user, null, 2);
}

function formatUserJSON(user) {
  return JSON.stringify(user, null, 2);
}

function userToJSON(user) {
  return JSON.stringify(user, null, 2);
}

// Duplicate Group 6: Object merging
// Expected: 2 structural duplicates (same pattern, different names)

function mergeConfig(base, overrides) {
  return { ...base, ...overrides };
}

function combineOptions(defaults, custom) {
  return { ...defaults, ...custom };
}

// NOT a duplicate - different logic
function deepMerge(obj1, obj2) {
  return Object.assign({}, obj1, obj2); // Different implementation
}

// Duplicate Group 7: Object.keys iteration
// Expected: 2 exact duplicates

function getConfigKeys(config) {
  return Object.keys(config).map(key => key.toUpperCase());
}

function extractKeys(obj) {
  return Object.keys(obj).map(key => key.toUpperCase());
}

// NOT a duplicate - no transformation
function listKeys(data) {
  return Object.keys(data); // Missing map operation
}
