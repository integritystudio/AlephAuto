// Test fixture: Express route handler duplicates

// Duplicate Group 8: Error response handlers
// Expected: 3 exact duplicates

function handleNotFound(req, res) {
  res.status(404).json({ message: 'Not found' });
}

function sendNotFoundError(req, res) {
  res.status(404).json({ message: 'Not found' });
}

function notFoundHandler(req, res) {
  res.status(404).json({ message: 'Not found' });
}

// Duplicate Group 9: Success responses
// Expected: 2 structural duplicates

function sendUserSuccess(res, user) {
  res.status(200).json({ data: user });
}

function sendProductSuccess(res, product) {
  res.status(200).json({ data: product });
}

// NOT a duplicate - different status code
function sendCreatedResponse(res, data) {
  res.status(201).json({ data: data }); // 201 instead of 200
}

// Duplicate Group 10: Auth middleware pattern
// Expected: 2 exact duplicates

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function checkAuthentication(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// NOT a duplicate - different check
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) { // Additional check
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
