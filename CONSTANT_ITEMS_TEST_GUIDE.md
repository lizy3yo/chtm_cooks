# Constant Items Feature - Testing Guide

## Quick Test Steps

### Test 1: Create a New Constant Item
1. Log in as a custodian
2. Navigate to **Inventory Management**
3. Click **"Add New Item"** button
4. Fill in the form:
   - Item Name: "Test Constant Item"
   - Category: Select any category
   - Current Count: 5
   - Check the **"Mark as Constant Item"** checkbox
5. Click **"Add Item"**
6. **Expected Result**: Item is created successfully

### Test 2: Verify Item Appears in Constant Items Tab
1. Stay on the Inventory Management page
2. Click the **"Constant"** tab (emerald colored, second tab)
3. **Expected Result**: 
   - You should see "Test Constant Item" in the list
   - The item should have an emerald "Constant" badge
   - The tab counter should show "1"

### Test 3: Toggle Constant Status via Menu
1. Go back to the **"Items"** tab
2. Click on any regular item (not constant)
3. Click the menu button (⋮) in the top right
4. Click **"Mark as Constant"**
5. **Expected Result**: 
   - Success toast message appears
   - Item now shows emerald "Constant" badge
   - Item appears in Constant Items tab

### Test 4: Remove Constant Status
1. Go to the **"Constant"** tab
2. Find the item you just marked as constant
3. Click the **"Remove"** button (desktop) or **"Remove"** link (mobile)
4. **Expected Result**:
   - Success toast message appears
   - Item disappears from Constant Items tab
   - Item no longer shows "Constant" badge in Items tab

### Test 5: Edit Constant Item
1. Go to **"Constant"** tab
2. Click the edit icon (pencil) next to a constant item
3. Modify any field (e.g., change quantity)
4. **Expected Result**:
   - The "Mark as Constant Item" checkbox is checked
   - After saving, item remains in Constant Items tab
   - Changes are saved successfully

### Test 6: Uncheck Constant in Edit Form
1. Go to **"Constant"** tab
2. Click edit icon on a constant item
3. Uncheck the **"Mark as Constant Item"** checkbox
4. Click **"Update Item"**
5. **Expected Result**:
   - Item is removed from Constant Items tab
   - Item appears in regular Items tab without constant badge

### Test 7: Persistence Check
1. Mark an item as constant
2. Refresh the page (F5 or Ctrl+R)
3. Go to **"Constant"** tab
4. **Expected Result**: 
   - Item is still marked as constant
   - All constant items persist after reload

### Test 8: Visual Indicators
1. Go to **"Items"** tab
2. Look for items with emerald "Constant" badge
3. **Expected Result**:
   - Constant items show emerald badge in both mobile and desktop views
   - Badge appears before category badge
   - Badge is clearly visible and readable

## Troubleshooting

### Issue: Item marked as constant but doesn't appear in Constant Items tab

**Solution:**
1. Check browser console for errors (F12)
2. Verify the API response includes `isConstant: true`
3. Clear browser cache and reload
4. Check if the item is archived (archived items don't show in constant tab)

### Issue: Changes don't persist after page reload

**Solution:**
1. Check network tab to verify API calls are successful
2. Verify database connection is working
3. Check server logs for any errors
4. Ensure cache is being invalidated properly

### Issue: Toggle button doesn't work

**Solution:**
1. Check browser console for JavaScript errors
2. Verify user has custodian or superadmin role
3. Check if API endpoint is responding (Network tab)
4. Verify authentication token is valid

## API Testing (Optional)

### Test POST /api/inventory/items with isConstant
```bash
curl -X POST http://localhost:5173/api/inventory/items \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "name": "API Test Constant Item",
    "category": "Test Category",
    "quantity": 10,
    "eomCount": 10,
    "condition": "Good",
    "isConstant": true
  }'
```

**Expected Response:**
```json
{
  "id": "...",
  "name": "API Test Constant Item",
  "isConstant": true,
  ...
}
```

### Test PATCH /api/inventory/items/[id] to toggle isConstant
```bash
curl -X PATCH http://localhost:5173/api/inventory/items/ITEM_ID \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "isConstant": true
  }'
```

**Expected Response:**
```json
{
  "id": "ITEM_ID",
  "isConstant": true,
  ...
}
```

### Test GET /api/inventory/items to verify isConstant field
```bash
curl http://localhost:5173/api/inventory/items \
  -H "Cookie: your-session-cookie"
```

**Expected Response:**
```json
{
  "items": [
    {
      "id": "...",
      "name": "...",
      "isConstant": true,
      ...
    }
  ],
  ...
}
```

## Success Criteria

✅ All 8 manual tests pass without errors
✅ Constant items persist after page reload
✅ Visual indicators display correctly on all screen sizes
✅ API responses include isConstant field
✅ No console errors or warnings
✅ Toast notifications appear for all actions
✅ Real-time updates work (if multiple tabs open)

## Notes

- The feature uses emerald color (#10b981) to distinguish constant items
- Constant items always appear on student request forms (future enhancement)
- The feature follows industry-standard patterns for inventory management
- All changes are logged in the inventory history
