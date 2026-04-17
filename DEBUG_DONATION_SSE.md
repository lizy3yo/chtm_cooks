# Debug Donation SSE - Step by Step

## Comprehensive Logging Added

I've added detailed logging at every step of the SSE flow. Follow these steps to identify where the issue is.

## Step 1: Open Browser Console

1. Open the application
2. Press F12 to open DevTools
3. Go to Console tab
4. Clear the console (Ctrl+L or click clear button)

## Step 2: Navigate to Donations Page

1. Login as custodian
2. Navigate to `/custodian/replacement`
3. Click on "Donations" tab

### Expected Console Logs:

```
[SSE-SETUP] Setting up SSE subscriptions...
[DONATION-SSE] Creating EventSource connection to /api/donations/stream
[DONATION-SSE] EventSource created, readyState: 0
[SSE-SETUP] Replacement obligations subscription created
[SSE-SETUP] Donations subscription created
[SSE-SETUP] Inventory subscription created
[SSE-SETUP] All SSE subscriptions active
[DONATION-SSE] ✓ Connection opened
[DONATION-SSE] ✓ Connected event received: {"channel":"donations:all",...}
```

### If You Don't See These Logs:

**Problem**: SSE subscription not being created

**Check**:
1. Is the component mounted?
2. Is `onMount` being called?
3. Check for JavaScript errors above these logs

## Step 3: Create a Donation

1. Click "Record Donation" button
2. Fill in the form
3. Submit

### Expected Console Logs (Client):

```
[DONATION-SSE] ✓ donation_change event received: {"action":"donation_created",...}
[DONATION-SSE] Parsed event data: {action: "donation_created", entityId: "...", occurredAt: "..."}
[DONATION-SSE] Calling callback function...
[REALTIME] ✓ Donation change detected
[REALTIME] Calling refreshDonations()...
[DONATION-SSE] Callback completed
[REFRESH] refreshDonations called, refreshInFlight: false
[REFRESH] Starting donation refresh...
[REFRESH] Invalidating donations cache...
[REFRESH] Loading donations with forceRefresh=true...
[LOAD-DONATIONS] Called with showLoading: false forceRefresh: true
[LOAD-DONATIONS] Calling donationsAPI.getAll with params: {search: undefined, limit: 200, forceRefresh: true}
[LOAD-DONATIONS] Received response: {donationsCount: X, total: X}
[LOAD-DONATIONS] Donations state updated with X items
[LOAD-DONATIONS] Completed
[REFRESH] Donations loaded successfully
[REFRESH] refreshInFlight set to false
```

### Expected Server Logs:

Check your terminal/server logs for:

```
[DONATION-API] Publishing donation_created event: {donationId: "...", channel: "donations:all"}
[DONATION-SSE-BROKER] ===== PUBLISHING EVENT =====
[DONATION-SSE-BROKER] Channels: ["donations:all"]
[DONATION-SSE-BROKER] Event: {...}
[DONATION-SSE-BROKER] Active listeners: 1
[DONATION-SSE-BROKER] Channel "donations:all" has 1 listeners
[DONATION-SSE-BROKER] ✓ Event sent to listener
[DONATION-SSE-STREAM] Event received from broker: {...}
```

## Troubleshooting by Log Pattern

### Pattern 1: No SSE Connection Logs

**Symptoms**:
- No `[DONATION-SSE]` logs at all
- No `[SSE-SETUP]` logs

**Possible Causes**:
1. Component not mounting
2. JavaScript error preventing execution
3. Browser blocking EventSource

**Solutions**:
1. Check for errors in console
2. Verify you're on the correct page
3. Try hard refresh (Ctrl+Shift+R)

### Pattern 2: SSE Connected But No Events

**Symptoms**:
```
[DONATION-SSE] ✓ Connection opened
[DONATION-SSE] ✓ Connected event received
```
But after creating donation, no `donation_change` event

**Possible Causes**:
1. Server not publishing events
2. Event name mismatch
3. Channel mismatch

**Solutions**:
1. Check server logs for `[DONATION-API] Publishing donation_created event`
2. Check server logs for `[DONATION-SSE-BROKER]` logs
3. Verify broker has listeners: `Channel "donations:all" has X listeners` (X should be > 0)

### Pattern 3: Events Received But No Refresh

**Symptoms**:
```
[DONATION-SSE] ✓ donation_change event received
[REALTIME] ✓ Donation change detected
```
But no `[REFRESH]` logs

**Possible Causes**:
1. Callback not being called
2. `refreshDonations` function not defined
3. JavaScript error in callback

**Solutions**:
1. Check for errors after `[REALTIME]` log
2. Verify `refreshDonations` function exists
3. Check if `isMounted` is true

### Pattern 4: Refresh Called But No Data Update

**Symptoms**:
```
[REFRESH] refreshDonations called
[REFRESH] Starting donation refresh...
[LOAD-DONATIONS] Called with showLoading: false forceRefresh: true
[LOAD-DONATIONS] Received response: {donationsCount: X, total: X}
[LOAD-DONATIONS] Donations state updated with X items
```
But UI doesn't update

**Possible Causes**:
1. Svelte reactivity issue
2. Component not re-rendering
3. Data not actually changing

