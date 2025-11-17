// Test fixture: Environment variable access duplicates

// Duplicate Group 14: ENV access with defaults
// Expected: 3 exact duplicates

function getPort() {
  return process.env.PORT || 3000;
}

function getServerPort() {
  return process.env.PORT || 3000;
}

function defaultPort() {
  return process.env.PORT || 3000;
}

// Duplicate Group 15: Boolean ENV parsing
// Expected: 2 structural duplicates

function isDebugEnabled() {
  return process.env.DEBUG === 'true';
}

function isProductionMode() {
  return process.env.NODE_ENV === 'production';
}

// NOT a duplicate - different logic
function isDevelopment() {
  return process.env.NODE_ENV !== 'production'; // Negated logic
}

// Duplicate Group 16: Config object builders
// Expected: 2 exact duplicates

function buildConfig() {
  return {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    debug: process.env.DEBUG === 'true'
  };
}

function getConfiguration() {
  return {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    debug: process.env.DEBUG === 'true'
  };
}
