# PWA Setup Guide - CHTM Cooks

## Overview

CHTM Cooks is now a **Progressive Web App (PWA)**, providing native app-like experiences across all platforms:

- ✅ **Desktop**: Windows, macOS, Linux (Chrome, Edge, Safari)
- ✅ **Mobile**: Android, iOS/iPadOS (Chrome, Safari)
- ✅ **Offline Support**: Core features work without internet
- ✅ **Push Notifications**: Due date reminders and request updates
- ✅ **Install Prompts**: Smart, non-intrusive installation prompts

---

## Quick Start

### 1. Generate PWA Icons

First, install the required dependency:

```bash
npm install -D sharp
```

Then generate all PWA icons from the CHTM_LOGO.png:

```bash
npm run pwa:generate-icons
```

**What this does:**
- Automatically removes black/dark backgrounds from the source logo
- Creates transparent PNG icons (prevents black boxes on mobile splash screens)
- Generates maskable icons with proper safe zones for Android
- Follows PWA industry standards for optimal display

This creates:
- `favicon-16x16.png` & `favicon-32x32.png` - Browser favicons
- `pwa-64x64.png` - Small app icon (transparent background)
- `pwa-192x192.png` - Standard app icon (transparent background)
- `pwa-512x512.png` - Large app icon (transparent background)
- `maskable-icon-512x512.png` - Adaptive icon for Android (white background with 10% safe zone)
- `screenshot-wide.png` - Desktop screenshot (placeholder)
- `screenshot-mobile.png` - Mobile screenshot (placeholder)

**Note:** The script intelligently removes black backgrounds from your logo to ensure proper splash screen display on mobile devices.

### 2. Replace Placeholder Screenshots

The script generates placeholder screenshots. Replace them with real ones:

1. Take a screenshot of your dashboard at **1280x720** (desktop)
2. Take a screenshot of your mobile view at **750x1334** (mobile)
3. Save them as `static/screenshot-wide.png` and `static/screenshot-mobile.png`

### 3. Build & Deploy

```bash
npm run build
```

Deploy to your hosting provider with HTTPS enabled (required for PWA).

---

## Features

### 🎯 Smart Install Prompts

The PWA automatically shows install prompts:
- **Desktop**: After 3 seconds of engagement
- **Mobile**: After 5 seconds of engagement
- **iOS**: Custom instructions for Safari "Add to Home Screen"
- **Dismissible**: Users can dismiss and won't see it again for 7 days

### 📱 Platform-Specific Behavior

#### **Android (Chrome/Edge/Samsung Internet)**
- Native install banner
- Fullscreen mode
- Splash screen with CHTM branding
- Push notifications (when implemented)

#### **iOS/iPadOS (Safari)**
- Custom install instructions
- Add to Home Screen via Share menu
- Fullscreen mode
- Push notifications (iOS 16.4+, when installed)

#### **Desktop (Windows/Mac/Linux)**
- Install icon in address bar
- Standalone window (no browser UI)
- Appears in Start Menu/Applications
- Taskbar/Dock integration

### 🔄 Offline Support

The service worker caches:
- ✅ All app assets (JS, CSS, images)
- ✅ Google Fonts
- ✅ Lottie animations
- ✅ API responses (5-minute cache)

**Offline Capabilities:**
- Browse cached catalog items
- View active requests
- Check Trust Score
- View QR codes (once generated)

**Requires Connection:**
- Real-time inventory updates
- Submitting new requests
- QR code scanning
- Live notifications

### 🎨 Branding

The PWA uses your CHTM branding:
- **Theme Color**: `#e91e63` (Pink)
- **Background**: `#ffffff` (White)
- **Icons**: Generated from `CHTM_LOGO.png`
- **Name**: "CHTM Cooks"
- **Short Name**: "CHTM Cooks"

---

## Configuration

### Manifest (`vite.config.ts`)

The PWA manifest is configured in `vite.config.ts` using `@vite-pwa/sveltekit`:

```typescript
manifest: {
  short_name: 'CHTM Cooks',
  name: 'CHTM Cooks - Laboratory Equipment Management',
  description: 'Professional laboratory equipment management system...',
  theme_color: '#e91e63',
  background_color: '#ffffff',
  display: 'standalone',
  // ... icons, screenshots, etc.
}
```

### Service Worker (`src/service-worker.ts`)

Custom service worker with:
- **Cache-first** for static assets
- **Network-first** for API calls
- **Stale-while-revalidate** for fonts/animations
- Automatic cache cleanup on updates

### Caching Strategy

| Resource Type | Strategy | Cache Duration |
|--------------|----------|----------------|
| App Assets | Cache First | Until version change |
| Google Fonts | Cache First | 1 year |
| Lottie Animations | Cache First | 30 days |
| API Responses | Network First | 5 minutes |

---

## Testing

### Local Testing

1. Build the app:
   ```bash
   npm run build
   ```

2. Preview with HTTPS (required for PWA):
   ```bash
   npm run preview
   ```

