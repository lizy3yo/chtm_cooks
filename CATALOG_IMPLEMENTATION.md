# Equipment Catalog Implementation Guide

## Overview

The Equipment Catalog has been refactored from placeholder data to a professional, production-grade implementation with real backend integration, comprehensive caching, and industry-standard practices.

---

## Architecture & Components

### 1. **Backend API Endpoint** (`/api/inventory/catalog`)

**Location**: `src/routes/api/inventory/catalog/+server.ts`

**Features**:
- Single unified endpoint for fetching categories and items together
- Advanced filtering: search, category, availability, condition
- Multiple sorting options (name, category, availability, condition, recent, updated)
- Pagination support (default: 50 items/page, max: 200)
- Redis caching with 5-minute TTL (configurable)
- Role-based access control (all authenticated users)
- Student-specific filtering (students see only available items)
- Comprehensive logging and error handling
- Rate limiting applied

**Query Parameters**:
```
GET /api/inventory/catalog?search=knife&category=utensils&availability=all&condition=Excellent&sortBy=name&page=1&limit=50
```

**Supported Values**:
- `search`: Text search (searches name, specification, description)
- `category`: Category ID or 'all'
- `availability`: 'all', 'available', 'borrowed', 'maintenance', 'outofstock'
- `condition`: 'all', 'Excellent', 'Good', 'Fair', 'Poor', 'Damaged'
- `sortBy`: 'name', 'category', 'availability', 'condition', 'recent', 'updated'

**Response Format**:
```json
{
  "categories": [
    {
      "id": "...",
      "name": "Utensils",
      "description": "...",
      "itemCount": 15,
      "archived": false
    }
  ],
  "items": [
    {
      "id": "...",
      "name": "Chef Knife Set",
      "category": "Utensils",
      "status": "In Stock",
      "condition": "Excellent",
      "quantity": 5,
      ...
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50,
  "pages": 1,
  "summary": {
    "totalItems": 42,
    "categoriesCount": 5,
    "filteredItemsCount": 10
  }
}
```

---

### 2. **Frontend API Client** (`src/lib/api/catalog.ts`)

**Features**:
- Type-safe TypeScript types
- Automatic cookie-based credential handling
- Three main methods:
  - `getCatalog()` - Fetch complete catalog with filters
  - `getCategories()` - Lightweight category fetch
  - `getItems()` - Lightweight items fetch with pagination

**Usage Example**:
```typescript
import { catalogAPI } from '$lib/api/catalog';

// Fetch catalog with filters
const catalog = await catalogAPI.getCatalog({
  search: 'knife',
  category: 'utensil-id',
  availability: 'available',
  condition: 'Excellent',
  sortBy: 'name',
  page: 1,
  limit: 50
});

// Just get categories
const categories = await catalogAPI.getCategories();

// Just get items
const items = await catalogAPI.getItems({
  page: 1,
  limit: 50
});
```

---

### 3. **Svelte Component** (Catalog Page)

**Location**: `src/routes/(protected)/student/catalog/+page.svelte`

**Features**:
- Real-time data fetching with loading states
- Comprehensive error handling
- Two view modes: Grid and List
- Advanced filtering with 6 different filters
- Search with debouncing (300ms)
- Pagination with smart page navigation
- Toast notifications for user feedback
- Responsive design (mobile-first)
- Accessibility features (ARIA labels, keyboard navigation)
- Skeleton loaders during data fetch
- Empty state handling

**State Management**:
- `viewMode`: 'grid' | 'list'
- `isLoading`: Loading state
- `error`: Error messages
- `toastMessage`: Temporary notifications
- `currentPage`: Pagination state
- `Filter states`: search, category, availability, condition, sortBy

---

### 4. **Database Indexes**

**New Indexes Added** (`src/lib/server/db/indexes/inventoryIndexes.ts`):

**Inventory Items Collection** (`inventory_items`):
```javascript
[
  { archived: 1, name: 1 },                              // idx_archived_name
  { categoryId: 1, archived: 1 },                        // idx_categoryid_archived
  { status: 1, archived: 1 },                            // idx_status_archived
  { condition: 1, archived: 1 },                         // idx_condition_archived
  { archived: 1, status: 1, categoryId: 1, name: 1 },   // idx_catalog_query (compound)
  { name: 'text', specification: 'text', description: 'text' }, // idx_fulltext_search
  { createdAt: -1 },                                     // idx_createdat_desc
  { updatedAt: -1 },                                     // idx_updatedat_desc
  { createdBy: 1, createdAt: -1 }                       // idx_createdby_createdat
]
```

