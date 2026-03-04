# Inventory History System

Professional inventory history management system with activity logs, archived items, and soft-delete capabilities.

## Features

### 1. **Activity Logs (Audit Trail)**
Complete audit trail of all inventory operations:
- Track who performed what action
- Filter by action type (created, updated, deleted, archived, restored)
- Filter by entity type (items, categories)
- Date range filtering
- IP address tracking
- User role auditing

**Use Cases:**
- Compliance and auditing
- Troubleshooting inventory changes
- Security investigations
- Performance monitoring

### 2. **Archived Items**
Managed archive system for inactive inventory:
- Items remain in system but hidden from active list
- One-click restore to active inventory
- View complete item history
- Included in reports for historical accuracy
- Search and filter capabilities

**Use Cases:**
- Seasonal items
- Temporarily unavailable items
- Items under maintenance
- Historical record keeping

### 3. **Recently Deleted (Soft Delete)**
30-day retention policy for deleted items:
- Items recoverable for 30 days
- Automatic permanent deletion after expiration
- Days remaining indicator
- Manual permanent deletion (superadmin only)
- Complete deletion audit trail

**Use Cases:**
- Accidental deletion recovery
- Grace period for data retention
- Compliance with data policies
- Audit trail for deletions

## Technical Architecture

### Database Collections

#### `inventory_history`
```typescript
{
  action: InventoryAction,
  entityType: 'item' | 'category',
  entityId: ObjectId,
  entityName: string,
  userId: ObjectId,
  userName: string,
  userRole: string,
  changes?: Array,
  metadata?: Object,
  ipAddress?: string,
  userAgent?: string,
  timestamp: Date
}
```

**Indexes:**
- `idx_timestamp_desc`: Fast time-based queries
- `idx_action_timestamp`: Filter by action type
- `idx_entitytype_timestamp`: Filter by entity type
- `idx_entityid_timestamp`: Entity-specific history
- `idx_userid_timestamp`: User activity tracking
- `idx_timestamp_ttl`: Auto-delete after 1 year (optional)

#### `inventory_deleted`
```typescript
{
  originalId: ObjectId,
  itemData: InventoryItem,
  deletedBy: ObjectId,
  deletedByName: string,
  deletedByRole: string,
  deletedAt: Date,
  scheduledDeletion: Date, // deletedAt + 30 days
  reason?: string,
  ipAddress?: string
}
```

**Indexes:**
- `idx_deletedat_desc`: Sort by deletion date
- `idx_scheduled_deletion_ttl`: Auto-delete expired items
- `idx_itemdata_name`: Search by item name
- `idx_originalid`: Fast lookups
- `idx_deletedby_deletedat`: Audit by user

### API Endpoints

#### Activity Logs
- `GET /api/inventory/history` - Get activity logs with filtering

#### Archived Items
- `GET /api/inventory/archived` - Get archived items
- `POST /api/inventory/archived` - Restore archived item

#### Deleted Items
- `GET /api/inventory/deleted` - Get recently deleted items
- `POST /api/inventory/deleted/restore` - Restore deleted item
- `DELETE /api/inventory/deleted` - Permanently delete (superadmin only)

#### Indexes Management
- `POST /api/inventory/indexes` - Create database indexes (superadmin only)

### Caching Strategy

| Endpoint | Cache Duration | Invalidation |
|----------|----------------|--------------|
| Activity Logs | 2 minutes | Manual refresh |
| Archived Items | 5 minutes | On restore |
| Deleted Items | 1 minute | On restore/delete |

### Security & Permissions

| Action | Custodian | Instructor | Superadmin |
|--------|-----------|------------|------------|
| View Activity Logs | ✅ | ❌ | ✅ |
| View Archived | ✅ | ✅ | ✅ |
| Restore Archived | ✅ | ❌ | ✅ |
| View Deleted | ✅ | ❌ | ✅ |
| Restore Deleted | ✅ | ❌ | ✅ |
| Permanent Delete | ❌ | ❌ | ✅ |
| Create Indexes | ❌ | ❌ | ✅ |

