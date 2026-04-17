# Donation SSE - Comprehensive Debug & Fix

## What Was Done

I've added **comprehensive logging** at every step of the SSE flow to identify exactly where the issue is occurring.

## Changes Made

### 1. Enhanced SSE Subscription Logging (`src/lib/api/donations.ts`)

Added detailed logs for:
- Connection creation
- Connection opened
- Connected event received
- donation_change events
- Heartbeat events
- Errors
- Disconnection

### 2. Enhanced Component Logging (`src/routes/(protected)/custodian/replacement/+page.svelte`)

Added detailed logs for:
- SSE setup process
- Event reception
- Refresh function calls
- Cache invalidation
- Data loading
- State updates

### 3. Added Test Functions

Two test functions are now available in the browser console:
- `testRefreshDonations()` - Manually trigger a refresh
- `testDonationsState()` - Check current state

## How to Debug

### Step 1: Open Console and Navigate

1. Open browser console (F12)
2. Clear console
3. Navigate to `/custodian/replacement`
4. Switch to "Donations" tab

### Step 2: Check Initial Connection

Look for these logs:

```
[SSE-SETUP] Setting up SSE subscriptions...
[DONATION-SSE] Creating EventSource connection to /api/donations/stream
[DONATION-SSE] EventSource created, readyState: 0
[SSE-SETUP] Donations subscription created
[DONATION-SSE] ✓ Connection opened
[DONATION-SSE] ✓ Connected event received: {...}
[TEST] Test functions added to window
```

**If you see these**: SSE connection is working ✅

**If you don't see these**: SSE connection failed ❌
- Check for JavaScript errors
- Verify user is logged in as custodian/superadmin
- Check Network tab for `/api/donations/stream` request

### Step 3: Create a Donation

1. Click "Record Donation"
2. Fill form and submit
3. Watch console

### Expected Logs (Complete Flow):

```
CLIENT SIDE:
[DONATION-SSE] ✓ donation_change event received: {"action":"donation_created",...}
[DONATION-SSE] Parsed event data: {action: "donation_created", ...}
[DONATION-SSE] Calling callback function...
[REALTIME] ✓ Donation change detected
[REALTIME] Calling refreshDonations()...
[DONATION-SSE] Callback completed
[REFRESH] refreshDonations called, refreshInFlight: false
[REFRESH] Starting donation refresh...
[REFRESH] Invalidating donations cache...
[REFRESH] Loading donations with forceRefresh=true...
[LOAD-DONATIONS] Called with showLoading: false forceRefresh: true
[LOAD-DONATIONS] Calling donationsAPI.getAll with params: {forceRefresh: true, ...}
[LOAD-DONATIONS] Received response: {donationsCount: X, total: X}
[LOAD-DONATIONS] Donations state updated with X items
[LOAD-DONATIONS] Completed
[REFRESH] Donations loaded successfully
[REFRESH] refreshInFlight set to false
```

```
SERVER SIDE (check terminal):
[DONATION-API] Publishing donation_created event: {...}
[DONATION-SSE-BROKER] ===== PUBLISHING EVENT =====
[DONATION-SSE-BROKER] Channels: ["donations:all"]
[DONATION-SSE-BROKER] Channel "donations:all" has 1 listeners
[DONATION-SSE-BROKER] ✓ Event sent to listener
[DONATION-SSE-STREAM] Event received from broker: {...}
```

## Diagnostic Scenarios

### Scenario A: No SSE Connection

**Symptoms**:
- No `[DONATION-SSE]` logs
- No `[SSE-SETUP]` logs

**Diagnosis**:
1. Component not mounting
2. JavaScript error
3. Browser blocking EventSource

**Solution**:
1. Check for errors in console
2. Hard refresh (Ctrl+Shift+R)
3. Check if you're logged in

### Scenario B: Connected But No Events

**Symptoms**:
```
[DONATION-SSE] ✓ Connection opened
[DONATION-SSE] ✓ Connected event received
```
But no `donation_change` after creating donation

**Diagnosis**:
1. Server not publishing events
2. No listeners registered

