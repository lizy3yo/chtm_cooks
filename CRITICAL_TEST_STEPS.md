# CRITICAL TEST - Inventory SSE Not Updating

## The Problem
You create a donation, but the inventory page doesn't update in real-time. You have to reload the page to see changes.

## What We Know
From your logs:
1. ✅ Inventory page loads successfully
2. ✅ SSE subscriptions are established
3. ✅ Donation SSE connects successfully
4. ❌ NO logs showing events are received when donation is created

## CRITICAL TEST

### Step 1: Open Inventory Page
1. Navigate to custodian inventory page
2. Open browser console (F12)
3. Clear console
4. You should see:
   ```
   [INVENTORY-SSE] 🚀 Setting up SSE subscriptions...
   [INVENTORY-SSE] ✅ SSE subscriptions established
   [DONATION-SSE] Creating EventSource connection to /api/donations/stream
   [DONATION-SSE] ✓ Connection opened
   [DONATION-SSE] ✓ Connected event received
   ```

### Step 2: Keep Inventory Page Open
**DO NOT NAVIGATE AWAY**

### Step 3: Open Replacement Page in NEW TAB
1. Right-click "Replacement" in sidebar
2. Select "Open link in new tab"
3. Switch to the new tab

### Step 4: Create a Donation
1. In the new tab (replacement page), create a donation
2. **IMMEDIATELY switch back to the inventory tab**
3. Watch the console

### Step 5: Check Console Logs
You should see ONE of these scenarios:

#### Scenario A: Donation Event Received ✅
```
[DONATION-SSE] ✓ donation_change event received: {...}
[DONATION-SSE] Parsed event data: {...}
[DONATION-SSE] Calling callback function...
[INVENTORY-SSE] 📡 Donation change event received (donations stream)
[INVENTORY-SSE] 📡 Triggering inventory refresh from donation event
[INVENTORY-SSE] ⏱️ Scheduling refresh (250ms debounce)...
[INVENTORY-SSE] ⏱️ Debounce timer fired, calling refreshInventory()
[INVENTORY-SSE] 🔄 refreshInventory called
... (refresh flow continues)
```
**If you see this:** The SSE is working! The issue is in the refresh logic.

#### Scenario B: Inventory Event Received ✅
```
[INVENTORY-SSE-CLIENT] ✓ inventory_change event received
[INVENTORY-SSE-CLIENT] Raw event data: {...}
[INVENTORY-SSE] 📡 Inventory change event received: {...}
[INVENTORY-SSE] ⏱️ Scheduling refresh (250ms debounce)...
... (refresh flow continues)
```
**If you see this:** The inventory SSE is working! The issue is in the refresh logic.

#### Scenario C: NO Events Received ❌
```
(nothing happens in console)
```
**If you see this:** The SSE events are NOT being received by the inventory page.

## What to Do Based on Results

### If Scenario A or B (Events Received)
The SSE is working! The issue is that the refresh isn't updating the UI. Run this in console:
```javascript
window.testInventoryState()
```
Check if the items count changes after the refresh completes.

### If Scenario C (No Events)
The SSE events are not reaching the inventory page. This could be because:

1. **Server is not publishing events** - Check server logs
2. **SSE connection dropped** - Check Network tab for active stream
3. **Events published before subscription** - Timing issue

## Quick Fix Test

If no events are received, try this in the inventory page console:
```javascript
// Manually trigger a refresh
window.testInventoryRefresh()
```

If this updates the UI with the new donation data, then:
- ✅ The refresh logic works
- ❌ The SSE events are not being received

## Expected Network Tab

In the inventory page, open Network tab:
1. Filter by "stream" or look for `/api/inventory/stream`
2. Status should be "pending" (means active connection)
3. Click on it
4. Go to "EventStream" or "Response" tab
5. You should see heartbeat messages every 30 seconds
6. When you create a donation, you should see an `inventory_change` event appear

## Server-Side Check

If you have access to server logs, when you create a donation, you should see:
```
[DONATION-API] Publishing donation_created event
[SSE-BROKER] ===== PUBLISHING EVENT =====
[SSE-BROKER] Channels: ["inventory:all"]
[SSE-BROKER] Active listeners: 1 (or more)
[SSE-BROKER] Channel "inventory:all" has 1 listeners
[SSE-BROKER] ✓ Event sent to listener
[SSE-BROKER] Total listeners notified: 1
[SSE-STREAM] Event sent to client
```

If you DON'T see these logs, the server is not publishing events correctly.

## Most Likely Issue

Based on typical SSE issues, the most likely problem is:

**The inventory page SSE connection is established, but when you navigate to the replacement page to create a donation, the inventory page connection might be getting closed or the events are not being broadcasted properly.**

## Solution

The inventory page subscribes to BOTH:
1. Inventory SSE (`/api/inventory/stream`)
2. Donation SSE (`/api/donations/stream`)

So even if the inventory SSE doesn't receive the event, the donation SSE should trigger a refresh.

**Please run the CRITICAL TEST above and report which scenario you see.**
