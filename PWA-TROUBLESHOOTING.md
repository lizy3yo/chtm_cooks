# PWA Installation Troubleshooting Guide

## 🚨 Can't Install PWA? Follow This Checklist

### **Step 1: Generate PWA Icons** ⚠️ **CRITICAL**

The PWA **will not work** without icons. Run this command:

```bash
# Install sharp (if not already installed)
npm install -D sharp

# Generate all PWA icons
npm run pwa:generate-icons
```

**Expected output:**
```
🎨 Generating PWA icons from CHTM_LOGO.png...

✅ Generated: favicon-16x16.png (16x16)
✅ Generated: favicon-32x32.png (32x32)
✅ Generated: pwa-64x64.png (64x64)
✅ Generated: pwa-192x192.png (192x192)
✅ Generated: pwa-512x512.png (512x512)
✅ Generated: maskable-icon-512x512.png (512x512)
✅ Generated: screenshot-wide.png (1280x720)
✅ Generated: screenshot-mobile.png (750x1334)

✨ All PWA icons generated successfully!
```

**Verify icons exist:**
```bash
ls static/pwa-*.png
```

You should see:
- `pwa-64x64.png`
- `pwa-192x192.png`
- `pwa-512x512.png`
- `maskable-icon-512x512.png`

---

### **Step 2: Build the App**

```bash
npm run build
```

This generates the service worker and manifest files.

---

### **Step 3: Test Locally (Production Mode)**

```bash
npm run preview
```

Visit `http://localhost:4173` (or the port shown)

---

### **Step 4: Check PWA Requirements**

Open **Chrome DevTools** (F12) → **Application** tab:

#### **✅ Manifest**
- Should show "CHTM Cooks - Laboratory Equipment Management"
- Icons should be visible (192x192, 512x512)
- No errors

#### **✅ Service Worker**
- Status: "activated and is running"
- No errors in console

#### **✅ Installability**
- Should show "✓ Installable" or list any issues

---

### **Step 5: Deploy to Vercel**

```bash
# Commit and push
git add .
git commit -m "Add PWA support with icons"
git push

# Vercel will auto-deploy
```

**Important:** Vercel automatically provides HTTPS, which is required for PWA.

---

## 🔍 Common Issues & Fixes

### **Issue 1: "beforeinstallprompt event not firing"**

**Causes:**
- Icons not generated
- Not on HTTPS (localhost is OK, but HTTP domains are not)
- Service worker not registered
- Already installed

**Fix:**
1. Generate icons: `npm run pwa:generate-icons`
2. Rebuild: `npm run build`
3. Clear browser data (Application → Clear storage)
4. Hard refresh (Ctrl+Shift+R)

---

### **Issue 2: "Install button doesn't appear"**

**Causes:**
- PWA already installed
- Dismissed recently (3-30 day cooldown)
- Browser doesn't support PWA (Firefox desktop)

**Fix:**
```javascript
// Open browser console and run:
localStorage.removeItem('pwa-install-dismissed');
localStorage.removeItem('pwa-dismiss-count');
// Then refresh page
```

---

### **Issue 3: "Service worker not found"**

**Cause:** App not built in production mode

**Fix:**
```bash
npm run build
npm run preview
```

Development mode (`npm run dev`) now has PWA enabled for testing, but production build is recommended.

---

### **Issue 4: "Icons not loading in manifest"**

**Cause:** Icons not in `/static` folder

**Fix:**
1. Check if icons exist: `ls static/pwa-*.png`
2. If missing, run: `npm run pwa:generate-icons`
3. Rebuild: `npm run build`

---

### **Issue 5: "Can't install on iOS"**

**iOS Requirements:**
- iOS 16.4+ for full PWA support
- Must use **Safari** (not Chrome)
- Must manually "Add to Home Screen"

**Steps:**
1. Open site in Safari
2. Tap Share button (□↑)
3. Scroll down → "Add to Home Screen"
4. Tap "Add"

---

## 🧪 Testing Checklist

