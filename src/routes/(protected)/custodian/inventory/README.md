# Inventory Management System

## Overview

Professional, enterprise-grade inventory management system for CHTM Cooks kitchen laboratory equipment and supplies.

## Features

- ✅ **Complete CRUD Operations**: Create, Read, Update, Delete inventory items and categories
- ✅ **Image Upload**: Professional image handling with validation and storage
- ✅ **Category Management**: Organize items into categories with color coding
- ✅ **Stock Tracking**: Monitor current count, EOM (End of Month) count, and variance
- ✅ **Low Stock Alerts**: Automatic alerts when items fall below minimum stock levels
- ✅ **Search & Filter**: Advanced search and filtering capabilities
- ✅ **Professional UI**: Modern, responsive interface with loading states and error handling
- ✅ **Role-Based Access**: Custodians and superadmins can manage inventory
- ✅ **Database Indexes**: Optimized queries with comprehensive indexing
- ✅ **Audit Trail**: Track who created and updated items

## Folder Structure

```
src/
├── lib/
│   ├── api/
│   │   └── inventory.ts              # Frontend API client
│   └── server/
│       ├── models/
│       │   ├── InventoryItem.ts      # Item data model
│       │   └── InventoryCategory.ts  # Category data model
│       └── db/
│           └── indexes/
│               └── definitions.ts    # Database indexes (updated)
├── routes/
│   ├── (protected)/
│   │   └── custodian/
│   │       └── inventory/
│   │           └── +page.svelte      # Main inventory page
│   └── api/
│       └── inventory/
│           ├── items/
│           │   ├── +server.ts        # Items CRUD API
│           │   └── [id]/
│           │       └── +server.ts    # Individual item operations
│           ├── categories/
│           │   ├── +server.ts        # Categories CRUD API
│           │   └── [id]/
│           │       └── +server.ts    # Individual category operations
│           └── upload/
│               └── +server.ts        # Image upload endpoint
└── static/
    └── uploads/
        └── inventory/                # Uploaded images storage
```

## API Endpoints

### Items

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/inventory/items` | Get all items with filtering | Yes (custodian/instructor/superadmin) |
| GET | `/api/inventory/items/:id` | Get single item | Yes (custodian/instructor/superadmin) |
| POST | `/api/inventory/items` | Create new item | Yes (custodian/superadmin) |
| PATCH | `/api/inventory/items/:id` | Update item | Yes (custodian/superadmin) |
| DELETE | `/api/inventory/items/:id` | Delete item (soft delete) | Yes (custodian/superadmin) |

### Categories

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/inventory/categories` | Get all categories | Yes (custodian/instructor/superadmin) |
| POST | `/api/inventory/categories` | Create new category | Yes (custodian/superadmin) |
| PATCH | `/api/inventory/categories/:id` | Update category | Yes (custodian/superadmin) |
| DELETE | `/api/inventory/categories/:id` | Delete category (soft delete) | Yes (custodian/superadmin) |

### Upload

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/inventory/upload` | Upload item image | Yes (custodian/superadmin) |

## Data Models

### InventoryItem

```typescript
{
  _id: ObjectId;
  name: string;
  category: string;
  categoryId?: ObjectId;
  specification: string;
  toolsOrEquipment: string;
  picture?: string;
  quantity: number;
  eomCount: number;
  minStock: number;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Damaged';
  location?: string;
  description?: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Archived';
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy?: ObjectId;
}
```

### InventoryCategory

```typescript
{
  _id: ObjectId;
  name: string;
  description?: string;
  color: string;  // Tailwind color classes
  itemCount: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId;
  updatedBy?: ObjectId;
}
```

## Usage Examples

### Frontend - Get All Items

```typescript
import { inventoryItemsAPI } from '$lib/api/inventory';

const response = await inventoryItemsAPI.getAll({
  category: 'Cookware',
  status: 'Low Stock',
  search: 'knife',
  page: 1,
  limit: 50
});

