# API Route Testing - Fix Recommendations

## Issue #1: HTTP Status Code (Minor)

**Location:** `/Users/alyshialedlie/code/jobs/api/routes/scans.js`

### Current Code (Line 53)
```javascript
res.json({
  success: true,
  job_id: jobId,
  status_url: `/api/scans/${jobId}/status`,
  results_url: `/api/scans/${jobId}/results`,
  message: 'Scan started successfully',
  timestamp: new Date().toISOString()
});
```

### Fixed Code
```javascript
res.status(201).json({
  success: true,
  job_id: jobId,
  status_url: `/api/scans/${jobId}/status`,
  results_url: `/api/scans/${jobId}/results`,
  message: 'Scan started successfully',
  timestamp: new Date().toISOString()
});
```

### Also Fix Line 97 (start-multi endpoint)
```javascript
res.status(201).json({
  success: true,
  job_id: jobId,
  repository_count: repositoryPaths.length,
  status_url: `/api/scans/${jobId}/status`,
  results_url: `/api/scans/${jobId}/results`,
  message: 'Inter-project scan started successfully',
  timestamp: new Date().toISOString()
});
```

---

## Issue #2: WebSocket Status Route (Critical)

**Location:** `/Users/alyshialedlie/code/jobs/api/server.js`

### Problem
The route `/api/ws/status` is being matched by `/api/scans/:jobId/status` because Express routes are matched in registration order. The scan router with `/:jobId/status` catches requests before the WebSocket status route.

### Solution Options

#### Option 1: Move Outside /api Prefix (Recommended)
**Change in server.js (line 80):**
```javascript
// Before scan routes are mounted
app.get('/ws/status', (req, res) => {
  const clientInfo = wss.getClientInfo();
  res.json({
    ...clientInfo,
    websocket_url: `ws://localhost:${PORT}/ws`,
    timestamp: new Date().toISOString()
  });
});
```

**New URL:** `http://localhost:3000/ws/status`

#### Option 2: Create Separate WebSocket Router
**Create new file: `/Users/alyshialedlie/code/jobs/api/routes/websocket.js`**
```javascript
import express from 'express';

const router = express.Router();

/**
 * GET /api/websocket/status
 * Get WebSocket server status
 */
router.get('/status', (req, res) => {
  const wss = req.app.get('wss');
  const clientInfo = wss.getClientInfo();

  res.json({
    ...clientInfo,
    websocket_url: `ws://localhost:${process.env.API_PORT || 3000}/ws`,
    timestamp: new Date().toISOString()
  });
});

export default router;
```

**Update server.js:**
```javascript
import websocketRoutes from './routes/websocket.js';

// Make WSS available to routes
app.set('wss', wss);

// Mount WebSocket routes BEFORE scan routes
app.use('/api/websocket', websocketRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/reports', reportRoutes);
```

**New URL:** `http://localhost:3000/api/websocket/status`

#### Option 3: More Specific WebSocket Path
**Change in server.js:**
```javascript
// Mount BEFORE scan routes
app.get('/api/websocket-status', (req, res) => {
  const clientInfo = wss.getClientInfo();
  res.json({
    ...clientInfo,
    websocket_url: `ws://localhost:${PORT}/ws`,
    timestamp: new Date().toISOString()
  });
});

// Then mount scan routes
app.use('/api/scans', scanRoutes);
```

**New URL:** `http://localhost:3000/api/websocket-status`

### Recommendation
**Use Option 1** (move to `/ws/status`) because:
1. Keeps WebSocket-related endpoints together (`/ws` for connection, `/ws/status` for info)
2. No `/api` prefix matches WebSocket's non-REST nature
3. Simplest implementation
4. No authentication required (status is public info)

---

## Testing the Fixes

### Test Fix #1 (HTTP 201)
```bash
# Should return HTTP 201 instead of 200
curl -i -X POST \
  -H "X-API-Key: test" \
  -H "Content-Type: application/json" \
  -d '{"repositoryPath": "/Users/alyshialedlie/code/jobs/sidequest"}' \
  http://localhost:3000/api/scans/start

# Look for: HTTP/1.1 201 Created
```

### Test Fix #2 (WebSocket Status)
```bash
# Option 1 - Should return 200 with WebSocket info
curl -s http://localhost:3000/ws/status | jq '.'

# Option 2 - Should return 200 with WebSocket info
curl -s -H "X-API-Key: test" http://localhost:3000/api/websocket/status | jq '.'
```

---

## Implementation Steps

### Step 1: Fix HTTP Status Codes
```bash
# Edit the file
code api/routes/scans.js

# Make changes at lines 53 and 97
# Add .status(201) before .json()
```

### Step 2: Fix WebSocket Route (Option 1)
```bash
# Edit server.js
code api/server.js

# Change line 80 from:
#   app.get('/api/ws/status', ...)
# To:
#   app.get('/ws/status', ...)

# Move this BEFORE the authentication middleware
# So it remains publicly accessible
```

### Step 3: Restart Server
```bash
# Stop server
pkill -f "node api/server.js"

# Start server
doppler run -- node api/server.js

# Or with PM2
pm2 restart duplicate-detection-api
```

### Step 4: Verify Fixes
```bash
# Run test suite
./test-api-routes.sh

# Should now show: Passed: 15, Failed: 0
```

---

## Additional Considerations

### Update API Documentation
After implementing fixes, update:
1. API endpoint documentation
2. OpenAPI/Swagger spec
3. Client SDK examples
4. Integration test expectations

### Future Improvements
1. **Add route ordering tests** - Detect conflicts automatically
2. **Enforce HTTP status codes** - Linting rules for REST conventions
3. **WebSocket connection tests** - Test actual WS connections, not just status
4. **Rate limiting tests** - Verify limits are enforced correctly

---

## Expected Results After Fixes

### Test Summary (Expected)
```
Total Tests:  15
Passed:       15 ✅
Failed:       0
```

### All Endpoints Working
- ✅ `/health` - 200 OK
- ✅ `/api/repositories` - 200 OK, 401 without auth
- ✅ `/api/repositories/:name` - 200 OK, 404 for invalid
- ✅ `/api/scans/start` - **201 Created** (fixed)
- ✅ `/api/scans/stats` - 200 OK
- ✅ `/api/reports` - 200 OK
- ✅ `/ws/status` - **200 OK** (fixed)

---

## Estimated Time to Fix
- **Issue #1:** 2 minutes (2 line changes)
- **Issue #2:** 5 minutes (1 line change + route reordering)
- **Testing:** 3 minutes
- **Total:** ~10 minutes
