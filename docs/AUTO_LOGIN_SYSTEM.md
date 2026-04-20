# Auto-Login System Documentation

## Overview

The CHTM Cooks application implements an industry-standard auto-login system using secure, httpOnly cookies and remember-me tokens. This system allows users to remain logged in across browser sessions without compromising security.

## Architecture

### Components

1. **Frontend (Client-Side)**
   - `src/lib/stores/auth.ts` - Authentication state management
   - `src/routes/+layout.svelte` - Initializes auth on app load
   - `src/routes/auth/login/+page.svelte` - Login form with "Remember Me" option

2. **Backend (Server-Side)**
   - `src/routes/api/auth/auto-login/+server.ts` - Auto-login endpoint
   - `src/routes/api/auth/login/+server.ts` - Login endpoint (creates remember-me token)
   - `src/lib/server/middleware/auth/rememberMe.ts` - Remember-me middleware
   - `src/lib/server/services/auth/rememberMeService.ts` - Token management service

### Security Features

#### 1. Token Structure
- Uses "selector:validator" pattern (OWASP recommended)
- **Selector**: 16 bytes (32 hex chars) - for database lookup (not secret)
- **Validator**: 32 bytes (64 hex chars) - the secret part (hashed with bcrypt)
- Only the hashed validator is stored in the database

#### 2. Cookie Security
- **httpOnly**: Prevents JavaScript access (XSS protection)
- **secure**: HTTPS only in production
- **sameSite: 'lax'**: CSRF protection
- **path: '/'**: Available across entire application
- **maxAge**: 30 days (configurable)

#### 3. Token Rotation
- After each successful auto-login, the token is rotated
- Old token is revoked, new token is issued
- Prevents token replay attacks
- Adds forward secrecy

#### 4. Device Fingerprinting
- Tracks User-Agent for device identification
- Stores IP address for anomaly detection
- Allows users to view and revoke sessions per device

#### 5. Token Limits
- Maximum 5 active sessions per user (configurable)
- Oldest tokens are automatically removed when limit is exceeded
- Prevents unlimited token accumulation

#### 6. Automatic Cleanup
- Expired tokens are automatically deleted (MongoDB TTL index)
- Revoked tokens older than 30 days are cleaned up
- Prevents database bloat

## Authentication Flow

### Initial Login (with "Remember Me")

```
1. User submits login form with rememberMe=true
2. Server validates credentials
3. Server generates access token (15min) and refresh token (7 days)
4. Server creates remember-me token (30 days)
   - Generates selector:validator pair
   - Hashes validator with bcrypt
   - Stores in database with device info
5. Server sets three httpOnly cookies:
   - access_token (15 minutes)
   - refresh_token (7 days)
   - remember_me (30 days)
6. Client stores user data in auth store
7. Client redirects to dashboard
```

### Auto-Login on Page Load

```
1. App loads, +layout.svelte calls authStore.init()
2. Auth store checks for active session:
   a. Calls /api/auth/me (checks access token)
   b. If valid → User is authenticated ✓
   c. If 401 → Continue to step 3
3. Auth store attempts auto-login:
   a. Calls /api/auth/auto-login (POST)
   b. Server reads remember_me cookie
   c. Server validates token:
      - Looks up by selector
      - Verifies hashed validator
      - Checks expiration
      - Validates device info
   d. If valid:
      - Generates new access/refresh tokens
      - Rotates remember-me token (new token issued)
      - Returns user data
      - User is authenticated ✓
   e. If invalid:
      - Clears remember_me cookie
      - User must login manually
4. If both fail → User sees login page
```

### Token Refresh (Access Token Expired)

```
1. API request returns 401 (access token expired)
2. Client calls /api/auth/refresh (POST)
3. Server validates refresh token cookie
4. If valid:
   - Generates new access token
   - Sets new access_token cookie
   - Request is retried
5. If invalid:
   - User is logged out
   - Redirected to login page
```

### Logout

```
1. User clicks logout
2. Client calls /api/auth/logout (POST)
3. Server:
   - Revokes remember-me token in database
   - Clears all auth cookies
4. Client clears auth store
5. User redirected to login page
```

### Logout from All Devices