**Inventory Categories Collection** (`inventory_categories`):
```javascript
[
  { archived: 1, name: 1 },                              // idx_archived_name
  { name: 'text', description: 'text' },                // idx_fulltext_search
  { createdAt: -1 },                                     // idx_createdat_desc
  { createdBy: 1, createdAt: -1 }                       // idx_createdby_createdat
]
```

**Index Creation**:
```bash
# POST /api/inventory/indexes/create (Superadmin only)
# Creates all indexes automatically
```

---

### 5. **Caching Strategy**

**Redis Cache Configuration**:
- **TTL**: 5 minutes (300 seconds) - balances freshness vs performance
- **Cache Key Pattern**: `inventory:catalog:{partition}:{filters}:{page}:{limit}`
- **Partitions**: 'student' (sees only available) | 'staff' (sees all)
- **Compression**: Automatic for values > 1KB
- **Namespace**: Uses application namespace

**Cache Flow**:
1. Request received with filters
2. Generate cache key based on user role and parameters
3. Check Redis for cached response
4. If hit: return cached data
5. If miss: query database, cache result, return

**Console Logging**:
```
❯ Catalog served from cache { cacheKey: 'inventory:catalog:student:...', userId: '...' }
```

---

## Security & Validation

### Authentication
- ✓ JWT token verification via httpOnly cookies
- ✓ Automatic credential inclusion in all requests
- ✓ Role-based access control ('custodian', 'instructor', 'superadmin', 'student')
- ✓ Students get filtered view (only available items)

### Input Validation
- ✓ Search input sanitization (regex patterns)
- ✓ Enum validation for filters (availability, condition)
- ✓ ObjectId validation for category IDs
- ✓ Pagination limits enforced (1-200 items per page)
- ✓ Query parameter type coercion and defaults

### Rate Limiting
- ✓ Applied to catalog endpoint (API preset)
- ✓ Prevents abuse and ensures fair usage
- ✓ Uses Redis for distributed rate limiting

---

## Performance Optimizations

### Database Query Optimization
1. **Compound Indexes** for common filter combinations
2. **Text Indexes** for full-text search
3. **Selective Field Queries** (no unnecessary fields)
4. **Proper Sort Indexes** for ordering operations

### Frontend Optimization
1. **Debounced Search** (300ms delay)
2. **Skeleton Loaders** during data fetch
3. **Responsive Image Loading** with `loading="lazy"`
4. **Smart Pagination** (limits page buttons)
5. **Background Refresh** (5-minute refresh cycle)

### Caching Strategy
1. **Server-side Redis Caching** (5-minute TTL)
2. **Role-based Cache Partitioning**
3. **Automatic Cache Invalidation** on TTL expiry
4. **Gzip Compression** for large responses

---

## Error Handling

### API Level
- 401: Unauthorized (missing/invalid token)
- 403: Forbidden (insufficient permissions)
- 429: Rate limit exceeded
- 500: Server error with development mode details

### Frontend Level
- Network error handling with retry logic
- User-friendly error messages
- Toast notifications for errors
- Error state UI with recovery options
- Console logging for debugging

---

## Usage Guidelines

### For Students
1. Browse equipment by category
2. Filter by availability and condition
3. Search for specific items
4. Switch between grid/list views
5. Request equipment (feature in progress)

### For Custodians/Instructors
- All items visible (both available and unavailable)
- Same filtering and search capabilities
- Item management features (in other sections)

### For Superadmins
- Create/manage database indexes
- Full system access
- Admin dashboard features

---

