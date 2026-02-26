# Toast Notification System

A professional, global toast notification system for displaying success, error, warning, and info messages.

## Features

- ✅ Global toast notifications (top-right positioning)
- ✅ Auto-dismiss with configurable duration
- ✅ Manual dismiss option
- ✅ Multiple toast types (success, error, warning, info)
- ✅ Smooth animations (slide in from top, fade out)
- ✅ Responsive design (mobile-friendly)
- ✅ Accessibility compliant (ARIA labels, keyboard navigation)
- ✅ Industry-standard design (clean, professional)

## Usage

### Basic Usage

```typescript
import { toastStore } from '$lib/stores/toast';

// Success toast
toastStore.success('Operation completed successfully!', 'Success');

// Error toast
toastStore.error('Something went wrong.', 'Error');

// Warning toast
toastStore.warning('Please review your input.', 'Warning');

// Info toast
toastStore.info('New updates available.', 'Info');
```

### Advanced Usage

```typescript
// Custom duration (in milliseconds)
toastStore.success('Saved!', 'Success', 3000); // 3 seconds

// No auto-dismiss (duration = 0)
toastStore.error('Critical error!', 'Error', 0);

// Manual control
const toastId = toastStore.add({
  type: 'info',
  message: 'Processing...',
  title: 'Please Wait',
  duration: 0,
  dismissible: false
});

// Later, dismiss manually
toastStore.dismiss(toastId);

// Dismiss all toasts
toastStore.dismissAll();
```

## Implementation Details

### Files

- `src/lib/stores/toast.ts` - Toast store (state management)
- `src/lib/components/ui/Toast.svelte` - Individual toast component
- `src/lib/components/ui/ToastContainer.svelte` - Container for all toasts
- `src/routes/+layout.svelte` - Global layout (includes ToastContainer)

### Toast Types

| Type    | Color  | Use Case                          |
|---------|--------|-----------------------------------|
| success | Green  | Successful operations             |
| error   | Red    | Errors, failures                  |
| warning | Yellow | Warnings, cautions                |
| info    | Blue   | Informational messages            |

### Default Settings

- Duration: 5000ms (5 seconds)
- Dismissible: true
- Position: Top-right
- Max width: 384px (24rem)

## Examples in the App

### Login Success
```typescript
toastStore.success('Welcome back! Redirecting to your dashboard...', 'Login Successful');
```

### Registration Success
```typescript
toastStore.success('Your account has been created successfully! Redirecting...', 'Registration Successful');
```

### Logout
```typescript
toastStore.success('You have been logged out successfully.', 'Logged Out');
```

### Error Handling
```typescript
try {
  await someOperation();
} catch (error) {
  toastStore.error(error.message, 'Operation Failed');
}
```

## Responsive Design

The toast system is fully responsive:
- Desktop: Fixed top-right, 384px max width
- Tablet: Adapts to screen size
- Mobile: Full width with padding, stacks vertically

## Accessibility

- ARIA live regions for screen readers
- Keyboard navigation support
- Focus management
- Semantic HTML
- Color contrast compliance

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)