**Solutions**:
1. Check if `donations` array actually changed
2. Verify `isMounted` is true
3. Check if you're on the correct tab
4. Try adding `$effect(() => { console.log('Donations changed:', donations.length); })`

### Pattern 5: forceRefresh Not Working

**Symptoms**:
```
[LOAD-DONATIONS] Called with showLoading: false forceRefresh: false
```
(forceRefresh should be true!)

**Possible Causes**:
1. Wrong parameter order
2. Function signature mismatch

**Solutions**:
1. Verify `loadDonations(false, true)` is being called
2. Check function signature: `async function loadDonations(showLoading = true, forceRefresh = false)`

## Network Tab Verification

1. Open DevTools → Network tab
2. Filter by "donations"
3. Create a donation

### Expected Requests:

1. **POST /api/donations** - Create donation
   - Status: 201
   - Response: New donation object

2. **GET /api/donations?limit=200&_t=TIMESTAMP** - Refresh list
   - Status: 200
   - Note the `_t` parameter (proves forceRefresh is working)
   - Response: Updated donations list

3. **EventStream /api/donations/stream** - SSE connection
   - Status: 200 (Pending)
   - Type: eventsource
   - Should show events in EventStream tab

### If You Don't See GET Request:

**Problem**: `loadDonations` not being called or forceRefresh not working

**Check**:
1. Console logs for `[LOAD-DONATIONS]`
2. Verify `forceRefresh: true` in the logs
3. Check if `_t` parameter is in the URL

## Quick Diagnostic Script

Run this in browser console after page load:

```javascript
// Check SSE connection
console.log('=== SSE CONNECTION CHECK ===');
const sseConnections = performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/stream'));
console.log('SSE Connections:', sseConnections);

// Check if EventSource is active
console.log('EventSource support:', typeof EventSource !== 'undefined');

// Trigger a test refresh
console.log('=== TRIGGERING TEST REFRESH ===');
// This will be available if the component is mounted
if (typeof window.testRefreshDonations === 'function') {
  window.testRefreshDonations();
} else {
  console.log('Test function not available - component may not be mounted');
}
```

## Manual Test

If SSE isn't working, test the API directly:

```javascript
// Test 1: Check if stream endpoint is accessible
fetch('/api/donations/stream', { credentials: 'include' })
  .then(r => console.log('Stream endpoint status:', r.status))
  .catch(e => console.error('Stream endpoint error:', e));

// Test 2: Create a donation and check response
fetch('/api/donations', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inventoryAction: 'new_item',
    donorName: 'Test',
    itemName: 'Test Item',
    category: 'Test',
    quantity: 1,
    purpose: 'Test',
    date: new Date().toISOString().split('T')[0]
  })
})
  .then(r => r.json())
  .then(d => console.log('Donation created:', d))
  .catch(e => console.error('Create error:', e));

// Test 3: Check if donations list updates
fetch('/api/donations?limit=200&_t=' + Date.now(), { credentials: 'include' })
  .then(r => r.json())
  .then(d => console.log('Donations list:', d.donations.length))
  .catch(e => console.error('List error:', e));
```

## Expected Full Flow

When everything works correctly, you should see this complete sequence:

```
1. Page Load:
   [SSE-SETUP] Setting up SSE subscriptions...
   [DONATION-SSE] Creating EventSource connection
   [DONATION-SSE] ✓ Connection opened
   [DONATION-SSE] ✓ Connected event received

2. Create Donation (Server):
   [DONATION-API] Publishing donation_created event
   [DONATION-SSE-BROKER] ✓ Event sent to listener
   [DONATION-SSE-STREAM] Event received from broker

3. Receive Event (Client):
   [DONATION-SSE] ✓ donation_change event received
   [REALTIME] ✓ Donation change detected
   [REALTIME] Calling refreshDonations()...

4. Refresh Data:
   [REFRESH] refreshDonations called
   [REFRESH] Invalidating donations cache...
   [REFRESH] Loading donations with forceRefresh=true...
   [LOAD-DONATIONS] Called with forceRefresh: true
   [LOAD-DONATIONS] Received response
   [LOAD-DONATIONS] Donations state updated

5. UI Updates:
   - New donation appears in list
   - No page refresh needed
```

## Next Steps

1. Follow the steps above
2. Note which logs you see and which you don't
3. Identify the pattern from the troubleshooting section
4. Apply the suggested solution
5. If still not working, share the console logs

## Common Issues and Fixes

### Issue: "EventSource is not defined"
**Fix**: You're in SSR context. This should be handled by the `if (!browser)` check.

### Issue: "401 Unauthorized" on /api/donations/stream
**Fix**: User not logged in or session expired. Re-login.

### Issue: "403 Forbidden" on /api/donations/stream
**Fix**: User is not custodian/superadmin. Login with correct role.

### Issue: Connection keeps dropping
**Fix**: Check network stability. EventSource will auto-reconnect.

### Issue: Multiple SSE connections
**Fix**: Component mounting multiple times. Check for duplicate subscriptions.

---

**With these comprehensive logs, we can pinpoint exactly where the SSE flow breaks.**
