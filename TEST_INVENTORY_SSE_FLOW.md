# Test Inventory SSE Flow

## Current Issue
The inventory page is NOT receiving `inventory_change` events when donations are created.

## Evidence from Logs
```
[INVENTORY-SSE] 🚀 Setting up SSE subscriptions...
[INVENTORY-SSE] ✅ SSE subscriptions established
```

But when donation is created, we DON'T see:
```
[INVENTORY-SSE] 📡 Inventory change event received
```

## Root Cause Analysis

The issue is that the inventory SSE connection is established, but events are not being received. This could be because:

1. **Server is not publishing events** - Check server logs for `[SSE-BROKER] ===== PUBLISHING EVENT =====`
2. **Events are published to wrong channel** - Verify channel name matches
3. **SSE stream is not broadcasting** - Check if stream endpoint has active listeners
4. **Browser is not receiving events** - Check Network tab for event stream

## Testing Steps

### Step 1: Check if Server Publishes Events
1. Create a donation
2. Check server console/logs for:
   ```
   [DONATION-API] Publishing donation_created event
   [SSE-BROKER] ===== PUBLISHING EVENT =====
   [SSE-BROKER] Channels: ["inventory:all"]
   [SSE-BROKER] Active listeners: X
   [SSE-BROKER] Channel "inventory:all" has X listeners
   ```

### Step 2: Check Browser Network Tab
1. Open Network tab in browser DevTools
2. Filter by "stream" or look for `/api/inventory/stream`
3. Click on the request
4. Go to "EventStream" or "Response" tab
5. You should see:
   ```
   event: connected
   data: {"timestamp":"..."}

   event: inventory_change
   data: {"action":"item_updated",...}
   ```

### Step 3: Check Browser Console
When donation is created, you should see:
```
[INVENTORY-SSE-CLIENT] ✓ inventory_change event received
[INVENTORY-SSE-CLIENT] Raw event data: {...}
[INVENTORY-SSE-CLIENT] Parsed payload: {...}
[INVENTORY-SSE-CLIENT] Calling callback function...
[INVENTORY-SSE] 📡 Inventory change event received: {...}
[INVENTORY-SSE] ⏱️ Scheduling refresh (250ms debounce)...
```

## Quick Test Commands

### In Browser Console (on inventory page):
```javascript
// Check if SSE connection is active
// Look in Network tab for /api/inventory/stream with status "pending" (means active)

// Manually trigger refresh to see if it works
window.testInventoryRefresh()

// Check current state
window.testInventoryState()
```

### Expected Behavior
When you create a donation:
1. Server publishes `inventory_change` event to `inventory:all` channel
2. SSE stream endpoint broadcasts event to all connected clients
3. Browser receives event via EventSource
4. Callback function is called
5. `scheduleRefresh()` is called
6. After 250ms, `refreshInventory()` is called
7. Fresh data is fetched
8. UI updates

## Likely Issue

Based on the logs, the most likely issue is that **the inventory SSE connection is established but events are not being received**. This suggests:

1. The server might not be publishing to the correct channel
2. The SSE stream might not have active listeners when the event is published
3. There might be a timing issue where the connection is established after the event is published

## Solution

We need to ensure that:
1. The donation API publishes to BOTH `donations:all` AND `inventory:all` channels
2. The inventory page subscribes to BOTH inventory SSE and donation SSE
3. Events are properly broadcasted to all connected clients

The inventory page already subscribes to both:
```typescript
const unsub = subscribeToInventoryChanges(...);  // inventory:all
const unsubDonations = donationsAPI.subscribeToChanges(...);  // donations:all
```

So if the donation SSE is working (which it is based on your earlier logs), then the inventory page should receive the donation event and trigger a refresh.

## Next Steps

1. **Create a donation** while on the inventory page
2. **Check browser console** for these specific logs:
   - `[DONATION-SSE] ✓ donation_change event received`
   - `[INVENTORY-SSE] 📡 Donation change event received (donations stream)`
   - `[INVENTORY-SSE] ⏱️ Scheduling refresh`

If you see the donation event but NOT the inventory refresh, then the issue is in the `scheduleRefresh()` or `refreshInventory()` function.

If you DON'T see the donation event on the inventory page, then the donation SSE subscription is not working on the inventory page.
