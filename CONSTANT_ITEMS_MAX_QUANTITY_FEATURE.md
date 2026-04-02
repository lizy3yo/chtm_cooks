# Constant Items - Maximum Quantity Per Request Feature

## Overview
This feature allows administrators to set a maximum quantity limit for each constant item that students can request per transaction. This is an industry-standard approach for managing frequently requested equipment with usage policies.

## Business Use Case
- **Resource Management**: Prevent students from requesting excessive quantities of high-demand items
- **Fair Distribution**: Ensure equitable access to limited resources across all students
- **Policy Enforcement**: Implement institutional policies on equipment usage limits
- **Inventory Control**: Better manage frequently requested items with automatic quantity constraints

## Implementation Details

### Database Schema Changes
Added `maxQuantityPerRequest` field to inventory items:
- **Type**: Optional number
- **Purpose**: Defines the maximum quantity a student can request per transaction
- **Behavior**: If not set, no limit is enforced (backward compatible)

### Administrator Interface (Custodian/Inventory Management)

#### 1. Add/Edit Item Modal
- When marking an item as "Constant Item", a new field appears
- **Field**: "Maximum Quantity Per Request"
- **Validation**: Must be a positive integer (minimum 1)
- **UI**: Conditional field that only shows when "Mark as Constant Item" is checked
- **Help Text**: "Limit how many units students can request per transaction. Leave empty for no limit."

#### 2. Constant Items Tab
- Added new column: "Max Per Request"
- **Display**: Shows the limit with a purple badge and document icon
- **No Limit**: Shows "No limit" in gray text when not configured
- **Visual Design**: Professional badge styling for quick identification

### Student Interface (Request Equipment Page)

#### 1. Quantity Input Constraints
- Input field `max` attribute respects `maxQuantityPerRequest`
- **Logic**: `effectiveMax = min(maxQuantityPerRequest, availableQuantity)`
- **Behavior**: Students cannot enter quantities exceeding the limit

#### 2. Visual Indicators
- Purple info badge displays below item name
- **Message**: "Max X per request"
- **Icon**: Information icon for clarity
- **Color**: Purple theme to distinguish from other status indicators

#### 3. Validation
- Form validation checks against `maxQuantityPerRequest` limits
- **Error Message**: "Each selected item must have a valid quantity within available stock and request limits"
- **Prevention**: Blocks form submission if limits are exceeded

### Technical Implementation

#### Data Flow
1. **Admin sets limit** → Saved to database with item
2. **Student loads request form** → Limit fetched with item data
3. **Student adjusts quantity** → JavaScript enforces limit in real-time
4. **Form submission** → Server-side validation (recommended for security)

#### Key Functions Updated
- `loadAvailableEquipment()`: Includes `maxQuantityPerRequest` in item mapping
- `updateItemQuantity()`: Enforces effective maximum (limit vs. available)
- `validateForm()`: Validates quantities against limits before submission
- `handleAddItem()`: Saves `maxQuantityPerRequest` when creating/updating items

## User Experience

### For Administrators
1. Navigate to Inventory Management → Constant Items tab
2. Click "Add New Item" or edit existing constant item
3. Check "Mark as Constant Item"
4. Enter desired maximum quantity per request (e.g., 5)
5. Save item
6. View configured limits in the Constant Items table

### For Students
1. Navigate to Request Equipment page
2. Constant items appear automatically in selected items
3. See "Max X per request" indicator below item name
4. Quantity input automatically limited to configured maximum
5. Cannot exceed limit when adjusting quantity
6. Clear validation messages if attempting to exceed limits

## Benefits

### Operational
- **Automated Enforcement**: No manual checking of request quantities
- **Consistent Policy**: Same limits applied to all students automatically
- **Audit Trail**: Limits are part of item configuration history

### User Experience
- **Clear Communication**: Students see limits upfront
- **Prevents Errors**: Cannot submit invalid requests
- **Fair Access**: Ensures equitable distribution of resources

### Administrative
- **Flexible Configuration**: Set different limits for different items
- **Easy Management**: Configure limits in same interface as other item properties
- **Optional Feature**: Backward compatible - works with or without limits

## Best Practices

### Setting Limits
- **High-Demand Items**: Set conservative limits (e.g., 2-5 units)
- **Consumables**: Consider usage patterns and restocking frequency
- **Specialized Equipment**: May not need limits if naturally scarce
- **Review Regularly**: Adjust limits based on usage data and feedback

### Communication
- Inform students about request limits through orientation or documentation
- Include rationale for limits in equipment policies
- Provide contact information for special requests exceeding limits

## Future Enhancements (Optional)
- **Per-User Limits**: Different limits for different user roles
- **Time-Based Limits**: Daily/weekly quotas for specific items
- **Override Mechanism**: Allow administrators to approve exceptions
- **Analytics Dashboard**: Track limit effectiveness and adjustment needs

## Technical Notes

### Backward Compatibility
- Existing items without `maxQuantityPerRequest` work normally (no limit)
- Database migration not required - field is optional
- Existing constant items continue functioning as before

### Security Considerations
- Client-side validation for UX (immediate feedback)
- Server-side validation recommended for security (prevent manipulation)
- Audit logging of limit changes recommended for compliance

### Performance
- No performance impact - simple numeric comparison
- Cached with item data - no additional database queries
- Real-time validation uses in-memory data

## Testing Checklist

### Administrator Tests
- [ ] Create new constant item with max quantity limit
- [ ] Edit existing constant item to add/change limit
- [ ] Remove limit from constant item (set to empty)
- [ ] Verify limit displays correctly in Constant Items tab
- [ ] Test with various limit values (1, 5, 10, 100, etc.)

### Student Tests
- [ ] Verify limit indicator appears for items with limits
- [ ] Test quantity input respects maximum
- [ ] Attempt to manually enter quantity exceeding limit
- [ ] Verify validation prevents submission with invalid quantities
- [ ] Test items without limits still work normally
- [ ] Test with out-of-stock constant items

### Edge Cases
- [ ] Limit greater than available quantity (should use available)
- [ ] Limit of 1 (minimum valid value)
- [ ] Very large limits (e.g., 999)
- [ ] Changing limit while students have items in cart
- [ ] Removing constant status from item with limit

## Conclusion
This feature provides a professional, industry-standard solution for managing constant items with configurable request limits. It balances administrative control with user experience, ensuring fair resource distribution while maintaining system flexibility.
