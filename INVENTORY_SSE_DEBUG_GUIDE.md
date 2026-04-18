# Inventory SSE Real-Time Updates - Debug Guide

## Issue
Custodian inventory page requires page reload to see changes from donations and obligation resolutions. SSE events are being received but the UI is not updating.

## Architecture Overview

### Event Flow
```
1. User creates donation/resolves obligation
   ↓
2. Server publishes inventory_change event
   ↓
3. SSE broker broadcasts to all listeners
   ↓
4. Client receives event via EventSource
   ↓
5. scheduleRefresh() called (250ms debounce)
   ↓
6. refreshInventory() called
   ↓
7. Cache invalidated
   ↓
8. Fresh data fetched with forceRefresh=true
   ↓
9. Reactive state updated (items = freshItems)
   ↓
10. Cache updated with fresh data
   ↓
11. UI re-renders with new data
```

## Recent Changes

### 1. Enhanced Logging
Added comprehensive logging throughout the entire SSE flow:
- `[INVENTORY-SSE]` prefix for client-side inventory operations
- `[INVENTORY-API]` prefix for API calls
- `[SSE-BROKER]` prefix for server-side event broadcasting
- `[SSE-STREAM]` prefix for SSE stream operations

### 2. Improved refreshInventory()
**Before:**
```typescript
async function refreshInventory() {
  inventoryStore.invalidateAll();
  await Promise.all([
    loadItems(true),
    loadCategories(true)
  ]);
}
```

**After:**
```typescript
async function refreshInventory() {
  // Invalidate cache
  inventoryStore.invalidateAll();
  
  // Fetch fresh data directly
  const freshItems = await fetchAllInventoryItems(true, true);
  const categoriesResponse = await inventoryCategoriesAPI.getAll({ includeArchived: true });
  
  // Update reactive state immediately
  items = freshItems;
  categories = categoriesResponse.categories;
  
  // Update cache
  inventoryStore.setItems(freshItems);
  inventoryStore.setCategories(categoriesResponse.categories);
}
```

**Key Improvement:** Direct assignment to reactive state ensures immediate UI update.

### 3. Enhanced loadItems()
```typescript
async function loadItems(forceRefresh = false) {
  // ... cache check ...
  
  const freshItems = await fetchAllInventoryItems(true, forceRefresh);
  
  // Update reactive state immediately
  items = freshItems;
  
  // Update cache
  inventoryStore.setItems(freshItems);
}
```

**Key Improvement:** Separate variable for fresh data, then direct assignment to reactive state.

## Testing Steps

### Step 1: Verify SSE Connection
1. Open custodian inventory page
2. Open browser console
3. Look for:
   ```
   [INVENTORY-SSE] 🚀 Setting up SSE subscriptions...
   [INVENTORY-SSE] ✅ SSE subscriptions established
   ```

### Step 2: Create a Donation
1. Go to Replacement page
2. Create a new donation
3. Check console for:
   ```
   [DONATION-API] Publishing donation_created event
   [SSE-BROKER] ===== PUBLISHING EVENT =====
   [SSE-BROKER] Channels: ["inventory:all"]
   [SSE-BROKER] Event: { action: "item_updated", ... }
   [SSE-STREAM] Event sent to client
   ```

### Step 3: Verify Client Receives Event
In inventory page console, look for:
```
[INVENTORY-SSE] 📡 Inventory change event received: {...}
[INVENTORY-SSE] ⏱️ Scheduling refresh (250ms debounce)...
[INVENTORY-SSE] ⏱️ Debounce timer fired, calling refreshInventory()
```

### Step 4: Verify Refresh Flow
Look for complete refresh sequence:
```
[INVENTORY-SSE] 🔄 refreshInventory called
[INVENTORY-SSE] 🗑️ Invalidating cache...
[INVENTORY-SSE] 📊 Cache stats after invalidation: {...}
[INVENTORY-SSE] 📥 Fetching fresh data from API...
[INVENTORY-API] 🌐 getAll called with params: { forceRefresh: true }
[INVENTORY-API] 🔄 Force refresh enabled, adding timestamp: ...
[INVENTORY-API] 📡 Fetching from URL: /api/inventory/items?...&_t=...
[INVENTORY-API] ✅ Received X items
[INVENTORY-SSE] ✅ Fresh data received from API
[INVENTORY-SSE] ✅ Reactive state and cache updated
[INVENTORY-SSE] 📦 First item: ... quantity: X donations: Y currentCount: Z
```

### Step 5: Manual Testing
Use test functions in browser console:

```javascript
// Check current state
window.testInventoryState()

// Manually trigger refresh
window.testInventoryRefresh()

// Invalidate cache
window.testInvalidateCache()
```

## Common Issues & Solutions

### Issue 1: SSE Events Not Received
**Symptoms:**
- No `[INVENTORY-SSE] 📡 Inventory change event received` logs
- No refresh triggered

