# Catalog Implementation - Quick Start Guide

## Prerequisites
- MongoDB is running and connected
- Redis is running and configured
- Application is built and running

## Step 1: Create Database Indexes (First Time Only)

**Important**: Run this once to set up optimal query performance.

```bash
# Option A: Using curl
curl -X POST http://localhost:5173/api/inventory/indexes/create \
  -H "Content-Type: application/json"

# Option B: Using the authenticated endpoint
# POST /api/inventory/indexes/create (requires Superadmin role)
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Inventory indexes created successfully"
}
```

**What This Does**:
- Creates index on `inventory_items` collection for fast filtering
- Creates index on `inventory_categories` collection for fast lookups
- Enables full-text search on item names and descriptions
- Optimizes compound queries for catalog display

---

## Step 2: Verify Data Exists

Ensure you have inventory data in MongoDB:

```javascript
// MongoDB Shell
use chtm_cooks_db

// Check if categories exist
db.inventory_categories.countDocuments()

// Check if items exist
db.inventory_items.countDocuments()

// View sample category
db.inventory_categories.findOne()

// View sample item
db.inventory_items.findOne()
```

---

## Step 3: Test the API Endpoint

```bash
# Test catalog endpoint (requires authentication)
curl -X GET "http://localhost:5173/api/inventory/catalog?page=1&limit=10" \
  -H "Cookie: accessToken=<your_token>"

# Test with filters
curl -X GET "http://localhost:5173/api/inventory/catalog?search=knife&category=utensils&availability=available&sortBy=name" \
  -H "Cookie: accessToken=<your_token>"
```

---

## Step 4: Access the Catalog Page

1. **Login** to the application as a student/custodian/instructor
2. **Navigate** to: `http://localhost:5173/(protected)/student/catalog`
3. **Expected UI**:
   - Catalog header with view mode switcher
   - Search and filter controls
   - Grid view showing equipment cards (or list view if selected)
   - Pagination if more than 50 items

---

## Step 5: Test All Features

### ✓ Filtering
- [ ] Search for an item by name
- [ ] Filter by category
- [ ] Filter by availability status
- [ ] Filter by condition
- [ ] Sort by name/category/recent

### ✓ View Modes
- [ ] Switch to grid view
- [ ] Switch to list view
- [ ] Verify layout is responsive on mobile

### ✓ Performance
- [ ] Check browser DevTools Network tab
- [ ] First load should fetch from database (shows in console)
- [ ] Second load with same filters should be faster (served from cache)
- [ ] Verify Redis cache hit in console logs

### ✓ Error Handling
- [ ] Clear filters and refresh - should show all items
- [ ] Simulate network error - should show error message
- [ ] Try accessing as unauthorized user - should show 401/403

---

## Troubleshooting

### Issue: "No items found" message
**Check**:
```javascript
// MongoDB - count items
db.inventory_items.countDocuments({ archived: false })

// Should return > 0
```

**Solution**: Add sample data to MongoDB:
```javascript
db.inventory_categories.insertOne({
  name: "Cookware",
  description: "Pots, pans, and cookware",
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date()
})

db.inventory_items.insertOne({
  name: "Chef Knife",
  category: "Cookware",
  specification: "8 inch stainless steel",
  quantity: 5,
  minStock: 2,
  condition: "Excellent",
  status: "In Stock",
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### Issue: 401 Unauthorized
**Check**: Are you logged in? Verify cookies:
- Browser DevTools > Application > Cookies
- Should have `accessToken` cookie

**Solution**: Login again

### Issue: 403 Forbidden
**Check**: Your user role
- Students: Can view (filtered - available only)
- Custodians: Can view (all items)
- Instructors: Can view (all items)
- Superadmins: Can view + manage indexes

**Solution**: Login with appropriate role

### Issue: Redis cache not working
**Check**: Redis connection
```bash
# Test Redis connection
redis-cli ping
# Should respond: PONG
```

**Verify** environment variable:
```bash
echo $REDIS_URL
# Should output connection string
```

### Issue: Slow queries
**Check**: Indexes exist
```javascript
// MongoDB - list indexes on inventory_items
db.inventory_items.getIndexes()