**Solution**:
1. Check server logs for `[DONATION-API] Publishing donation_created event`
2. Check server logs for `[DONATION-SSE-BROKER] Channel "donations:all" has X listeners`
3. If X = 0, SSE stream not subscribed to broker

### Scenario C: Events Received But No Callback

**Symptoms**:
```
[DONATION-SSE] ✓ donation_change event received
```
But no `[REALTIME]` logs

**Diagnosis**:
1. Callback not being invoked
2. Error in callback

**Solution**:
1. Check for errors after `[DONATION-SSE]` log
2. Run `testRefreshDonations()` in console to test manually

### Scenario D: Callback Runs But No Refresh

**Symptoms**:
```
[REALTIME] ✓ Donation change detected
[REALTIME] Calling refreshDonations()...
```
But no `[REFRESH]` logs

**Diagnosis**:
1. `refreshDonations` function not defined
2. Error in function

**Solution**:
1. Check for errors
2. Run `testRefreshDonations()` to test directly

### Scenario E: Refresh Runs But No Data Load

**Symptoms**:
```
[REFRESH] refreshDonations called
[REFRESH] Starting donation refresh...
```
But no `[LOAD-DONATIONS]` logs

**Diagnosis**:
1. `loadDonations` not being called
2. Error before `loadDonations`

**Solution**:
1. Check for errors between logs
2. Verify `donationsAPI.invalidateCache()` doesn't throw

### Scenario F: Data Loads But UI Doesn't Update

**Symptoms**:
```
[LOAD-DONATIONS] Donations state updated with X items
```
But UI still shows old data

**Diagnosis**:
1. Svelte reactivity issue
2. Component not mounted
3. Wrong tab active

**Solution**:
1. Run `testDonationsState()` to check state
2. Verify `isMounted: true`
3. Check if you're on "Donations" tab
4. Check if `donations.length` actually changed

### Scenario G: forceRefresh Not Working

**Symptoms**:
```
[LOAD-DONATIONS] Called with showLoading: false forceRefresh: false
```
(Should be `true`!)

**Diagnosis**:
1. Wrong parameter passed
2. Function signature issue

**Solution**:
1. Check `refreshDonations` calls `loadDonations(false, true)`
2. Verify function signature: `async function loadDonations(showLoading = true, forceRefresh = false)`

## Manual Testing

### Test 1: Manual Refresh

Run in console:
```javascript
testRefreshDonations()
```

Should trigger the full refresh flow and show all `[REFRESH]` and `[LOAD-DONATIONS]` logs.

### Test 2: Check State

Run in console:
```javascript
testDonationsState()
```

Should show:
- Current donations count
- Current donations array
- isMounted status
- refreshInFlight status

### Test 3: Check SSE Connection

Run in console:
```javascript
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('/stream'))
  .forEach(r => console.log('SSE:', r.name, 'Duration:', r.duration));
```

Should show `/api/donations/stream` connection.

### Test 4: Check Network

1. Open DevTools → Network tab
2. Filter by "donations"
3. Create a donation
4. Look for:
   - POST `/api/donations` (create)
   - GET `/api/donations?limit=200&_t=TIMESTAMP` (refresh)
   - The `_t` parameter proves `forceRefresh` is working

## What to Share

If it's still not working, share:

1. **Console logs** from page load to donation creation
2. **Server logs** (if accessible)
3. **Network tab** screenshot showing requests
4. **Which scenario** matches your symptoms (A-G above)

## Expected Outcome

When working correctly:

1. ✅ SSE connection established on page load
2. ✅ Event received when donation created
3. ✅ Callback invoked
4. ✅ Cache invalidated
5. ✅ Fresh data loaded with `forceRefresh=true`
6. ✅ UI updates immediately
7. ✅ No page refresh needed

## Industry Standards Applied

- ✅ Comprehensive logging at every step
- ✅ EventSource API (native browser SSE)
- ✅ Automatic reconnection
- ✅ Cache invalidation before fetch
- ✅ Force refresh on real-time events
- ✅ Defensive error handling
- ✅ Test functions for debugging

---

**With these logs, we can pinpoint the exact failure point and fix it.**

Run through the steps above and note which logs you see and which you don't. This will tell us exactly where the issue is.
