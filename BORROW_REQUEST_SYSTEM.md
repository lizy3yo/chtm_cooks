# Borrow Request System - Professional Implementation

## Overview
This document outlines the professional, industry-standard implementation of the multi-stage borrow request approval system.

## Status Flow Architecture

### Status Lifecycle
```
Student Submits Request
    ↓
[pending_instructor] ──→ Instructor Reviews
    ↓                           ↓
    ↓                    [rejected_instructor] (Terminal)
    ↓
[approved_instructor] ──→ Custodian Prepares Items
    ↓                           ↓
    ↓                    [rejected_custodian] (Terminal)
    ↓
[ready_for_pickup] ──→ Student Picks Up
    ↓
[borrowed] ──→ Student Returns
    ↓
[returned] (Terminal)
```

### Status Definitions

| Status | Description | Who Can Act | Next Status |
|--------|-------------|-------------|-------------|
| `pending_instructor` | Student submitted, awaiting instructor approval | Instructor | `approved_instructor`, `rejected_instructor` |
| `approved_instructor` | Instructor approved, awaiting custodian release | Custodian | `ready_for_pickup`, `rejected_custodian` |
| `ready_for_pickup` | Custodian prepared items, student can pick up | Custodian (confirms pickup) | `borrowed` |
| `borrowed` | Student picked up items (active borrow) | Custodian (confirms return) | `returned` |
| `returned` | Student returned items (completed) | None | Terminal |
| `rejected_instructor` | Instructor rejected the request | None | Terminal |
| `rejected_custodian` | Custodian rejected (item unavailable, etc.) | None | Terminal |
| `cancelled` | Student cancelled the request | None | Terminal |

## Database Schema

### Collection: `borrowRequests`

```typescript
{
  _id: ObjectId,
  requestId: "REQ-0001",
  
  // Student Information
  studentId: ObjectId,
  studentName: string,
  studentEmail: string,
  yearLevel: string,
  block: string,
  
  // Request Details
  items: [
    {
      itemId: ObjectId,
      itemName: string,
      itemCode: string,
      quantity: number,
      imageUrl?: string
    }
  ],
  purpose: string,
  borrowDate: Date,
  returnDate: Date,
  
  // Status & Workflow
  status: BorrowRequestStatus,
  
  // Instructor Approval
  instructorId?: ObjectId,
  instructorName?: string,
  instructorApprovedAt?: Date,
  instructorRejectionReason?: string,
  
  // Custodian Release
  custodianId?: ObjectId,
  custodianName?: string,
  custodianReleasedAt?: Date,
  custodianRejectionReason?: string,
  custodianNotes?: string,
  
  // Pickup & Return
  pickedUpAt?: Date,
  returnedAt?: Date,
  actualReturnDate?: Date,
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  isUrgent: boolean,
  isOverdue: boolean
}
```

## API Endpoints

### 1. List Borrow Requests
```
GET /api/borrow-requests?status={status}&limit={limit}&skip={skip}
```