// Should show: idx_archived_name, idx_categoryid_archived, idx_catalog_query, etc.
```

**Solution**: Create indexes if missing:
- POST `/api/inventory/indexes/create` (superadmin only)

---

## Performance Metrics

### Expected Load Times

| Operation | Time | Status |
|-----------|------|--------|
| First load (no cache) | 100-300ms | ✓ Acceptable |
| Cached load | 10-50ms | ✓ Excellent |
| Search with filters | 150-400ms | ✓ Acceptable |
| Pagination | 50-150ms | ✓ Excellent |

### Cache Statistics
```javascript
// Console logs will show:
"Catalog served from cache"
"Inventory items retrieved"
"categories.length: 5"
"items.length: 12"
```

---

## Monitoring & Logs

### Application Logs
Look for these in your application console:

```
✓ Catalog retrieved userId=... itemsCount=12 total=42 categoriesCount=5
✓ Catalog served from cache cacheKey=inventory:catalog:student:...
✓ Inventory indexes created successfully
```

### Redis Monitoring
```bash
# Monitor Redis commands
redis-cli monitor

# Watch for cache KV operations
# SET inventory:catalog:student:...
# GET inventory:catalog:student:...
```

### Database Monitoring
```javascript
// MongoDB - check query performance
db.inventory_items.find({ archived: false, status: "In Stock" }).explain("executionStats")

// Should use index and return executionStages with IXSCAN (index scan), not COLLSCAN
```

---

## Maintenance

### Regular Tasks

**Weekly**:
- Monitor error logs for failures
- Check cache hit rates
- Verify database indexes are still efficient

**Monthly**:
- Analyze query performance
- Review Redis memory usage
- Check for slow queries in logs

**On Data Changes**:
- When adding/removing many items, cache will auto-refresh after 5 minutes
- Or manually invalidate cache (see below)

### Manual Cache Invalidation

```javascript
// Using Redis CLI
redis-cli DEL "inventory:catalog:*"

// This clears all catalog cache for all users
// Next request will fetch fresh data from database
```

---

## API Response Examples

### Success Response (200 OK)
```json
{
  "categories": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Cookware",
      "description": "Pots and pans",
      "itemCount": 5,
      "archived": false,
      "createdAt": "2024-03-07T10:00:00Z",
      "updatedAt": "2024-03-07T10:00:00Z"
    }
  ],
  "items": [
    {
      "id": "507f1f77bcf86cd799439012",
      "name": "Chef Knife Set",
      "category": "Cookware",
      "specification": "8-piece stainless steel",
      "quantity": 5,
      "status": "In Stock",
      "condition": "Excellent",
      "archived": false,
      "createdAt": "2024-03-07T10:00:00Z",
      "updatedAt": "2024-03-07T10:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "pages": 1,
  "summary": {
    "totalItems": 1,
    "categoriesCount": 1,
    "filteredItemsCount": 1
  }
}
```

### Empty Result (200 OK)
```json
{
  "categories": [],
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 50,
  "pages": 0,
  "summary": {
    "totalItems": 0,
    "categoriesCount": 0
  }
}
```

### Error Response (401)
```json
{
  "error": "Unauthorized"
}
```

### Error Response (500)
```json
{
  "error": "Failed to retrieve catalog",
  "message": "[development mode only] Error details...",
  "status": 500
}
```

---

## Next Steps

1. ✅ **Complete**: Create indexes
2. ✅ **Complete**: Populate test data
3. ✅ **Complete**: Test catalog page
4. ⏳ **Pending**: Request/wishlist features
5. ⏳ **Pending**: Item reviews/ratings
6. ⏳ **Pending**: Email notifications

---

## Support

For issues or questions:
1. Check **Troubleshooting** section above
2. Review **CATALOG_IMPLEMENTATION.md** for detailed documentation
3. Check application logs for error messages
4. Verify MongoDB and Redis are running

---

## File Reference

| File | Purpose |
|------|---------|
| `/src/routes/api/inventory/catalog/+server.ts` | Backend API |
| `/src/lib/api/catalog.ts` | Frontend client |
| `/src/routes/(protected)/student/catalog/+page.svelte` | Catalog page |
| `/src/lib/server/db/indexes/inventoryIndexes.ts` | Database indexes |
| `/CATALOG_IMPLEMENTATION.md` | Full documentation |
| `/CATALOG_QUICK_START.md` | This file |
