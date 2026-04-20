# Auto-Login Troubleshooting Guide

## Quick Diagnostic Checklist

### 1. Check Browser Console

Open your browser's Developer Tools (F12) and look for these log messages:

**Expected Flow (Successful Auto-Login):**
```
[AuthStore] Initializing authentication...
[AuthStore] No active session, attempting auto-login...
[AuthStore] Auto-login successful for: user@example.com
[Landing] User authenticated, redirecting to dashboard...
```

**Expected Flow (No Remember-Me Token):**
```
[AuthStore] Initializing authentication...
[AuthStore] No active session, attempting auto-login...
[AuthStore] Auto-login failed: 401
[AuthStore] No valid session or remember-me token found
```

### 2. Check Server Logs

Look for these server-side logs:

**Successful Auto-Login:**
```
[AutoLogin] ========== AUTO-LOGIN REQUEST START ==========
[AutoLogin] ✓ Valid token found
[AutoLogin] User ID: 507f1f77bcf86cd799439011
[AutoLogin] ✓ User found: user@example.com
[AutoLogin] User role: student
[AutoLogin] ✓ Token rotation successful
[AutoLogin] ✓✓✓ AUTO-LOGIN SUCCESSFUL ✓✓✓
[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========
```

**Failed Auto-Login:**
```
[AutoLogin] ========== AUTO-LOGIN REQUEST START ==========
[AutoLogin] ❌ No valid remember-me token found
[AutoLogin] ========== AUTO-LOGIN REQUEST END ==========
```

### 3. Check Cookies

In Browser DevTools → Application → Cookies → `http://localhost:5173`:

**Required Cookies:**
- `remember_me` - Should exist if "Remember Me" was checked during login
- `access_token` - Created after successful auto-login
- `refresh_token` - Created after successful auto-login

**Cookie Properties:**
- HttpOnly: ✓ (should be checked)
- Secure: ✓ in production, ✗ in development
- SameSite: Lax
- Path: /

### 4. Check Database

Connect to MongoDB and check the `remember_tokens` collection:

```javascript
// Find all tokens for a user
db.remember_tokens.find({ 
  userId: ObjectId("YOUR_USER_ID"),
  isRevoked: false,
  expiresAt: { $gt: new Date() }
})

// Check if token exists by selector
db.remember_tokens.find({ 
  selector: "YOUR_SELECTOR_FROM_COOKIE"
})
```

## Common Issues and Solutions

### Issue 1: Auto-Login Not Triggering

**Symptoms:**
- Page loads but user is not redirected
- No auto-login logs in console
- User sees landing page instead of dashboard

**Possible Causes:**

#### A. Remember-Me Cookie Not Set
**Check:** Browser DevTools → Application → Cookies
**Solution:** 
1. Clear all cookies
2. Login again with "Remember Me" checked
3. Verify `remember_me` cookie is created

#### B. Cookie Expired
**Check:** Look at cookie expiration date
**Solution:**
1. Clear expired cookie
2. Login again with "Remember Me" checked

#### C. Auth Store Not Initializing
**Check:** Console for `[AuthStore] Initializing authentication...`
**Solution:**
1. Check if `src/routes/+layout.svelte` calls `authStore.init()` in `onMount`
2. Verify no JavaScript errors are preventing execution

### Issue 2: Auto-Login Returns 401

**Symptoms:**
- Console shows: `[AuthStore] Auto-login failed: 401`
- Server logs: `[AutoLogin] ❌ No valid remember-me token found`

**Possible Causes:**

#### A. Token Not Found in Database
**Check:** 
```javascript
db.remember_tokens.find({ selector: "SELECTOR_FROM_COOKIE" })
```
**Solution:**
- Token may have been deleted or expired
- Login again with "Remember Me" checked

#### B. Token Revoked
**Check:**
```javascript
db.remember_tokens.find({ 
  selector: "SELECTOR_FROM_COOKIE",
  isRevoked: true 
})
```
**Solution:**
- Token was manually revoked (logout or password change)
- Login again with "Remember Me" checked

#### C. Token Expired
**Check:**
```javascript
db.remember_tokens.find({ 
  selector: "SELECTOR_FROM_COOKIE",
  expiresAt: { $lt: new Date() }
})
```
**Solution:**
- Token expired (default: 30 days)
- Login again with "Remember Me" checked