**Role-based filtering:**
- **Students**: See only their own requests
- **Instructors**: See pending requests + requests they approved
- **Custodians**: See approved requests awaiting release + active borrows

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "requestId": "REQ-0001",
      "student": { ... },
      "items": [ ... ],
      "status": "approved_instructor",
      "statusDisplay": "Approved - Awaiting Release",
      "timeline": [ ... ],
      ...
    }
  ],
  "pagination": { ... }
}
```

### 2. Create Borrow Request (Student)
```
POST /api/borrow-requests
```

**Body:**
```json
{
  "items": [
    {
      "itemId": "...",
      "itemName": "Chef Knife Set",
      "itemCode": "CK-001",
      "quantity": 1
    }
  ],
  "purpose": "Lab Exercise",
  "borrowDate": "2026-03-08",
  "returnDate": "2026-03-15",
  "isUrgent": false
}
```

### 3. Approve Request (Instructor/Custodian)
```
POST /api/borrow-requests/{id}/approve
```

**Behavior:**
- **Instructor**: `pending_instructor` → `approved_instructor`
- **Custodian**: `approved_instructor` → `ready_for_pickup`

**Body (optional):**
```json
{
  "notes": "Items prepared in storage room A"
}
```

### 4. Reject Request (Instructor/Custodian)
```
POST /api/borrow-requests/{id}/reject
```

**Body:**
```json
{
  "reason": "Item currently under maintenance"
}
```

### 5. Confirm Pickup (Custodian)
```
POST /api/borrow-requests/{id}/pickup
```

**Behavior:** `ready_for_pickup` → `borrowed`

### 6. Confirm Return (Custodian)
```
POST /api/borrow-requests/{id}/return
```

**Body (optional):**
```json
{
  "condition": "Good",
  "notes": "All items returned in good condition"
}
```

**Behavior:** `borrowed` → `returned`

## UI Integration

### Student View
- **My Requests Page**: Shows all their requests with status
- **Tabs**: All, Pending, Approved, Ready for Pickup, Rejected
- **Status Badge**: Color-coded status indicator
- **Timeline**: Visual progress tracker showing approval stages

### Instructor View
- **Requests Page**: Shows pending requests + their approved requests
- **Tabs**: Pending Approval, Approved, Rejected, All
- **Urgent Section**: Highlighted requests needing immediate attention
- **Actions**: Approve, Reject with reason
- **After Approval**: Shows "Awaiting Custodian Release" status

### Custodian View
- **Dashboard**: Shows requests awaiting release
- **Tabs**: Awaiting Release, Ready for Pickup, Currently Borrowed, Completed
- **Actions**: 
  - Prepare items (approve) → marks as ready_for_pickup
  - Confirm pickup → marks as borrowed
  - Confirm return → marks as returned
- **Status Tracking**: See which requests are approved by instructors

## Status Display Mapping

```typescript
const statusColors = {
  pending_instructor: 'bg-yellow-100 text-yellow-800',
  approved_instructor: 'bg-blue-100 text-blue-800',
  ready_for_pickup: 'bg-green-100 text-green-800',
  borrowed: 'bg-purple-100 text-purple-800',
  returned: 'bg-gray-100 text-gray-800',
  rejected_instructor: 'bg-red-100 text-red-800',
  rejected_custodian: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800'
};

const statusIcons = {
  pending_instructor: '⏳',
  approved_instructor: '✓',
  ready_for_pickup: '📦',
  borrowed: '🔄',
  returned: '✅',
  rejected_instructor: '❌',
  rejected_custodian: '❌',
  cancelled: '🚫'
};
```

## Timeline Component

The timeline shows the complete journey of a request:

1. **Request Submitted** (✓ Completed)
2. **Instructor Review** (⏳ Current / ✓ Completed / ❌ Rejected)
3. **Custodian Preparation** (⏳ Current / ✓ Completed / ❌ Rejected)
4. **Ready for Pickup** (⏳ Current / ✓ Completed)
5. **Items Returned** (✓ Completed)

## Recommended Indexes

```javascript
db.borrowRequests.createIndex({ studentId: 1, status: 1 });
db.borrowRequests.createIndex({ instructorId: 1, status: 1 });
db.borrowRequests.createIndex({ status: 1, createdAt: -1 });
db.borrowRequests.createIndex({ requestId: 1 }, { unique: true });
db.borrowRequests.createIndex({ borrowDate: 1, returnDate: 1 });
```

## Notifications (Future Enhancement)

Consider implementing notifications for:
- Student: When instructor approves/rejects
- Student: When custodian prepares items (ready for pickup)
- Instructor: When new request is submitted
- Custodian: When instructor approves request
- All: Overdue reminders

## Best Practices

1. **Atomic Updates**: Use MongoDB transactions for status changes
2. **Audit Trail**: All status changes are timestamped with user info
3. **Validation**: Enforce status transition rules
4. **Role-based Access**: Strict permission checks on all endpoints
5. **Clear Communication**: Status display names are user-friendly
6. **Timeline Visibility**: Users can see complete request history

## Migration from Current System

If you have existing data, create a migration script to:
1. Map old status values to new status values
2. Add missing fields (instructorId, custodianId, etc.)
3. Generate requestId for existing records
4. Set appropriate timestamps

## Next Steps

1. ✅ Create BorrowRequest model
2. ✅ Create API endpoints
3. ⏳ Update UI components to use new endpoints
4. ⏳ Add real-time notifications
5. ⏳ Create admin dashboard for monitoring
6. ⏳ Add analytics and reporting
