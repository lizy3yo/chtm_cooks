# 🚀 PWA Quick Setup - 3 Commands

## **Run These 3 Commands:**

```bash
# 1. Install sharp (for icon generation)
npm install -D sharp

# 2. Generate PWA icons
npm run pwa:generate-icons

# 3. Build and test
npm run build && npm run preview
```

## **Then:**

1. Open the preview URL (usually `http://localhost:4173`)
2. Wait 1.5 seconds
3. You should see:
   - **Desktop**: Floating "Install App" button (bottom-right)
   - **Mobile**: Toast notification (top)

## **Deploy to Vercel:**

```bash
git add .
git commit -m "Add PWA support"
git push
```

Vercel will auto-deploy with HTTPS (required for PWA).

---

## **Quick Test:**

Open browser console (F12) and look for:
```
PWA: Component mounted
PWA: Device type: desktop
PWA: Testing mode - showing UI immediately
```

---

## **If It Still Doesn't Work:**

See **[PWA-TROUBLESHOOTING.md](PWA-TROUBLESHOOTING.md)** for detailed debugging.

---

## **What You Get:**

✅ Cross-platform install (Windows, Mac, Linux, Android, iOS)  
✅ Offline support  
✅ Native app experience  
✅ Smart install prompts  
✅ Progressive cooldown (3, 7, 30 days)  
✅ Professional UI  

---

**That's it!** 🎉