#### D. Invalid Token Hash
**Check:** Server logs for `[RememberMe] Validation result: { isValid: false, error: 'INVALID' }`
**Solution:**
- Token validator doesn't match stored hash
- Possible security breach - all user tokens are revoked
- Login again with "Remember Me" checked

### Issue 3: Auto-Login Returns 403

**Symptoms:**
- Console shows: `[AuthStore] Auto-login failed: 403`
- Server logs: `[AutoLogin] ❌ User account is inactive` or `❌ Student email not verified`

**Possible Causes:**

#### A. Account Deactivated
**Check:** 
```javascript
db.users.findOne({ _id: ObjectId("USER_ID") }, { isActive: 1 })
```
**Solution:**
- Contact administrator to reactivate account
- Or check why account was deactivated

#### B. Student Email Not Verified
**Check:**
```javascript
db.users.findOne({ 
  _id: ObjectId("USER_ID"),
  role: "student" 
}, { emailVerified: 1 })
```
**Solution:**
- Verify email address using verification link
- Or request new verification email

### Issue 4: Auto-Login Returns 404

**Symptoms:**
- Console shows: `[AuthStore] Auto-login failed: 404`
- Server logs: `[AutoLogin] ❌ User not found in database`

**Possible Causes:**

#### A. User Deleted
**Check:**
```javascript
db.users.findOne({ _id: ObjectId("USER_ID_FROM_TOKEN") })
```
**Solution:**
- User account was deleted
- Token is orphaned and should be cleaned up
- Clear cookies and create new account

### Issue 5: Auto-Login Returns 500

**Symptoms:**
- Console shows: `[AuthStore] Auto-login failed: 500`
- Server logs: `[AutoLogin] ❌❌❌ CRITICAL ERROR ❌❌❌`

**Possible Causes:**

#### A. Database Connection Error
**Check:** Server logs for MongoDB connection errors
**Solution:**
1. Verify MongoDB is running: `mongosh`
2. Check `MONGODB_URI` in `.env`
3. Restart application

#### B. JWT Secret Missing
**Check:** Server logs for JWT errors
**Solution:**
1. Verify `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env`
2. Restart application

#### C. Code Error
**Check:** Server logs for stack trace
**Solution:**
1. Review error message and stack trace
2. Check recent code changes
3. Report bug if needed

### Issue 6: Infinite Redirect Loop

**Symptoms:**
- Browser keeps redirecting between pages
- Console shows repeated auth initialization

**Possible Causes:**

#### A. Protected Route Without Auth
**Check:** `src/routes/(protected)/+layout.svelte`
**Solution:**
- Ensure layout waits for `$isLoading` to be false
- Ensure redirect only happens when `!$isAuthenticated`

#### B. Landing Page Redirect Logic
**Check:** `src/routes/+page.svelte`
**Solution:**
- Ensure `authCheckComplete` flag prevents multiple redirects
- Ensure redirect only happens after `!$isLoading`

### Issue 7: Token Rotation Failing

**Symptoms:**
- Server logs: `[AutoLogin] ⚠️ Token rotation failed`
- Auto-login still succeeds but token is not rotated

**Possible Causes:**

#### A. Database Write Error
**Check:** Server logs for MongoDB errors
**Solution:**
- Check database permissions
- Check disk space
- Check MongoDB logs

#### B. Token Limit Reached
**Check:**
```javascript
db.remember_tokens.countDocuments({ 
  userId: ObjectId("USER_ID"),
  isRevoked: false 
})
```
**Solution:**
- If count >= 5, oldest tokens should be auto-deleted
- Check `enforceTokenLimit` function
- Manually revoke old tokens if needed

### Issue 8: CORS Errors

**Symptoms:**
- Console shows CORS errors
- Auto-login request is blocked

**Possible Causes:**

#### A. Missing Credentials
**Check:** Network tab → Request headers
**Solution:**
- Ensure `credentials: 'include'` in fetch calls
- Check `src/lib/stores/auth.ts` fetch options

#### B. CORS Headers Not Set
**Check:** Network tab → Response headers
**Solution:**
- Verify `src/hooks.server.ts` sets CORS headers
- Check `Access-Control-Allow-Credentials: true`

### Issue 9: Cookie Not Being Set

**Symptoms:**
- Login succeeds but `remember_me` cookie not created
- Server logs show token created but cookie not in browser