## Setup Instructions

### 1. Create Database Indexes

```powershell
# PowerShell
$body = @{} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:3005/api/inventory/indexes" `
  -Method POST `
  -Body $body `
  -ContentType "application/json" `
  -UseBasicParsing
```

### 2. Configure TTL (Optional)

Edit `src/lib/server/db/indexes/inventoryIndexes.ts`:

```typescript
// Activity logs retention (default: 1 year)
expireAfterSeconds: 31536000

// Deleted items retention (default: 30 days via scheduledDeletion)
// No changes needed - handled automatically
```

### 3. Environment Variables

No additional environment variables required. Uses existing:
- Cookie-based authentication
- MongoDB connection
- Redis cache (if enabled)

## Usage Examples

### Log Activity from Backend

```typescript
import { logInventoryActivity } from '$lib/server/utils/inventoryLogger';
import { InventoryAction } from '$lib/server/models/InventoryHistory';

await logInventoryActivity({
  action: InventoryAction.UPDATED,
  entityType: 'item',
  entityId: itemId,
  entityName: 'Chef Knife Set',
  userId: userId,
  userName: 'John Doe',
  userRole: 'custodian',
  changes: [
    { field: 'quantity', oldValue: 10, newValue: 15 }
  ],
  metadata: {
    previousQuantity: 10,
    newQuantity: 15
  },
  ipAddress: clientIp,
  userAgent: userAgent
});
```

### Query Activity Logs (Frontend)

```typescript
import { inventoryHistoryAPI } from '$lib/api/inventoryHistory';

// Get recent activity
const logs = await inventoryHistoryAPI.getHistory({
  page: 1,
  limit: 50
});

// Filter by action
const updates = await inventoryHistoryAPI.getHistory({
  action: 'updated',
  startDate: '2026-01-01',
  endDate: '2026-03-04'
});
```

### Restore Archived Item

```typescript
import { archivedItemsAPI } from '$lib/api/inventoryHistory';

await archivedItemsAPI.restore(itemId);
```

### Restore Deleted Item

```typescript
import { deletedItemsAPI } from '$lib/api/inventoryHistory';

await deletedItemsAPI.restore(deletedId);
```

## Performance Considerations

### Indexes
- All time-based queries use descending indexes for recent-first sorting
- Compound indexes optimize common filter combinations
- TTL indexes handle automatic cleanup

### Caching
- Activity logs cached for 2 minutes (low frequency changes)
- Archived items cached for 5 minutes
- Deleted items cached for 1 minute (time-sensitive)

### Pagination
- Default: 50 items per page
- Maximum: 100 items per page
- Reduces memory usage and improves response times

## Monitoring

### Recommended Metrics
- Activity log growth rate
- Archived items count
- Deleted items nearing expiration
- Restore/permanent delete operations
- API response times
- Cache hit rates

### Alerts
- Deleted items < 7 days from expiration
- Unusual spike in deletions
- Failed restore operations
- Unauthorized access attempts

## Maintenance

### Daily Tasks
- Monitor deleted items nearing expiration
- Review activity logs for anomalies

### Weekly Tasks
- Review archived items for cleanup
- Check database index performance

### Monthly Tasks
- Analyze storage growth
- Review TTL settings
- Audit permission usage

## Troubleshooting

### Items not appearing in Activity Logs
1. Check if logging is enabled in backend
2. Verify indexes are created
3. Check cache expiration
4. Review error logs

### Deleted items not auto-deleting
1. Verify TTL index exists: `idx_scheduled_deletion_ttl`
2. Check MongoDB TTL monitor is running
3. Verify `scheduledDeletion` dates are set correctly

### Performance issues
1. Ensure all indexes are created
2. Check cache hit rates
3. Review pagination settings
4. Consider increasing cache duration

## Future Enhancements

- Export activity logs to CSV/PDF
- Advanced filtering (multiple actions, users)
- Bulk restore operations
- Custom retention policies per item type
- Real-time activity notifications
- Scheduled reports generation
