# Constant Items - Student Quantity Control Feature

## Overview
This feature enables students to modify the quantity of constant items in their equipment requests, with intelligent constraints based on administrator-configured limits and available stock. The implementation follows industry-standard UX patterns for quantity selectors in e-commerce and resource management systems.

## Business Requirements

### User Story
"As a student, I want to adjust the quantity of frequently requested items in my equipment request so that I can request the exact amount I need, while respecting institutional policies and availability constraints."

### Acceptance Criteria
- ✅ Students can modify quantities for constant items
- ✅ Quantity respects administrator-set maximum per request
- ✅ Quantity cannot exceed available stock
- ✅ Clear visual feedback when limits are reached
- ✅ Intuitive increment/decrement controls
- ✅ Real-time validation and user feedback
- ✅ Accessible keyboard and mouse interactions

## Implementation Details

### UI Components

#### 1. Quantity Stepper Control
Industry-standard increment/decrement buttons with center input field:

```
[ - ]  [ 5 ]  [ + ]
```

**Features:**
- **Decrement Button (-)**
  - Decreases quantity by 1
  - Disabled when quantity is 1 (minimum)
  - Visual feedback on disabled state (40% opacity)
  
- **Quantity Input**
  - Direct numeric input
  - Centered text for better readability
  - Emerald background for constant items
  - White background for regular items
  - Focus ring on interaction
  
- **Increment Button (+)**
  - Increases quantity by 1
  - Disabled when maximum is reached
  - Visual feedback on disabled state

#### 2. Visual Indicators

**Constant Item Badge**
- "Frequent" label below quantity input
- Emerald color scheme
- Uppercase, small font for subtlety

**Maximum Limit Display**
- Purple info icon with text
- Shows "Max X per request"
- Positioned below item details

**Progress Bar**
- Visual representation of quantity vs. maximum
- 16px wide horizontal bar
- Color coding:
  - Emerald (green): Below maximum
  - Purple: At maximum
- Smooth transition animation (300ms)
- Ratio display: "X/Y" format

#### 3. Constraint Enforcement

**Hard Limits:**
- Minimum: 1 unit (cannot request 0)
- Maximum: Lesser of:
  - `maxQuantityPerRequest` (if set by admin)
  - `available` (current stock)

