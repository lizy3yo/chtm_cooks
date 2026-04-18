# Test Donation SSE Real-Time Updates

## Quick Test Guide

### Prerequisites
1. Start the development server: `npm run dev`
2. Login as **custodian** or **superadmin**

### Test 1: Donation Real-Time Update

**Steps**:
1. Navigate to `/custodian/replacement`
2. Click on "Donations" tab
3. Open browser console (F12)
4. Look for: `[DONATION-SSE] Connected`
5. Click "Record Donation" button
6. Fill in the form:
   - Donor Name: "Test Donor"
   - Select "Create New Item"
   - Item Name: "Test Item"
   - Category: "Test Category"
   - Quantity: 1
   - Purpose: "Testing SSE"
   - Date: Today
7. Click "Submit"

**Expected Result**:
- ✅ Donation appears immediately in the list
- ✅ No page refresh needed
- ✅ Console shows:
  ```
  [DONATION-SSE] Event received: {...}
  [REALTIME] Donation change detected
  ```

### Test 2: Multi-Tab Synchronization

**Steps**:
1. Open `/custodian/replacement` in **two browser tabs**
2. Switch both to "Donations" tab
3. In **Tab 1**: Create a new donation
4. Watch **Tab 2**

**Expected Result**:
- ✅ Tab 2 updates automatically
- ✅ Both tabs show the same donation
- ✅ No manual refresh needed

### Test 3: Inventory Real-Time Update

**Steps**:
1. Open `/custodian/replacement` (Donations tab) in Tab 1
2. Open `/custodian/inventory` in Tab 2
3. In **Tab 1**: Create a donation with "Create New Item"
4. Watch **Tab 2** (Inventory page)

**Expected Result**:
- ✅ New item appears in inventory immediately
- ✅ Stock count shows donation quantity
- ✅ Both tabs synchronized

### Test 4: Obligation Resolution → Inventory Update

**Steps**:
1. Open `/custodian/replacement` (Replacements tab) in Tab 1
2. Open `/custodian/inventory` in Tab 2
3. In **Tab 1**: Find a pending obligation and mark as "Replaced"
4. Watch **Tab 2** (Inventory page)

**Expected Result**:
- ✅ Inventory stock count updates immediately
- ✅ Reflects the replacement
- ✅ Real-time synchronization

### Test 5: Connection Resilience

**Steps**:
1. Open `/custodian/replacement` (Donations tab)
2. Open DevTools → Network tab
3. Throttle connection to "Slow 3G"
4. Wait a few seconds
5. Restore to "No throttling"
6. Create a donation

**Expected Result**:
- ✅ Connection automatically reconnects
- ✅ Donation still updates in real-time
- ✅ No errors in console

## Console Log Reference

### Successful Connection
```
[DONATION-SSE] Connected
```

### Event Received
```
[DONATION-SSE] Event received: {"action":"donation_created","entityId":"...","occurredAt":"..."}
[REALTIME] Donation change detected
```

### Server Logs (if checking backend)
```
[DONATION-API] Publishing donation_created event: {donationId: "...", channel: "donations:all"}
[DONATION-SSE-BROKER] ===== PUBLISHING EVENT =====
[DONATION-SSE-BROKER] Channels: ["donations:all"]
[DONATION-SSE-BROKER] Channel "donations:all" has 1 listeners
[DONATION-SSE-BROKER] ✓ Event sent to listener
[DONATION-SSE-STREAM] Event received from broker: {...}
```

### Connection Error (should auto-reconnect)
```
[DONATION-SSE] Connection error: Event {...}
```

## Network Tab Verification

### SSE Connection
- **URL**: `/api/donations/stream`
- **Status**: `200` (Pending)
- **Type**: `eventsource`
- **Time**: Long-lived connection

### Events in EventStream Tab
- `open` - Connection established
- `donation_change` - Donation created/updated/deleted
- `heartbeat` - Keep-alive (every 20 seconds)

## Troubleshooting

### Issue: No SSE connection
**Check**:
- User is logged in as custodian/superadmin
- Browser console for errors
- Network tab for `/api/donations/stream` request

### Issue: Events not received
**Check**:
- Server logs for event publishing
- Browser console for `[DONATION-SSE] Event received`
- Network tab EventStream for events

### Issue: UI doesn't update
**Check**:
- Console for `[REALTIME] Donation change detected`
- No JavaScript errors in console
- Component is mounted (not navigated away)

## Success Criteria

✅ **All tests pass**:
- Donations update in real-time
- Multi-tab synchronization works
- Inventory updates when donations created
- Inventory updates when obligations resolved
- Connection resilient to network issues
- No console errors

✅ **Performance**:
- < 1 second from create to UI update
- Minimal network overhead
- No memory leaks

✅ **User Experience**:
- Seamless real-time updates
- No manual refresh needed
- Works across multiple tabs
- Reliable and consistent

## Quick Verification Command

Run this in browser console after page load:

```javascript
// Check if SSE is connected
console.log('SSE Status:', window.performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/stream'))
  .map(r => ({ url: r.name, duration: r.duration }))
);
```

Should show the `/api/donations/stream` connection.

---

**Last Updated**: April 18, 2026  
**Status**: Ready for Testing