3. Open Chrome DevTools → Application → Manifest
4. Check "Service Workers" and "Cache Storage"

### Desktop Testing

**Chrome/Edge:**
1. Visit your site
2. Look for install icon in address bar (⊕)
3. Click to install
4. App opens in standalone window

**Safari (macOS):**
1. Visit your site
2. File → Add to Dock
3. App appears in Launchpad

### Mobile Testing

**Android:**
1. Visit your site in Chrome
2. Tap "Add to Home Screen" banner
3. Or: Menu → Add to Home Screen

**iOS:**
1. Visit your site in Safari
2. Tap Share button
3. Scroll down → "Add to Home Screen"
4. Confirm

---

## Troubleshooting

### Install Prompt Not Showing

**Checklist:**
- ✅ Site served over HTTPS
- ✅ Valid manifest.json
- ✅ Service worker registered
- ✅ User hasn't dismissed recently (check localStorage)
- ✅ Not already installed

**Debug:**
```javascript
// Check if already installed
console.log(window.matchMedia('(display-mode: standalone)').matches);

// Check localStorage
console.log(localStorage.getItem('pwa-install-dismissed'));
```

### Service Worker Not Updating

Force update:
1. Chrome DevTools → Application → Service Workers
2. Check "Update on reload"
3. Click "Unregister" → Refresh

### Icons Not Showing

1. Verify icons exist in `/static` folder
2. Check manifest in DevTools → Application → Manifest
3. Clear cache and hard reload (Ctrl+Shift+R)

### Black Background on Mobile Splash Screen

**Problem:** Logo appears with black box on mobile splash screen

**Solution:**
1. Run `npm run pwa:generate-icons` to regenerate icons with transparent backgrounds
2. The script automatically removes black/dark backgrounds from the source logo
3. Clear browser cache and reinstall the PWA
4. Verify `background_color` in manifest is set to `#ffffff` (white)

**Technical Details:**
- Mobile splash screens combine the icon with the manifest's `background_color`
- Icons must have transparent backgrounds (not black)
- The generation script removes dark pixels (RGB < 30) and makes them transparent
- Maskable icons use white backgrounds with 10% safe zones (Android standard)

### iOS Push Notifications Not Working

Requirements:
- iOS 16.4 or later
- PWA must be installed (added to home screen)
- User must grant notification permission
- Only works in Safari (not Chrome on iOS)

---

## Deployment Checklist

Before deploying to production:

- [ ] Run `npm run pwa:generate-icons`
- [ ] Replace placeholder screenshots with real ones
- [ ] Test install on desktop (Chrome/Edge)
- [ ] Test install on Android (Chrome)
- [ ] Test install on iOS (Safari)
- [ ] Verify offline functionality
- [ ] Check manifest in DevTools
- [ ] Ensure HTTPS is enabled
- [ ] Test service worker updates
- [ ] Verify icons display correctly
- [ ] Test on slow 3G connection

---

## Browser Support

| Platform | Browser | Install | Offline | Push Notifications |
|----------|---------|---------|---------|-------------------|
| **Windows** | Chrome 90+ | ✅ | ✅ | ✅ |
| **Windows** | Edge 90+ | ✅ | ✅ | ✅ |
| **macOS** | Chrome 90+ | ✅ | ✅ | ✅ |
| **macOS** | Safari 17+ | ✅ | ✅ | ✅ |
| **Linux** | Chrome 90+ | ✅ | ✅ | ✅ |
| **Android** | Chrome 90+ | ✅ | ✅ | ✅ |
| **Android** | Samsung Internet | ✅ | ✅ | ✅ |
| **iOS/iPadOS** | Safari 16.4+ | ✅ | ✅ | ✅ (when installed) |
| **iOS** | Chrome | ❌ | ✅ | ❌ |

---

## Advanced Configuration

### Custom Install Button

Add a manual install button anywhere in your app:

```svelte
<script>
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
</script>

<button on:click={handleInstall}>Install App</button>
```

### Disable Install Prompt

To disable the automatic install prompt:

```javascript
// In src/routes/+layout.svelte
// Remove or comment out:
// <PWAInstallPrompt />
```

### Update Service Worker

When you deploy updates, the service worker automatically:
1. Downloads new assets in background
2. Waits for all tabs to close
3. Activates new version on next visit

To force immediate update:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(reg => {
    reg.update(); // Force check for updates
  });
}
```

---

## Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app/)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

## Support

For issues or questions:
1. Check this guide first
2. Review browser console for errors
3. Test in Chrome DevTools → Application tab
4. Verify HTTPS is enabled

**Common Issues:**
- "Install prompt not showing" → Check HTTPS and manifest
- "Icons not loading" → Run `npm run pwa:generate-icons`
- "Service worker not updating" → Hard refresh (Ctrl+Shift+R)
- "iOS install not working" → Must use Safari, not Chrome

---

**Last Updated:** April 2026  
**Version:** 1.0.0
