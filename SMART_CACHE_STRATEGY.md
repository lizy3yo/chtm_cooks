# Smart Cache Strategy with Stale Marking

## The Problem

We had two conflicting requirements:
1. **Use cache** when navigating normally (fast UX, no unnecessary API calls)
2. **Force refresh** when data might have changed on another page

The previous solution of "always invalidate on mount" defeated the purpose of caching.

## The Solution: Stale Marking

Instead of invalidating the cache, we **mark it as stale** when we know data might have changed. This allows us to:
- ✅ Use cache for normal navigation
- ✅ Force refresh only when needed
- ✅ Maintain fast UX
- ✅ Ensure data freshness

## How It Works

### 1. Cache Store Enhancement

Added a `needsRefresh` flag to the cache:

```typescript
interface InventoryCache {
  items: InventoryItem[];
  categories: InventoryCategory[];
  lastFetchedItems: number | null;
  lastFetchedCategories: number | null;
  isLoading: boolean;
  needsRefresh: boolean; // NEW: Flag to indicate data might be stale
}
```

### 2. Cache Validation Logic

```typescript
isItemsCacheValid: (): boolean => {
  // Cache is invalid if:
  // 1. needsRefresh flag is set (data might be stale)
  // 2. TTL expired (12 hours)
  return !state.needsRefresh && 
         state.lastFetchedItems !== null && 
         (now - state.lastFetchedItems) < CACHE_TTL;
}
```

### 3. Mark Stale Function

```typescript
markStale: () => {
  update(state => ({
    ...state,
    needsRefresh: true // Mark as needing refresh without clearing data
  }));
}
```

### 4. Clear Flag on Fresh Data

```typescript
setItems: (items: InventoryItem[]) => {
  update(state => ({
    ...state,
    items,
    lastFetchedItems: Date.now(),
    needsRefresh: false // Clear flag when fresh data is loaded
  }));
}
```

## Implementation

### Replacement Page

When donations are created or obligations are resolved:

```typescript
async function handleResolveObligation(id: string, quantityReplaced: number) {
  await replacementObligationsAPI.resolveObligation(id, {
    resolutionType: 'replacement',
    amountPaid: quantityReplaced
  });
  
  // Mark inventory cache as stale
  inventoryStore.markStale();
  
  // ... rest of the code
}

async function submitDonation() {
  await donationsAPI.create(payload);
  
  // Mark inventory cache as stale
  inventoryStore.markStale();
  
  // ... rest of the code
}
```

### Inventory Page

On mount, check if cache is valid:

```typescript
onMount(() => {
  const shouldForceRefresh = !inventoryStore.isItemsCacheValid();
  
  if (shouldForceRefresh) {
    // Cache invalid or marked stale, force refresh
    inventoryStore.invalidateAll();
    loadCategories(true);
    loadItems(true);
  } else {
    // Cache valid, use cached data
    loadCategories(false);
    loadItems(false);
  }
});
```

## Flow Examples

### Scenario 1: Normal Navigation (Cache Works)

1. User opens **Inventory page** → Fetches data, caches it
2. User navigates to **Dashboard** → Inventory unmounts
3. User navigates back to **Inventory** → Cache valid, uses cached data ✅
4. **No API call**, instant load

### Scenario 2: Navigation After Changes (Cache Invalidated)

1. User opens **Inventory page** → Fetches data, caches it
2. User navigates to **Replacement page** → Inventory unmounts
3. User creates **donation** → `inventoryStore.markStale()` called
4. User navigates back to **Inventory** → Cache marked stale, forces refresh ✅
5. **Fresh data fetched**, UI shows updated values

### Scenario 3: Real-Time Updates (SSE)

1. User on **Inventory page** → SSE connected
2. Another user creates **donation** → SSE event received
3. **Optimistic update** → Only changed item fetched and updated ✅
4. **No full refresh**, smooth update

### Scenario 4: Long Session (TTL Expired)

1. User opens **Inventory page** → Fetches data, caches it
2. User works on other pages for **13 hours**
3. User navigates back to **Inventory** → TTL expired (12 hours), forces refresh ✅
4. **Fresh data fetched**, ensures data isn't too old

## Benefits

### Performance
- ✅ **Instant navigation** when cache is valid
- ✅ **No unnecessary API calls** for normal navigation
- ✅ **Reduced server load** (fewer requests)
- ✅ **Better bandwidth usage** (less data transferred)

### User Experience
- ✅ **Fast page loads** (cached data)
- ✅ **Fresh data** when needed (stale marking)
- ✅ **Smooth updates** (optimistic updates)
- ✅ **No loading states** for cached data

### Data Consistency
- ✅ **Always fresh** after mutations
- ✅ **TTL prevents stale data** (12 hours max)
- ✅ **SSE provides real-time updates** while viewing
- ✅ **Fallback to full refresh** on errors

## Comparison

### Before (Always Invalidate)
```
Navigate to Inventory → API call (200ms)
Navigate away
Navigate back → API call (200ms) ❌
Navigate away
Navigate back → API call (200ms) ❌
```
**Result:** 3 API calls, 600ms total

### After (Smart Cache)
```
Navigate to Inventory → API call (200ms)
Navigate away
Navigate back → Cached (0ms) ✅
Navigate away
Navigate back → Cached (0ms) ✅
```
**Result:** 1 API call, 200ms total

### After Changes (Stale Marking)
```
Navigate to Inventory → API call (200ms)
Navigate to Replacement → Mark stale
Create donation → inventoryStore.markStale()
Navigate back to Inventory → API call (200ms) ✅
Navigate away
Navigate back → Cached (0ms) ✅
```
**Result:** 2 API calls (only when needed), 400ms total

## Industry Standard

This pattern is used by:
- **React Query** - `staleTime` and `cacheTime` options
- **SWR** - `revalidateOnFocus` and `revalidateOnReconnect`
- **Apollo Client** - `fetchPolicy` with `cache-and-network`
- **Redux Toolkit Query** - `invalidatesTags` for cache invalidation

## Testing

### Test Cache Works
```javascript
// 1. Open inventory page (should fetch)
// 2. Navigate to dashboard
// 3. Navigate back to inventory (should use cache)
// Console: "[INVENTORY-SSE] 💾 Cache valid, using cached data"
```

### Test Stale Marking Works
```javascript
// 1. Open inventory page
// 2. Navigate to replacement page
// 3. Create donation
// Console: "[REPLACEMENT] Marking inventory cache as stale"
// 4. Navigate back to inventory (should force refresh)
// Console: "[INVENTORY-SSE] 🗑️ Cache invalid, forcing refresh"
```

### Test Real-Time Updates Work
```javascript
// 1. Open inventory page
// 2. Keep page open
// 3. Create donation in new tab
// Console: "[INVENTORY-SSE] 🎯 Performing optimistic single-item update"
// UI updates without reload ✅
```

## Conclusion

The smart cache strategy with stale marking provides:
- ✅ **Best of both worlds** - Fast cache + Fresh data
- ✅ **Industry-standard pattern** - Used by major libraries
- ✅ **Optimal performance** - Minimal API calls
- ✅ **Great UX** - Instant loads + Fresh data
- ✅ **Data consistency** - Always accurate

The implementation is simple, maintainable, and follows best practices for modern web applications.