## Data Flow (Complete Flow)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ACTION                              │
│            (Filter, Sort, Search, Paginate)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         FRONTEND: Svelte Component                          │
│  • Collect filter parameters                                │
│  • Trigger API call                                         │
│  • Show loading skeleton                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         API CLIENT: catalogAPI.getCatalog()                 │
│  • Build query parameters                                   │
│  • Add credentials (cookies)                                │
│  • Send to /api/inventory/catalog                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│       BACKEND: /api/inventory/catalog [+server.ts              │
│  1. Verify JWT from cookie                                  │
│  2. Check authorization (role)                              │
│  3. Apply rate limiting                                     │
│  4. Build cache key                                         │
│  5. Check Redis cache                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │                 │
        HIT  │               MISS
            │                 │
            ▼                 ▼
       ┌─────────────┐  ┌──────────────────┐
       │Return cache │  │Query MongoDB     │
       └────┬────────┘  │ • Filter items   │
            │           │ • Fetch items    │
            │           │ • Fetch categories
            │           └────┬─────────────┘
            │                │
            │                ▼
            │        ┌──────────────────┐
            │        │Cache in Redis    │
            │        │(5 min TTL)       │
            │        └────┬─────────────┘
            │             │
            └────┬────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│       JSON RESPONSE                                         │
│  • Categories array                                         │
│  • Items array with metadata                                │
│  • Pagination info                                          │
│  • Summary statistics                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         FRONTEND: Handle Response                           │
│  • Store in catalogData state                               │
│  • Update derived state (filteredItems, etc)                │
│  • Hide loading skeleton                                    │
│  • Render grid/list view                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              USER SEES RESULTS                              │
│        • Catalog items displayed                            │
│        • Can interact with filters                          │
│        • Can switch views                                   │
│        • Can paginate                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] **Authentication**: Verify cookie-based auth works
- [ ] **Filtering**: Test each filter independently
- [ ] **Search**: Test search with various queries
- [ ] **Sorting**: Verify all sort options work
- [ ] **Pagination**: Test page navigation
- [ ] **View Modes**: Grid and list views display correctly
- [ ] **Loading**: Skeleton loaders appear during fetch
- [ ] **Errors**: Error messages display for failed requests
- [ ] **Role-based**: Students see only available items
- [ ] **Caching**: Verify second request uses cache
- [ ] **Responsive**: Test on mobile, tablet, desktop
- [ ] **Accessibility**: Test keyboard navigation, screen readers

---

## Future Enhancements

1. **Request Feature**: Allow students to request equipment
2. **Wishlist**: Save favorite items
3. **Reviews**: Item reviews and ratings
4. **Availability Calendar**: Show when items will be available
5. **Export**: Download catalog as PDF/CSV
6. **Advanced Analytics**: Track popular items and search patterns
7. **Real-time Updates**: WebSocket integration for live availability
8. **Image Optimization**: Lazy load images, thumbnails
9. **Mobile App**: Native mobile application
10. **Multi-language**: i18n support

---

## File Structure

```
src/
├── routes/
│   ├── api/inventory/
│   │   └── catalog/
│   │       └── +server.ts              ← NEW: Catalog API endpoint
│   │   └── indexes/
│   │       └── +server.ts              ← UPDATED: Index creation
│   └── (protected)/student/
│       └── catalog/
│           └── +page.svelte            ← UPDATED: Catalog page
├── lib/
│   ├── api/
│   │   ├── catalog.ts                  ← NEW: Catalog client API
│   │   └── inventory.ts                ← Existing: Base inventory API
│   └── server/
│       ├── db/indexes/
│       │   └── inventoryIndexes.ts    ← UPDATED: Added item/category indexes
│       └── cache/
│           └── (existing cache setup)  ← Already configured
```

---

## Environment Configuration

No additional environment variables required. Uses existing setup:
- **MONGODB_URI**: Connection string
- **REDIS_URL**: Redis connection
- **NODE_ENV**: Development/Production

---

## Support & Troubleshooting

### Issue: "Unauthorized" (401)
**Solution**: Ensure you're logged in and have valid cookies

### Issue: "Forbidden" (403)
**Solution**: Check user role - must be custodian, instructor, or superadmin

### Issue: No items showing but should exist
**Solution**: 
1. Ensure items are not archived
2. Check database has items in `inventory_items` collection
3. Verify indexes exist: `POST /api/inventory/indexes/create`

### Issue: Slow queries
**Solution**:
1. Create indexes if missing
2. Check Redis cache is working
3. Monitor database query performance

### Issue: Cache not working
**Solution**:
1. Verify Redis is running
2. Check `REDIS_URL` environment variable
3. Restart application

---

## Standards & Best Practices Used

✓ **Security**: Role-based access control, input validation, rate limiting
✓ **Performance**: Database indexes, Redis caching, query optimization
✓ **Accessibility**: ARIA labels, keyboard navigation, semantic HTML
✓ **Responsive**: Mobile-first CSS with Tailwind utilities
✓ **Error Handling**: Comprehensive try-catch with user-friendly messages
✓ **Logging**: Structured logging for debugging
✓ **Code Quality**: TypeScript, strict null checks, proper types
✓ **Documentation**: Inline comments, API specs, data flow diagrams
✓ **UX**: Loading states, error states, empty states, toast notifications
✓ **Maintainability**: Modular code, reusable components, clear separation of concerns