### **Desktop (Chrome/Edge)**
- [ ] Visit site on HTTPS (Vercel URL)
- [ ] Wait 1.5 seconds
- [ ] Floating "Install App" button appears (bottom-right)
- [ ] Click button → Native install prompt shows
- [ ] Click "Install" → App installs
- [ ] App appears in Start Menu/Applications
- [ ] App opens in standalone window

### **Mobile (Android)**
- [ ] Visit site on HTTPS
- [ ] Wait 1.5 seconds
- [ ] Toast notification appears at top
- [ ] Tap "Install" → Native prompt shows
- [ ] Tap "Install" → App installs
- [ ] Icon appears on home screen
- [ ] App opens fullscreen

### **Mobile (iOS)**
- [ ] Visit site in Safari
- [ ] Toast shows instructions
- [ ] Tap Share → "Add to Home Screen"
- [ ] App installs
- [ ] Icon appears on home screen

---

## 📊 Debugging Commands

### **Check if icons exist:**
```bash
ls -lh static/pwa-*.png
```

### **Check manifest in browser:**
```
Chrome DevTools → Application → Manifest
```

### **Check service worker:**
```
Chrome DevTools → Application → Service Workers
```

### **Check console for errors:**
```
Chrome DevTools → Console
```

Look for messages starting with `PWA:`

### **Force service worker update:**
```javascript
// In browser console:
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(reg => reg.unregister());
});
// Then hard refresh
```

---

## 🎯 Production Deployment Checklist

Before deploying to production:

- [ ] Icons generated (`npm run pwa:generate-icons`)
- [ ] App builds without errors (`npm run build`)
- [ ] Manifest valid (check DevTools)
- [ ] Service worker registers (check DevTools)
- [ ] Install prompt shows on desktop
- [ ] Install prompt shows on mobile
- [ ] App installs successfully
- [ ] App works offline (test by going offline)
- [ ] Icons display correctly when installed

---

## 🆘 Still Not Working?

### **1. Check Browser Console**

Look for errors or warnings. Common messages:

```
PWA: Component mounted
PWA: Device type: desktop
PWA: beforeinstallprompt event fired
PWA: Showing prompt for desktop
```

### **2. Check Network Tab**

Verify these files load:
- `/manifest.webmanifest` (200 OK)
- `/pwa-192x192.png` (200 OK)
- `/pwa-512x512.png` (200 OK)
- Service worker file (200 OK)

### **3. Check Application Tab**

- **Manifest:** Should show app name and icons
- **Service Workers:** Should show "activated"
- **Storage:** Should show cache entries

### **4. Try Incognito Mode**

Sometimes browser extensions block PWA features. Test in incognito/private mode.

### **5. Clear Everything**

```
Chrome DevTools → Application → Clear storage → Clear site data
```

Then hard refresh (Ctrl+Shift+R)

---

## 📱 Browser Support

| Browser | Desktop Install | Mobile Install | Notes |
|---------|----------------|----------------|-------|
| Chrome | ✅ | ✅ | Full support |
| Edge | ✅ | ✅ | Best Windows integration |
| Safari | ✅ (macOS 17+) | ✅ (iOS 16.4+) | Manual install only |
| Firefox | ❌ | ✅ (Android) | Desktop doesn't support install |
| Samsung Internet | N/A | ✅ | Full support |

---

## 🔗 Useful Links

- **Test PWA:** https://www.pwabuilder.com/
- **Manifest Validator:** https://manifest-validator.appspot.com/
- **Lighthouse:** Chrome DevTools → Lighthouse → PWA audit

---

## ✅ Success Indicators

You'll know it's working when:

1. **Console shows:**
   ```
   PWA: beforeinstallprompt event fired
   PWA: Showing prompt for desktop
   ```

2. **DevTools shows:**
   - Manifest: Valid with icons
   - Service Worker: Activated
   - Installability: ✓ Installable

3. **UI shows:**
   - Desktop: Floating button bottom-right
   - Mobile: Toast notification at top

4. **Browser shows:**
   - Install icon in address bar (⊕)
   - Or native install banner

---

**Last Updated:** April 29, 2026  
**Version:** 1.0.0
