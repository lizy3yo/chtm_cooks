# Debugging Reports & Analytics Loading Issue

## Current Status
The reports page shows skeleton loaders but doesn't load data. Added comprehensive logging to identify the bottleneck.

## How to Debug

### 1. Open Browser Developer Tools
- Press `F12` or right-click → Inspect
- Go to the **Console** tab

### 2. Check Console Logs
Look for these log messages:

```
[Reports] Loading report... { period, customFrom, customTo, forceRefresh }
[Analytics API] Fetching analytics... { period, from, to, forceRefresh }
[Analytics API] Fetching from server, attempt 1
[Analytics API] Fetch completed in X ms, status: 200
[Analytics API] Data normalized successfully
[Reports] Report loaded successfully in X ms
```

### 3. Check Network Tab
- Go to the **Network** tab
- Look for `/api/reports/analytics?period=month`
- Check:
  - Status code (should be 200)
  - Response time
  - Response data

### 4. Check Server Logs
Look for these server-side logs:

```
[reports-analytics] Analytics request started
[reports-analytics] Request params { period, from, to, skipCache }
[reports-analytics] Cache miss, querying database
[reports-analytics] Starting parallel queries
[reports-analytics] Executing borrow request queries
[reports-analytics] Borrow request queries completed { duration }
[reports-analytics] Querying overdue requests
[reports-analytics] Analytics report generated { period, duration, cacheKey }
```

## Common Issues & Solutions

### Issue 1: Request Times Out (60+ seconds)
**Symptoms**: Console shows "Fetch error: AbortError" or timeout
**Solution**: Database queries are too slow

**Fix**:
1. Add MongoDB indexes:
```javascript
// In MongoDB shell or Compass
db.borrow_requests.createIndex({ createdAt: 1 });
db.borrow_requests.createIndex({ studentId: 1, createdAt: 1 });
db.borrow_requests.createIndex({ status: 1, returnDate: 1 });
db.replacement_obligations.createIndex({ incidentDate: 1 });
db.replacement_obligations.createIndex({ studentId: 1, status: 1 });
```

2. Reduce data volume temporarily:
   - Use "Today" or "Last 7 Days" instead of "Month-to-Date"
   - This will query less data

### Issue 2: 401 Unauthorized
**Symptoms**: Console shows "Analytics request failed: 401"
**Solution**: User not logged in or session expired

**Fix**:
1. Refresh the page
2. Log out and log back in
3. Clear browser cookies

### Issue 3: 500 Server Error
**Symptoms**: Console shows "Analytics request failed: 500"
**Solution**: Server-side error

**Fix**:
1. Check server logs for error details
2. Look for MongoDB connection issues
3. Check if all collections exist

### Issue 4: Stuck on "Fetching from server"
**Symptoms**: Console shows fetch started but never completes
**Solution**: Database query hanging

**Fix**:
1. Check MongoDB is running
2. Check network connectivity to MongoDB
3. Look at MongoDB slow query log
4. Reduce query complexity (see below)

## Temporary Performance Fix

If the page still won't load, use this simplified version:

### Option A: Reduce Query Limits
Edit `src/routes/api/reports/analytics/+server.ts`:

```typescript
// Change all limits from 10-30 to 5
{ $limit: 5 }  // Instead of { $limit: 10 }
```

### Option B: Disable Heavy Queries
Comment out the borrowing analytics section temporarily:

```typescript
// const borrowingAnalyticsData = await parallelAggregations<{
//   ...
// }>({
//   ...
// });

// Use empty defaults instead
const itemsBorrowedToday = [];
const itemsBorrowedLast7Days = [];
// ... etc
```

### Option C: Use Cached Data Only
Add this at the start of the GET handler:

```typescript
// Force return cached data or empty response
const cached = await cacheService.get(cacheKey);
if (cached) return json(cached);

// Return minimal empty response for testing
return json({
  meta: { period, from: start.toISOString(), to: end.toISOString(), generatedAt: now.toISOString() },
  borrowRequests: { /* minimal data */ },
  // ... etc
});
```

## Performance Benchmarks

Expected timings:
- **With indexes + cache**: 200-500ms
- **With indexes, no cache**: 1-3 seconds
- **Without indexes**: 10-60+ seconds (SLOW!)

## Next Steps

1. Run the page and check console logs
2. Note which log message is the last one you see
3. Share the console output to identify the exact bottleneck
4. Add the recommended MongoDB indexes
5. Test with smaller date ranges first

## MongoDB Index Creation Script

Run this in MongoDB shell or Compass:

```javascript
// Switch to your database
use your_database_name;

// Create indexes for borrow_requests
db.borrow_requests.createIndex({ createdAt: 1 });
db.borrow_requests.createIndex({ studentId: 1, createdAt: 1 });
db.borrow_requests.createIndex({ status: 1, returnDate: 1 });
db.borrow_requests.createIndex({ "items.itemId": 1 });

// Create indexes for replacement_obligations
db.replacement_obligations.createIndex({ incidentDate: 1 });
db.replacement_obligations.createIndex({ studentId: 1, status: 1 });
db.replacement_obligations.createIndex({ borrowRequestId: 1 });
db.replacement_obligations.createIndex({ status: 1 });

// Create indexes for users (for lookups)
db.users.createIndex({ _id: 1, firstName: 1, lastName: 1, email: 1 });

// Verify indexes were created
db.borrow_requests.getIndexes();
db.replacement_obligations.getIndexes();
```

## Contact

If the issue persists after:
1. Adding indexes
2. Checking console logs
3. Trying smaller date ranges

Then share:
- Console log output
- Network tab screenshot
- Server log output
- MongoDB version and size of collections
