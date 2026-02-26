# Email Debugging Guide

## Current Status
- ✅ Verification emails work
- ❌ Password reset emails don't work

## Debugging Steps Added

### 1. Comprehensive Logging
Added detailed logging throughout the email pipeline:
- Forgot password endpoint logs each step
- Email client logs SMTP configuration and sending
- Password reset service logs template generation

### 2. Test Endpoint Created
Access: `/api/test-email`

#### Check Email Configuration
```bash
# GET request
curl http://localhost:5173/api/test-email
```

#### Test SMTP Connection
```bash
# POST request
curl -X POST http://localhost:5173/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"testType": "verify-connection"}'
```

#### Send Test Password Reset Email
```bash
# POST request (replace with your email)
curl -X POST http://localhost:5173/api/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "testType": "send-test-email",
    "email": "your-email@gmail.com",
    "firstName": "Test"
  }'
```

## How to Debug

### Step 1: Start Dev Server with Logging
```bash
npm run dev
```
Watch the console for log messages starting with:
- `[Forgot Password]`
- `[Password Reset Email]`
- `[Email Client]`

### Step 2: Test Forgot Password
1. Go to: http://localhost:5173/auth/forgot-password
2. Enter a **valid registered email**
3. Click "Send Reset Link"
4. Check the server console for detailed logs

### Step 3: What to Look For

#### If user not found:
```
[Forgot Password] User not found: email@example.com
```
→ Check your database - is the user actually registered?

#### If email config is missing:
```
[Email Client] ❌ Email configuration is incomplete
```
→ Check your `.env` file has all EMAIL_* variables

#### If SMTP connection fails:
```
[Email Client] ❌ Failed to send email
```
→ Check email credentials and Gmail app password

#### If everything works:
```
[Forgot Password] User found and active
[Forgot Password] Token generated
[Forgot Password] Database updated
[Password Reset Email] Template generated
[Email Client] ✅ Email sent successfully
```

## Common Issues & Fixes

### Issue 1: Wrong APP_URL
Your `.env` shows: `APP_URL=http://localhost:3000`
But Vite dev server runs on: `http://localhost:5173`

**Fix:**
```env
APP_URL=http://localhost:5173
```

### Issue 2: Gmail Security
Gmail blocks "less secure apps" by default.

**Fix:**
1. Enable 2-factor authentication on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password in `.env`:
```env
EMAIL_PASSWORD=your-16-char-app-password
```

### Issue 3: User Not Found
Make sure you're testing with an email that's actually registered in the database.

**Check MongoDB:**
```bash
# Connect to MongoDB
mongosh

# Use your database
use chtm_cooks

# Find user
db.users.findOne({ email: "your-test-email@gmail.com" })
```

### Issue 4: Email Logs Hidden
The forgot-password endpoint catches email errors silently for security.
Check server console logs to see the actual error.

## Next Steps

1. **Fix APP_URL in .env:**
   ```env
   APP_URL=http://localhost:5173
   ```

2. **Restart dev server:**
   ```bash
   npm run dev
   ```

3. **Test using the `/api/test-email` endpoint first**
   - This will show if basic email sending works
   - If this works, the issue is in the forgot-password flow
   - If this fails, the issue is in email configuration

4. **Check server logs carefully**
   - All steps are now logged with `[Forgot Password]` prefix
   - Look for error messages with ❌ symbol

5. **Test with registered email**
   - Make sure you're using an email that's actually in the database
   - Check `isActive` status of the user

## Testing Checklist

- [ ] `.env` file has correct `APP_URL` (http://localhost:5173)
- [ ] `.env` file has all EMAIL_* variables set
- [ ] Gmail App Password is being used (not regular password)
- [ ] Dev server is running (`npm run dev`)
- [ ] Testing with a registered, active user email
- [ ] Checking server console logs for [Forgot Password] messages
- [ ] Test endpoint `/api/test-email` works

## Expected Server Log Output (Success)

```
[Forgot Password] Request for email: test@gmail.com
[Forgot Password] User found and active: test@gmail.com
[Forgot Password] Token generated, expires: 2026-02-25T12:00:00.000Z
[Forgot Password] Database updated, matched: 1, modified: 1
[Forgot Password] Attempting to send email to: test@gmail.com
[Password Reset Email] Generating template for: test@gmail.com
[Password Reset Email] Template generated, sending email...
[Email Client] Preparing to send email to: test@gmail.com
[Email Client] Subject: Reset Your CHTM Cooks Password
[Email Client] Sending email...
[Email Client] ✅ Email sent successfully to test@gmail.com
[Email Client] Message ID: <message-id>
[Password Reset Email] ✅ Password reset email sent to: test@gmail.com
[Forgot Password] ✅ Email sent successfully to: test@gmail.com
```

If you see this, the email is working! Check your inbox (and spam folder).