**Possible Causes:**

#### A. Secure Flag in Development
**Check:** Cookie settings in DevTools
**Solution:**
- Ensure `secure: false` in development
- Check `src/lib/server/services/auth/types.ts`
- Verify `getCookieOptions(dev)` is used

#### B. SameSite Restrictions
**Check:** Browser console for cookie warnings
**Solution:**
- Ensure `sameSite: 'lax'` (not 'strict')
- Check if request is cross-origin

#### C. Path Mismatch
**Check:** Cookie path in DevTools
**Solution:**
- Ensure `path: '/'` in cookie options
- Verify cookie is accessible on all routes

### Issue 10: Multiple Sessions Not Working

**Symptoms:**
- Can't login on multiple devices
- Second login invalidates first session

**Possible Causes:**

#### A. Token Limit Too Low
**Check:** `REMEMBER_ME_DEFAULTS.MAX_SESSIONS_PER_USER`
**Solution:**
- Increase limit in `src/lib/server/services/auth/types.ts`
- Default is 5, increase if needed

#### B. Token Rotation Deleting All Tokens
**Check:** Server logs during token rotation
**Solution:**
- Verify `rotateToken` only revokes current token
- Check `rememberMeService.ts` implementation

## Advanced Debugging

### Enable Verbose Logging

Add this to your `.env`:
```bash
DEBUG=true
LOG_LEVEL=debug
```

### Monitor Database Changes

Use MongoDB change streams to watch token operations:

```javascript
const changeStream = db.remember_tokens.watch();
changeStream.on('change', (change) => {
  console.log('Token change:', change);
});
```

### Test Token Validation Manually

```javascript
// In browser console
fetch('/api/auth/auto-login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

### Check Token Structure

```javascript
// Get cookie value
const cookie = document.cookie
  .split(';')
  .find(c => c.trim().startsWith('remember_me='));

if (cookie) {
  const token = cookie.split('=')[1];
  const [selector, validator] = token.split(':');
  console.log('Selector:', selector);
  console.log('Validator length:', validator?.length);
  console.log('Expected: selector=32 chars, validator=64 chars');
}
```

### Verify Token Hash

```javascript
// In MongoDB shell
const token = db.remember_tokens.findOne({ selector: "YOUR_SELECTOR" });
console.log('Token hash:', token.tokenHash);
console.log('Hash starts with $2b$:', token.tokenHash.startsWith('$2b$'));
```

## Performance Optimization

### Reduce Auto-Login Latency

1. **Enable Database Indexes**
   ```javascript
   db.remember_tokens.getIndexes()
   // Should show indexes on selector, userId, expiresAt
   ```

2. **Optimize Token Rotation**
   - Consider disabling rotation if performance is critical
   - Or implement async rotation (don't wait for completion)

3. **Cache User Data**
   - Implement Redis caching for user lookups
   - Reduce database queries

### Monitor Performance

```javascript
// Add timing logs
console.time('auto-login');
// ... auto-login code ...
console.timeEnd('auto-login');
```

## Security Checklist

- [ ] Tokens are hashed with bcrypt (not plain text)
- [ ] Cookies have httpOnly flag
- [ ] Cookies have secure flag in production
- [ ] Cookies have sameSite='lax'
- [ ] Token rotation is enabled
- [ ] Token expiration is set (30 days max)
- [ ] Token limit per user is enforced (5 max)
- [ ] Expired tokens are auto-deleted
- [ ] Failed validations revoke all user tokens
- [ ] Device fingerprinting is enabled
- [ ] IP tracking is enabled
- [ ] HTTPS is used in production

## Getting Help

If you've tried all troubleshooting steps and auto-login still doesn't work:

1. **Collect Information:**
   - Browser console logs (full output)
   - Server logs (full output)
   - Cookie values (redact sensitive parts)
   - Database token document (redact tokenHash)
   - Environment (dev/prod, browser, OS)

2. **Create Minimal Reproduction:**
   - Clear all data
   - Login with "Remember Me"
   - Close browser
   - Reopen and document what happens

3. **Check Documentation:**
   - Review `docs/AUTO_LOGIN_SYSTEM.md`
   - Check OWASP authentication guidelines
   - Review SvelteKit cookie documentation

4. **Report Issue:**
   - Include all collected information
   - Describe expected vs actual behavior
   - Include steps to reproduce