```
1. User clicks "Logout from all devices"
2. Client calls /api/auth/logout (DELETE)
3. Server:
   - Revokes ALL remember-me tokens for user
   - Clears current session cookies
4. Client clears auth store
5. All other devices will be logged out on next request
```

## Configuration

### Environment Variables

```bash
# JWT Secrets
JWT_ACCESS_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-secret-here

# Token Expiration (in code)
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
REMEMBER_ME_EXPIRY=30d
```

### Constants (Configurable)

In `src/lib/server/services/auth/types.ts`:

```typescript
export const REMEMBER_ME_DEFAULTS = {
  COOKIE_NAME: 'remember_me',
  EXPIRY_DAYS: 30,
  MAX_SESSIONS_PER_USER: 5,
  TOKEN_LENGTH: 32,
  CLEANUP_INTERVAL_HOURS: 24
};
```

## Database Schema

### remember_tokens Collection

```typescript
{
  _id: ObjectId,
  userId: ObjectId,              // Reference to users collection
  tokenHash: string,             // Bcrypt hash of validator
  selector: string,              // For lookup (indexed)
  deviceFingerprint?: string,    // SHA-256 of User-Agent
  deviceName?: string,           // Human-readable device name
  ipAddress?: string,            // IP at token creation
  lastUsedIp?: string,          // IP at last use
  expiresAt: Date,              // Token expiration (indexed, TTL)
  createdAt: Date,              // Token creation time
  lastUsedAt: Date,             // Last successful validation
  isRevoked: boolean,           // Manual revocation flag (indexed)
  revokedReason?: string,       // Why token was revoked
  revokedAt?: Date              // When token was revoked
}
```

### Indexes

```javascript
// Critical for token lookup
{ selector: 1, isRevoked: 1 }

// For listing user sessions
{ userId: 1, isRevoked: 1, expiresAt: 1 }

// TTL index for automatic cleanup
{ expiresAt: 1 } with expireAfterSeconds: 0

// Cleanup revoked tokens
{ isRevoked: 1, revokedAt: 1 } (partial index)
```

## Security Considerations

### Threats Mitigated

1. **XSS Attacks**: httpOnly cookies prevent JavaScript access
2. **CSRF Attacks**: sameSite='lax' + token validation
3. **Token Theft**: Tokens are hashed, useless if database is compromised
4. **Replay Attacks**: Token rotation prevents reuse
5. **Session Hijacking**: Device fingerprinting detects anomalies
6. **Brute Force**: Bcrypt hashing makes token guessing infeasible

### Best Practices Implemented

- ✅ Tokens are cryptographically random (crypto.randomBytes)
- ✅ Tokens are hashed before storage (bcrypt)
- ✅ Tokens have expiration dates
- ✅ Tokens can be revoked individually or in bulk
- ✅ Token rotation on each use
- ✅ Device tracking for anomaly detection
- ✅ Automatic cleanup of expired tokens
- ✅ Rate limiting on login endpoints
- ✅ Secure cookie attributes (httpOnly, secure, sameSite)
- ✅ Proper error handling (no information leakage)

### Potential Improvements

1. **IP-based Anomaly Detection**: Alert user if token is used from different IP
2. **Geolocation Tracking**: Show login locations in session management
3. **Email Notifications**: Notify user of new device logins
4. **Suspicious Activity Detection**: Lock account after multiple failed validations
5. **Token Binding**: Bind tokens to TLS session for extra security

## Troubleshooting

### Auto-Login Not Working

1. **Check Browser Console**
   ```
   [AuthStore] Initializing authentication...
   [AuthStore] No active session, attempting auto-login...
   [AutoLogin] Attempting auto-login...
   ```

2. **Check Server Logs**
   ```
   [AutoLogin] Valid token found for user: <userId>
   [AutoLogin] User found: <email>
   [AutoLogin] Token rotation successful
   ```

3. **Common Issues**
   - Cookie not being set (check cookie settings)
   - Token expired (check expiration date)
   - Token revoked (check isRevoked flag)
   - Database connection issues
   - CORS issues (credentials not included)

### Debugging Commands

