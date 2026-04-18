# Custodian Pages Caching Fix

## Issue
When navigating away from and back to the Inventory and Requests pages in the custodian portal, the pages would reload completely, showing the loading skeleton even though the data was already cached. This created a poor user experience with unnecessary loading states.

## Root Cause
The pages were not checking for cached data before mounting, unlike the dashboard which uses the `peekCached` pattern:

**Dashboard (correct pattern):**
```typescript
const initialReport = browser ? peekCachedAnalytics({ period: 'semester' }) : null;
let loading = $state(!initialReport);
let report = $state<AnalyticsReport | null>(initialReport);
```

**Inventory & Requests (incorrect pattern):**
```typescript
let items = $state<InventoryItem[]>([]);
let loading = $state(true); // Always starts as true
```

## Solution
Implemented the same caching pattern used in the dashboard for both Inventory and Requests pages:

### Inventory Page Changes
1. **Check for cached data before mounting:**
   ```typescript
   const cachedStore = browser ? get(inventoryStore) : null;
   const hasCachedData = cachedStore && cachedStore.items.length > 0 && inventoryStore.isItemsCacheValid();
   ```

2. **Initialize state with cached data:**
   ```typescript
   let items = $state<InventoryItem[]>(hasCachedData ? cachedStore!.items : []);
   let categories = $state<InventoryCategory[]>(hasCachedData ? cachedStore!.categories : []);
   let loading = $state(!hasCachedData); // Only show skeleton if no cached data
   let initialLoadComplete = $state(hasCachedData); // Mark as complete if we have cached data
   ```

3. **Log cached data usage:**
   ```typescript
   console.log('[INVENTORY-SSE] 💾 Has cached data:', hasCachedData);
   ```

### Requests Page Changes
1. **Check for cached data before mounting:**
   ```typescript
   const cachedRequests = browser ? borrowRequestsAPI.peekCachedList({}) : null;
   const hasCachedData = cachedRequests && cachedRequests.requests.length > 0;
   ```

2. **Initialize state with loading based on cache:**
   ```typescript
   let loading = $state(!hasCachedData); // Only show skeleton if no cached data
   let initialLoadComplete = $state(hasCachedData); // Mark as complete if we have cached data
   ```

3. **Populate cached data in onMount:**
   ```typescript
   if (hasCachedData && cachedRequests) {
       requests = cachedRequests.requests
           .filter((record) => record.status !== 'pending_instructor')
           .map(mapRequest);
       console.log('[REQUESTS] 💾 Loaded from cache:', requests.length, 'requests');
   }
   ```

4. **Force refresh only when needed:**
   ```typescript
   loadRequests(!hasCachedData) // Force refresh only if no cached data
   ```

## Benefits
1. **Instant page loads** - When returning to these pages, cached data is displayed immediately without loading skeletons
2. **Better UX** - No flickering or unnecessary loading states
3. **Reduced server load** - Fewer API calls when navigating between pages
4. **Consistent behavior** - All custodian pages now follow the same caching pattern as the dashboard

## Technical Details

### Caching Mechanism
Both pages use existing caching infrastructure:
- **Inventory**: Uses `inventoryStore` with 12-hour TTL
- **Requests**: Uses `borrowRequestsAPI` internal cache with TTL

### Cache Validation
- Inventory: `inventoryStore.isItemsCacheValid()` checks TTL and `needsRefresh` flag
- Requests: `borrowRequestsAPI.peekCachedList()` returns cached data if still fresh

### SSR Compatibility
Both implementations check `browser` before accessing cached data to ensure SSR compatibility:
```typescript
const cachedData = browser ? getCachedData() : null;
```

## Testing
To verify the fix:
1. Navigate to Inventory or Requests page
2. Wait for data to load
3. Navigate to another page (e.g., Dashboard)
4. Navigate back to Inventory or Requests
5. **Expected**: Page should display immediately without loading skeleton
6. **Previous behavior**: Page would show loading skeleton and refetch data

## Files Modified
- `src/routes/(protected)/custodian/inventory/+page.svelte`
- `src/routes/(protected)/custodian/requests/+page.svelte`

## Related Patterns
This fix follows the same pattern used in:
- `src/routes/(protected)/custodian/dashboard/+page.svelte` (analytics caching)
- Other pages that implement client-side caching with peek functions