console.log(response.items);
```

### Frontend - Create Item

```typescript
import { inventoryItemsAPI } from '$lib/api/inventory';

const newItem = await inventoryItemsAPI.create({
  name: 'Chef Knife Set',
  category: 'Utensils',
  categoryId: '...category-id...',
  specification: 'Stainless steel, 8-piece set',
  toolsOrEquipment: 'Sheath included',
  picture: '/uploads/inventory/image.jpg',
  quantity: 15,
  eomCount: 12,
  minStock: 5,
  condition: 'Good',
  location: 'Cabinet A, Shelf 2',
  description: 'Professional chef knife set'
});
```

### Frontend - Upload Image

```typescript
import { uploadInventoryImage } from '$lib/api/inventory';

const file = event.target.files[0];
const result = await uploadInventoryImage(file);
console.log(result.url); // Use this URL when creating/updating items
```

### Backend - Direct Database Access

```typescript
import { getDatabase } from '$lib/server/db/mongodb';
import type { InventoryItem } from '$lib/server/models/InventoryItem';

const db = await getDatabase();
const itemsCollection = db.collection<InventoryItem>('inventory_items');

const lowStockItems = await itemsCollection.find({
  archived: false,
  quantity: { $lte: minStock }
}).toArray();
```

## Database Indexes

The system includes comprehensive database indexes for optimal performance:

### Items Collection (`inventory_items`)
- Single indexes: name, category, categoryId, status, archived, createdAt, updatedAt
- Compound indexes: archived+category, archived+status
- Full-text search: name, specification, description

### Categories Collection (`inventory_categories`)
- Unique index: name (case-insensitive)
- Single indexes: archived, createdAt
- Compound index: archived+name

These indexes are automatically created using the project's index management system.

## Security Features

- ✅ **Role-Based Access Control**: Only custodians and superadmins can modify data
- ✅ **Input Validation**: All inputs are sanitized and validated
- ✅ **Rate Limiting**: API endpoints are rate-limited to prevent abuse
- ✅ **File Upload Validation**: Images are validated for type and size
- ✅ **Authentication Required**: All endpoints require valid JWT tokens
- ✅ **Audit Logging**: All operations are logged with user information

## Image Upload

- **Allowed formats**: JPEG, JPG, PNG, WebP
- **Max file size**: 5MB
- **Storage location**: `static/uploads/inventory/`
- **Naming convention**: `{timestamp}-{random-hash}.{ext}`
- **Public URL format**: `/uploads/inventory/{filename}`

## Status Calculation

Item status is automatically calculated based on quantity and minStock:

```typescript
if (archived) return 'Archived';
if (quantity === 0) return 'Out of Stock';
if (quantity <= minStock) return 'Low Stock';
return 'In Stock';
```

## Best Practices

1. **Always use categoryId**: When creating items, use categoryId for proper foreign key relationships
2. **Set appropriate minStock**: Configure minimum stock levels to get timely alerts
3. **Archive instead of delete**: Use soft deletes (archiving) to maintain history
4. **Upload images first**: Upload images before creating/updating items
5. **Regular EOM updates**: Update EOM counts at the end of each month for variance tracking
6. **Use search wisely**: Leverage full-text search for better user experience

## Troubleshooting

### Images not displaying
- Ensure the `static/uploads/inventory` directory exists
- Check file permissions
- Verify the public URL is correct

### Category count mismatch
- The system automatically updates category item counts
- If counts are off, re-sync by querying items per category

### Slow queries
- Ensure database indexes are created (visit `/api/db-indexes`)
- Check the index health and performance metrics

## Future Enhancements

Potential additions for future versions:
- [ ] Automated reorder notifications
- [ ] Purchase order integration
- [ ] Barcode/QR code scanning
- [ ] Batch import/export
- [ ] Advanced reporting and analytics
- [ ] Mobile app integration
- [ ] Email notifications for low stock
- [ ] Item reservation system
- [ ] Maintenance/calibration tracking

## Support

For issues or questions, contact the development team or refer to the main project documentation.

---

**Last Updated**: March 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅
