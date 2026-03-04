# Cloudinary Setup Guide
## Professional Image Storage for CHTM Cooks Inventory System

This guide will walk you through setting up Cloudinary for enterprise-grade image storage with automatic optimization.

---

## Why Cloudinary?

✅ **FREE Tier Benefits:**
- 25GB storage (vs 10GB on other platforms)
- 25GB bandwidth per month
- 25,000 transformations/month
- **No credit card required for free tier**

✅ **Enterprise Features:**
- Automatic image optimization
- CDN delivery worldwide
- On-the-fly transformations
- WebP/AVIF format conversion
- Responsive images
- Built-in backup and redundancy

✅ **Developer-Friendly:**
- Industry-standard API
- Comprehensive documentation
- Used by Netflix, Airbnb, and other major companies

---

## Step-by-Step Setup

### 1. Create Cloudinary Account

1. Go to **https://cloudinary.com/**
2. Click **"Sign Up for Free"**
3. Choose one of these options:
   - Sign up with email
   - Sign in with Google
   - Sign in with GitHub

**Note:** Free tier does NOT require a credit card!

---

### 2. Get Your API Credentials

After signing up, you'll be redirected to your **Dashboard**.

**You'll see these credentials:**

```
Cloud Name: xxxxxxxx
API Key: 123456789012345
API Secret: xXxXxXxXxXxXxXxXxXxXxXxXx
```

**Important:** Keep your API Secret private! Never commit it to git.

---

### 3. Configure Environment Variables

Open your `.env` file and add:

```bash
# Storage Configuration
STORAGE_PROVIDER=cloudinary

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name-here
CLOUDINARY_API_KEY=your-api-key-here
CLOUDINARY_API_SECRET=your-api-secret-here
CLOUDINARY_FOLDER=inventory
```

**Replace these values:**
- `your-cloud-name-here` → Your Cloud Name from dashboard
- `your-api-key-here` → Your API Key from dashboard
- `your-api-secret-here` → Your API Secret from dashboard

**Example:**
```bash
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=dkxyz123
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdef1234567890ABCDEF
CLOUDINARY_FOLDER=inventory
```

---

### 4. Restart Your Development Server

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

**Look for this log message:**
```
[info] Cloudinary provider initialized { cloudName: 'your-cloud-name' }
```

If you see `falling back to local storage`, check your environment variables.

---

## Testing Your Setup

### Test Image Upload

1. Navigate to: **Custodian Dashboard** → **Inventory**
2. Click **"Add New Item"** or **"Edit Item"**
3. Click **"Upload Image"** button
4. Select an image (JPEG, PNG, or WebP)
5. Image will upload to Cloudinary

### Verify in Cloudinary Dashboard

1. Go to **https://cloudinary.com/console**
2. Click **"Media Library"** in left sidebar
3. Look for **"inventory"** folder
4. Your uploaded images should appear there

---

## Features Included

### ✅ Automatic Optimization

Your images are automatically optimized:
- **Quality:** `auto:good` (reduces file size by 30-50% without visible quality loss)
- **Format:** Automatic WebP/AVIF for supported browsers
- **Compression:** Intelligent compression based on content

**Example:**
- Original: 2.5MB JPEG
- Cloudinary delivers: 400KB WebP
- **83% reduction in file size!**

### ✅ CDN Delivery

All images are delivered through Cloudinary's global CDN:
- 🌍 Multiple edge locations worldwide
- ⚡ Fast loading times (typically <100ms)
- 🔒 HTTPS by default

### ✅ Automatic Fallback

If Cloudinary is unavailable:
- System automatically falls back to local storage
- No manual intervention needed
- Upload continues to work

---

## Folder Structure

Your images are organized in Cloudinary:

```
cloudinary.com/your-cloud-name/
└── inventory/
    ├── abc123def456.jpg
    ├── xyz789uvw012.png
    └── qrs345tuv678.webp
```

**Benefits:**
- ✅ Organized by purpose (inventory items)
- ✅ Easy to manage in dashboard
- ✅ Can apply folder-level settings

---

## Understanding Your Free Tier Limits

| Resource | Free Tier | Typical Usage | Notes |
|----------|-----------|---------------|-------|
| **Storage** | 25GB | ~10,000 optimized images | Very hard to exceed |
| **Bandwidth** | 25GB/month | ~125,000 image views/month | Resets monthly |
| **Transformations** | 25,000/month | Automatic optimization | Per unique URL |

**For your inventory system:**
- 📦 If each item has 1 image (500KB average)
- 📊 25GB = ~50,000 items
- 🎯 You'll likely never exceed this for inventory

---

## Advanced Configuration (Optional)

### Custom Transformations

You can customize image transformations in `cloudinaryProvider.ts`:

```typescript
transformation: [
  {
    quality: 'auto:best',      // Higher quality
    fetch_format: 'auto',      // Automatic format
    width: 800,                // Max width
    height: 800,               // Max height
    crop: 'limit'              // Don't upscale
  }
]
```

### Custom CDN Domain (Paid Feature)

For production, you can use your own domain:

```bash
# In .env
CLOUDINARY_CNAME=images.chtmcooks.com
```

---

## Troubleshooting

### Issue: "Cloudinary not configured, falling back to local storage"

**Solution:**
1. Check `.env` file exists and has correct variables
2. Verify credentials are correct (copy-paste from dashboard)
3. Restart development server
4. Check logs for specific error messages

### Issue: Upload fails with 401 Unauthorized

**Solution:**
- API Secret is incorrect
- Go to Cloudinary Dashboard → Settings → Access Keys
- Regenerate API Secret if needed
- Update `.env` file

### Issue: Images not appearing in Cloudinary dashboard

**Solution:**
- Check folder is set to `inventory` in `.env`
- Look in "Media Library" → "Folders" → "inventory"
- Images might be in root folder if `CLOUDINARY_FOLDER` not set

### Issue: Upload succeeds but shows local URL

**Solution:**
- This is the fallback behavior
- Check Cloudinary credentials
- Verify `STORAGE_PROVIDER=cloudinary` in `.env`

---

## Security Best Practices

### ✅ DO:
- Keep API Secret in `.env` file (never commit)
- Add `.env` to `.gitignore`
- Use environment variables for production
- Rotate API keys periodically

### ❌ DON'T:
- Commit API credentials to git
- Share API Secret publicly
- Use development credentials in production
- Hard-code credentials in source files

---

## Monitoring Usage

### Check Your Usage:

1. Go to **https://cloudinary.com/console**
2. Click **"Dashboard"** (home icon)
3. View usage metrics:
   - Storage used
   - Bandwidth used
   - Transformations used

### Set Up Alerts (Recommended):

1. Go to **Settings** → **Notifications**
2. Enable email alerts at:
   - 75% of storage limit
   - 75% of bandwidth limit
3. Never worry about surprise overages

---

## Migration from Local Storage

If you have existing images in `static/uploads/inventory`:

### Option 1: Manual Upload
1. Go to Cloudinary dashboard
2. Click "Media Library" → "Upload"
3. Drag and drop existing images
4. Images will be available at new URLs

### Option 2: Keep Both (Recommended)
- Existing images: Use local URLs
- New images: Automatically use Cloudinary
- No migration needed!

---

## Production Deployment

### Environment Variables for Production:

```bash
# Production .env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=your-production-cloud-name
CLOUDINARY_API_KEY=your-production-api-key
CLOUDINARY_API_SECRET=your-production-api-secret
CLOUDINARY_FOLDER=production/inventory
```

**Recommendation:** Use separate Cloudinary accounts for development and production.

---

## Support Resources

### Official Documentation:
- **Getting Started:** https://cloudinary.com/documentation
- **Node.js SDK:** https://cloudinary.com/documentation/node_integration
- **Upload API:** https://cloudinary.com/documentation/image_upload_api_reference

### Community:
- **Support:** support@cloudinary.com
- **Community Forum:** https://community.cloudinary.com/
- **Status Page:** https://status.cloudinary.com/

### This Project:
- Check logs in terminal for detailed error messages
- All storage operations are logged with context
- Health check available at service level

---

## Summary

🎉 **You're all set!**

**What you get:**
✅ Professional image storage  
✅ Automatic optimization (30-80% size reduction)  
✅ Global CDN delivery  
✅ 25GB free storage (no credit card)  
✅ Automatic fallback to local storage  
✅ Enterprise-grade reliability  

**Next steps:**
1. Add credentials to `.env`
2. Restart server
3. Upload your first image!

---

**Questions or issues?** Check the troubleshooting section above or review the server logs for detailed error messages.