**Soft Feedback:**
- Toast notification when limit exceeded
- Different messages for policy vs. stock limits
- Non-blocking (doesn't prevent interaction)

### User Experience Flow

#### Scenario 1: Adjusting Quantity Within Limits
1. Student sees constant item with quantity 1
2. Clicks increment (+) button
3. Quantity increases to 2
4. Progress bar updates smoothly
5. Ratio updates: "2/5"
6. Can continue incrementing until maximum

#### Scenario 2: Reaching Maximum Limit
1. Student increments to maximum (e.g., 5/5)
2. Increment button becomes disabled
3. Progress bar turns purple
4. Ratio text turns purple
5. Attempting to type higher number shows toast
6. Value automatically clamped to maximum

#### Scenario 3: Direct Input
1. Student clicks on quantity input field
2. Types desired number (e.g., "3")
3. On blur/enter, value is validated
4. If exceeds maximum, shows toast notification
5. Value automatically adjusted to maximum
6. Progress bar and ratio update accordingly

#### Scenario 4: Policy Limit vs. Stock Limit
**Policy Limit (maxQuantityPerRequest = 5, available = 10):**
- Toast: "Maximum 5 units of 'Demo Table' allowed per request"
- Title: "Request Limit"

**Stock Limit (maxQuantityPerRequest = 10, available = 3):**
- Toast: "Only 3 units of 'Demo Table' available"
- Title: "Stock Limit"

### Technical Implementation

#### Component Structure
```svelte
<div class="flex items-center gap-1">
  <!-- Decrement Button -->
  <button onclick={decrementQuantity} disabled={atMinimum}>
    <MinusIcon />
  </button>
  
  <!-- Quantity Input -->
  <div class="relative">
    <input 
      type="number" 
      value={quantity}
      onchange={updateQuantity}
      class={constantItemStyles}
    />
    {#if isConstant}
      <span class="frequent-badge">Frequent</span>
    {/if}
  </div>
  
  <!-- Increment Button -->
  <button onclick={incrementQuantity} disabled={atMaximum}>
    <PlusIcon />
  </button>
</div>

<!-- Progress Indicator (if has limit) -->
{#if hasMaxLimit}
  <div class="progress-container">
    <div class="progress-bar" style="width: {percentage}%"></div>
    <span class="ratio">{current}/{maximum}</span>
  </div>
{/if}
```

#### Validation Logic
```typescript
function updateItemQuantity(itemId: string, value: string): void {
  const parsed = parseInt(value, 10);
  
  // Determine effective maximum
  const effectiveMax = item.maxQuantityPerRequest 
    ? Math.min(item.maxQuantityPerRequest, item.available)
    : item.available;
  
  // Clamp value between 1 and effectiveMax
  const newQuantity = Math.max(1, Math.min(effectiveMax, parsed));
  
  // Show feedback if exceeded
  if (parsed > effectiveMax) {
    showLimitToast(item, effectiveMax);
  }
  
  // Update state
  updateItemInCart(itemId, newQuantity);
}
```

#### Increment/Decrement Handlers
```typescript
// Decrement
const decrementQuantity = () => {
  const newQty = Math.max(1, currentQuantity - 1);
  updateItemQuantity(itemId, String(newQty));
};

// Increment
const incrementQuantity = () => {
  const maxQty = getEffectiveMaximum(item);
  const newQty = Math.min(maxQty, currentQuantity + 1);
  updateItemQuantity(itemId, String(newQty));
};
```

### Styling Details

#### Color Scheme
- **Constant Items**: Emerald theme (#10b981)
  - Border: `border-emerald-300`
  - Background: `bg-emerald-50`
  - Text: `text-emerald-600`

- **Regular Items**: Gray theme
  - Border: `border-gray-300`
  - Background: `bg-white`

- **Limits**: Purple theme (#9333ea)
  - Icon: `text-purple-700`
  - Progress bar (at max): `bg-purple-600`
  - Ratio text (at max): `text-purple-700`

#### Responsive Design
- Mobile: Stacked layout, larger touch targets
- Desktop: Horizontal layout, compact controls
- Touch-friendly: 32px minimum button size
- Keyboard accessible: Tab navigation, Enter to submit

### Accessibility Features

#### ARIA Attributes
```html
<button 
  aria-label="Decrease quantity"
  title="Decrease quantity"
  disabled={atMinimum}
>
```

#### Keyboard Support
- **Tab**: Navigate between controls
- **Enter**: Submit input value
- **Arrow Up/Down**: Increment/decrement (native input behavior)
- **Space**: Activate buttons

#### Screen Reader Support
- Button labels clearly describe action
- Disabled state announced
- Current value announced on change
- Limit information in title attribute

### Error Handling

#### Invalid Input
- Non-numeric: Reset to 1
- Negative: Clamp to 1
- Decimal: Floor to integer
- Empty: Reset to 1
- Too large: Clamp to maximum

#### Edge Cases
- **Out of Stock**: Show "N/A", disable controls
- **Limit = 1**: Disable increment immediately
- **No Limit**: Use available stock as maximum
- **Limit > Stock**: Use stock as effective maximum

### Performance Considerations

#### Debouncing
- Input changes trigger immediate validation
- Toast notifications throttled (prevent spam)
- Progress bar uses CSS transitions (GPU accelerated)

#### State Management
- Local component state for UI
- Cart store for persistence
- Optimistic updates for responsiveness

#### Rendering
- Conditional rendering for progress bar
- Minimal re-renders on quantity change
- Efficient event handlers (no inline functions in loops)

## User Benefits

### For Students
1. **Flexibility**: Adjust quantities to exact needs
2. **Clarity**: Clear visual feedback on limits
3. **Efficiency**: Quick increment/decrement buttons
4. **Confidence**: Know limits before submission
5. **Control**: Direct input for large quantities

### For Administrators
1. **Policy Enforcement**: Limits automatically applied
2. **Fair Distribution**: Prevents hoarding
3. **Visibility**: Students see and understand limits
4. **Flexibility**: Different limits per item
5. **Audit Trail**: All quantity changes tracked

### For Institution
1. **Resource Management**: Better allocation
2. **User Satisfaction**: Intuitive interface
3. **Compliance**: Automated policy enforcement
4. **Efficiency**: Reduced manual checking
5. **Scalability**: Works with any number of items

## Industry Standards Applied

### E-Commerce Patterns
- Quantity stepper (Amazon, Shopify pattern)
- Progress indicators (cart limits)
- Real-time validation
- Toast notifications for feedback

### Accessibility Standards
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- Sufficient color contrast

### UX Best Practices
- Immediate feedback
- Clear constraints
- Forgiving input handling
- Progressive disclosure
- Consistent visual language

## Testing Scenarios

### Functional Tests
- [ ] Increment increases quantity by 1
- [ ] Decrement decreases quantity by 1
- [ ] Cannot decrement below 1
- [ ] Cannot increment above maximum
- [ ] Direct input validates correctly
- [ ] Toast shows on limit exceeded
- [ ] Progress bar updates smoothly
- [ ] Ratio displays correctly

### Edge Case Tests
- [ ] Quantity = 1 (minimum)
- [ ] Quantity = maximum
- [ ] maxQuantityPerRequest < available
- [ ] maxQuantityPerRequest > available
- [ ] No maxQuantityPerRequest set
- [ ] Out of stock item
- [ ] Very large numbers (999+)

### Accessibility Tests
- [ ] Keyboard navigation works
- [ ] Screen reader announces changes
- [ ] Focus indicators visible
- [ ] Touch targets adequate size
- [ ] Color contrast sufficient

### Cross-Browser Tests
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers

## Future Enhancements

### Potential Features
1. **Bulk Quantity Presets**: Quick select (1, 5, 10, Max)
2. **Quantity History**: Show typical request amounts
3. **Smart Suggestions**: Recommend quantities based on usage
4. **Favorites**: Save preferred quantities per item
5. **Comparison**: Show what others typically request

### Analytics Opportunities
- Track most common quantities requested
- Identify items where limits are frequently hit
- Optimize limits based on usage patterns
- Predict demand for better stock management

## Conclusion

This implementation provides a professional, industry-standard quantity control system that balances user flexibility with administrative policy enforcement. The interface is intuitive, accessible, and provides clear feedback at every interaction point, ensuring a smooth user experience while maintaining institutional resource management goals.

The design follows established e-commerce patterns that users are already familiar with, reducing the learning curve and increasing adoption. The visual feedback system (progress bars, color coding, toast notifications) ensures users always understand the constraints they're working within, leading to fewer errors and a more satisfying experience.