**Check:**
1. Server logs for `[SSE-BROKER] ===== PUBLISHING EVENT =====`
2. SSE connection status in Network tab (should show `stream` type)
3. EventSource readyState (should be 1 = OPEN)

**Solution:**
- Verify SSE stream endpoint is running
- Check authentication cookies are being sent
- Verify broker has active listeners

### Issue 2: Refresh Not Triggered
**Symptoms:**
- Events received but no `[INVENTORY-SSE] 🔄 refreshInventory called`

**Check:**
1. `scheduleRefresh()` is being called
2. No JavaScript errors blocking execution

**Solution:**
- Check for errors in console
- Verify debounce timer is firing

### Issue 3: Data Fetched But UI Not Updating
**Symptoms:**
- Fresh data fetched (logs show new values)
- UI still shows old data

**Check:**
1. Reactive state assignment: `items = freshItems`
2. Svelte reactivity not triggered

**Solution:**
- Ensure direct assignment to reactive variable
- Check for Svelte 5 runes syntax issues
- Verify component is still mounted

### Issue 4: Cache Serving Stale Data
**Symptoms:**
- `forceRefresh=true` but old data returned
- Timestamp parameter not added to URL

**Check:**
1. `forceRefresh` parameter passed through entire chain
2. URL includes `_t=` timestamp parameter
3. Server-side caching headers

**Solution:**
- Verify `forceRefresh` is passed to `inventoryItemsAPI.getAll()`
- Check URL in Network tab includes timestamp
- Clear browser cache if needed

## Key Files

### Client-Side
- `src/routes/(protected)/custodian/inventory/+page.svelte` - Main inventory page
- `src/lib/api/inventory.ts` - Inventory API client
- `src/lib/stores/inventory.ts` - Client-side cache store

### Server-Side
- `src/routes/api/inventory/stream/+server.ts` - SSE stream endpoint
- `src/lib/server/realtime/inventoryEvents.ts` - Event broker
- `src/routes/api/donations/+server.ts` - Donation creation (publishes events)
- `src/routes/api/replacement-obligations/[id]/+server.ts` - Obligation resolution (publishes events)

## Expected Console Output (Success Case)

### On Page Load
```
[INVENTORY-SSE] 🚀 Setting up SSE subscriptions...
[INVENTORY-SSE] ✅ SSE subscriptions established
[INVENTORY-SSE] 📥 loadItems called, forceRefresh: false
[INVENTORY-SSE] 🌐 Fetching fresh items from API...
[INVENTORY-API] 🌐 getAll called with params: {...}
[INVENTORY-API] ✅ Received 50 items
[INVENTORY-SSE] ✅ Loaded items from API: 50
[INVENTORY-SSE] 💾 Cache updated with fresh items
```

### On Donation Created
```
[DONATION-API] Publishing donation_created event
[SSE-BROKER] ===== PUBLISHING EVENT =====
[SSE-BROKER] Channels: ["inventory:all"]
[SSE-BROKER] Total listeners notified: 1
[SSE-STREAM] Event sent to client
[INVENTORY-SSE] 📡 Inventory change event received: {...}
[INVENTORY-SSE] ⏱️ Scheduling refresh (250ms debounce)...
[INVENTORY-SSE] ⏱️ Debounce timer fired, calling refreshInventory()
[INVENTORY-SSE] 🔄 refreshInventory called, refreshInFlight: false
[INVENTORY-SSE] 🗑️ Invalidating cache...
[INVENTORY-SSE] 📥 Fetching fresh data from API (bypassing all caches)...
[INVENTORY-API] 🔄 Force refresh enabled, adding timestamp: 1713384000000
[INVENTORY-API] 📡 Fetching from URL: /api/inventory/items?...&_t=1713384000000
[INVENTORY-API] ✅ Received 50 items
[INVENTORY-SSE] ✅ Fresh data received from API
[INVENTORY-SSE] ✅ Reactive state and cache updated
[INVENTORY-SSE] 📦 First item: 2 BURNER GAS STOVE quantity: 0 donations: 14 currentCount: 14
```

## Next Steps

1. **Test the flow** - Create a donation and watch console logs
2. **Identify where it breaks** - Note which log message is missing
3. **Check that specific component** - Focus debugging on the failing step
4. **Verify data values** - Check if fresh data has correct values
5. **Check UI binding** - Verify Svelte is re-rendering with new data

## Debug Commands

```javascript
// In browser console on inventory page:

// 1. Check current state
window.testInventoryState()

// 2. Manually trigger refresh
window.testInventoryRefresh()

// 3. Check cache
window.testInvalidateCache()

// 4. Check items array directly
console.log('Items:', items)

// 5. Check store
console.log('Store stats:', inventoryStore.getStats())
```