```javascript
// Check if remember_me cookie exists (Browser Console)
document.cookie.split(';').find(c => c.includes('remember_me'))

// Check token in database (MongoDB Shell)
db.remember_tokens.find({ userId: ObjectId("...") })

// Check token expiration
db.remember_tokens.find({ 
  userId: ObjectId("..."),
  expiresAt: { $gt: new Date() },
  isRevoked: false 
})
```

## API Reference

### POST /api/auth/auto-login

Attempts to automatically log in a user using their remember-me cookie.

**Request**
- Method: POST
- Headers: None required (cookie is sent automatically)
- Body: None

**Response (Success - 200)**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "email": "string",
    "role": "student|instructor|custodian|superadmin",
    "firstName": "string",
    "lastName": "string",
    "isActive": true,
    "createdAt": "ISO8601",
    "yearLevel": "string",
    "block": "string",
    "agreedToTerms": true
  }
}
```

**Response (Failure - 401)**
```json
{
  "error": "No valid remember-me token found"
}
```

**Response (Failure - 403)**
```json
{
  "error": "Account is deactivated"
}
// or
{
  "error": "Email not verified"
}
```

**Response (Failure - 404)**
```json
{
  "error": "User not found"
}
```

**Response (Failure - 500)**
```json
{
  "error": "Auto-login failed"
}
```

### GET /api/auth/sessions

Get all active sessions for the current user.

**Response (Success - 200)**
```json
{
  "sessions": [
    {
      "id": "string",
      "deviceName": "string",
      "ipAddress": "string",
      "lastUsedAt": "ISO8601",
      "createdAt": "ISO8601",
      "isCurrent": true
    }
  ]
}
```

### DELETE /api/auth/sessions

Revoke a specific session.

**Request**
```json
{
  "sessionId": "string"
}
```

**Response (Success - 200)**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

## Testing

### Manual Testing

1. **Test Remember Me**
   - Login with "Remember Me" checked
   - Close browser completely
   - Reopen browser and navigate to app
   - Should be automatically logged in

2. **Test Token Expiration**
   - Set EXPIRY_DAYS to 0.001 (1.44 minutes)
   - Login with "Remember Me"
   - Wait 2 minutes
   - Refresh page
   - Should require login

3. **Test Token Rotation**
   - Login with "Remember Me"
   - Check remember_tokens collection (note tokenHash)
   - Refresh page (triggers auto-login)
   - Check remember_tokens collection again
   - tokenHash should be different

4. **Test Logout**
   - Login with "Remember Me"
   - Logout
   - Refresh page
   - Should require login

5. **Test Logout from All Devices**
   - Login on multiple browsers/devices
   - Click "Logout from all devices" on one
   - Refresh on other devices
   - All should require login

### Automated Testing

```typescript
// Example test (using Vitest)
describe('Auto-Login', () => {
  it('should auto-login with valid remember-me token', async () => {
    // Create user and token
    const user = await createTestUser();
    const token = await rememberMeService.createToken({
      userId: user._id.toString(),
      userAgent: 'Test Browser',
      ipAddress: '127.0.0.1'
    });
    
    // Make request with cookie
    const response = await fetch('/api/auth/auto-login', {
      method: 'POST',
      headers: {
        Cookie: `remember_me=${token.plainToken}`
      }
    });
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.email).toBe(user.email);
  });
});
```

## Monitoring

### Metrics to Track

1. **Auto-Login Success Rate**: % of auto-login attempts that succeed
2. **Token Rotation Failures**: Number of failed token rotations
3. **Expired Tokens**: Number of tokens that expired naturally
4. **Revoked Tokens**: Number of tokens revoked by users
5. **Average Session Duration**: Time between token creation and expiration/revocation
6. **Active Sessions per User**: Distribution of session counts

### Logging

All auto-login operations are logged with the following format:

```
[AutoLogin] <message>
[RememberMe] <message>
```

Key log points:
- Token validation attempts
- Token rotation events
- Token revocation events
- Failed validation attempts
- Database errors

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 6265 - HTTP State Management Mechanism (Cookies)](https://tools.ietf.org/html/rfc6265)
- [SvelteKit Cookies Documentation](https://kit.svelte.dev/docs/types#public-types-cookies)
