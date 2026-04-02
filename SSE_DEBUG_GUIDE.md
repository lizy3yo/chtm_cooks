# SSE Real-Time Updates - Debug Guide

## Overview
Added comprehensive logging throughout the SSE flow to diagnose why constant item updates aren't appearing in real-time on the student request page.

## Logging Flow

### 1. Server-Side: Item Update (PATCH)
**File**: `src/routes/api/inventory/items/[id]/+server.ts`

When a custodian marks an item as constant:
```
[PATCH-ITEM] Publishing SSE event: {
  "action": "item_updated",
  "entityType": "item",
  "entityId": "...",
  "entityName": "...",
  "occurredAt": "..."
}
[PATCH-ITEM] SSE event published successfully
```

### 2. Server-Side: Event Broker
**File**: `src/lib/server/realtime/inventoryEvents.ts`

When the broker distributes the event:
```
[SSE-BROKER] ===== PUBLISHING EVENT =====
[SSE-BROKER] Channels: ["inventory:all"]
[SSE-BROKER] Event: {...}
[SSE-BROKER] Active listeners: 1
[SSE-BROKER] Channel "inventory:all" has 1 listeners
[SSE-BROKER] ✓ Event sent to listener
[SSE-BROKER] Total listeners notified: 1
[SSE-BROKER] ============================
```

### 3. Server-Side: SSE Stream
**File**: `src/routes/api/inventory/stream/+server.ts`

When the stream forwards the event to clients:
```
[SSE-STREAM] New connection from user@example.com (student)
[SSE-STREAM] Subscribed user@example.com to inventory:all
[SSE-STREAM] Forwarding event to user@example.com: {...}
[SSE-STREAM] Sending to client (user@example.com): inventory_change {...}
```

### 4. Client-Side: Event Reception
**File**: `src/routes/(protected)/student/request/+page.svelte`

When the client receives and processes the event:
```
[SSE] ===== EVENT RECEIVED =====
[SSE] Action: item_updated
[SSE] Entity Type: item
[SSE] Entity ID: ...
[SSE] Entity Name: ...
[SSE] Occurred At: ...
[SSE] ============================
[SSE] Item event detected, processing update...
```

### 5. Client-Side: Update Processing
```
[UPDATE] ===== PROCESSING UPDATE =====
[UPDATE] Event: {...}
[UPDATE] ⏱️ Setting debounce timer for 1000 ms
[UPDATE] 🔄 Debounce timer fired, processing update...
[UPDATE] 📋 Current selected IDs: [...]
[UPDATE] 📌 Previous constant IDs: [...]
[UPDATE] 🔃 Reloading equipment data...
[UPDATE] ✅ Equipment data reloaded
[UPDATE] 📌 New constant IDs: [...]
[UPDATE] ➖ Removed constant IDs: [...]
[UPDATE] ➕ Added constant IDs: [...]
[UPDATE] 🛒 Clearing cart...
[UPDATE] 🛒 Re-adding X constant items...
[UPDATE]   ✓ Added constant item: ... (ID: ...)
[UPDATE] 🛒 Re-adding previously selected non-constant items...
[UPDATE] 🔄 Syncing selected items from cart...
[UPDATE] ✅ Cart synced, selected items count: X
[UPDATE] ===== UPDATE COMPLETE =====
```

## Diagnostic Steps

### Step 1: Check if Events are Published
Look for `[PATCH-ITEM]` logs in server console when marking item as constant.

**If missing**: The PATCH endpoint isn't being called or is failing before publishing.

### Step 2: Check if Broker Receives Events
Look for `[SSE-BROKER]` logs showing event distribution.

**If missing**: The `publishInventoryChange()` function isn't being called.
**If "Active listeners: 0"**: No clients are connected to SSE stream.

### Step 3: Check if Stream Forwards Events
Look for `[SSE-STREAM]` logs showing event forwarding to clients.

**If missing**: Client isn't connected to `/api/inventory/stream`.
**Check**: Browser Network tab for active EventSource connection.

### Step 4: Check if Client Receives Events
Look for `[SSE]` logs in browser console.

**If missing**: 
- EventSource connection failed
- Events are being filtered out
- Check browser Network tab for SSE connection status

### Step 5: Check if Updates are Processed
Look for `[UPDATE]` logs in browser console.

**If missing**: Event handler isn't being called or is filtering out events.

## Common Issues

### Issue: No SSE Connection
**Symptoms**: No `[SSE-STREAM]` logs, no `[SSE] Connected` in browser
**Solution**: Check authentication, verify `/api/inventory/stream` endpoint is accessible

### Issue: Events Not Reaching Client
**Symptoms**: `[SSE-BROKER]` shows events sent, but no `[SSE]` logs in browser
**Solution**: Check browser Network tab, verify EventSource connection is active

### Issue: Events Filtered Out
**Symptoms**: `[SSE]` logs show events received, but no `[UPDATE]` logs
**Solution**: Check event.entityType === 'item' condition in event handler

### Issue: Updates Not Applied
**Symptoms**: `[UPDATE]` logs show processing, but UI doesn't update
**Solution**: Check cart sync logic, verify reactive state updates

## Testing Procedure

1. Open student request page
2. Open browser console (F12)
3. Look for `[SSE] ✅ Connected successfully` message
4. In another tab, open custodian inventory page
5. Mark an item as constant
6. Watch server console for `[PATCH-ITEM]` → `[SSE-BROKER]` → `[SSE-STREAM]` logs
7. Watch browser console for `[SSE]` → `[UPDATE]` logs
8. Verify item appears in student's selected items

## Expected Behavior

When marking an item as constant:
1. Server publishes event (< 100ms)
2. Broker distributes to all listeners (< 10ms)
3. Stream forwards to connected clients (< 50ms)
4. Client receives event immediately
5. Client debounces for 1 second
6. Client reloads equipment data
7. Client updates cart and UI
8. User sees notification

Total time: ~1-2 seconds from action to UI update
