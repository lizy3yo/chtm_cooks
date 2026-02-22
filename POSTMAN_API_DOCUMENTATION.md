# CHTM Cooks - Email Verification & Password Reset API Documentation

## 📋 Table of Contents
1. [Overview](#overview)
2. [Environment Setup](#environment-setup)
3. [API Endpoints](#api-endpoints)
   - [Register User](#1-register-user)
   - [Verify Email](#2-verify-email)
   - [Resend Verification Email](#3-resend-verification-email)
   - [Login](#4-login)
   - [Forgot Password](#5-forgot-password)
   - [Reset Password](#6-reset-password)
4. [Testing Flow](#testing-flow)
5. [Error Codes](#error-codes)

---

## Overview

This API implements industry-standard email verification and password reset flows with the following features:

- ✅ **Email Verification**: Users must verify their email before logging in
- 🔒 **Secure Token Generation**: Uses cryptographically secure tokens (SHA256 hashed)
- ⏰ **Token Expiration**: Verification tokens expire after 24 hours, reset tokens after 1 hour
- 🛡️ **Rate Limiting**: Built-in protection against abuse
- 🔐 **Security Best Practices**: No email enumeration, secure password requirements
- 📧 **Beautiful Email Templates**: Professional HTML email templates

---

## Environment Setup

Your `.env` file should contain:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=dejesuskharl32@gmail.com
EMAIL_PASSWORD=lpod lkqr jvnp xwua
EMAIL_FROM="CHTM Cooks <noreply@your-email.com>"

# App URL (for email links)
APP_URL=http://localhost:5173
```

---

## API Endpoints

### Base URL
```
http://localhost:5173
```

---

## 1. Register User

**Endpoint:** `POST /api/auth/register`

**Description:** Register a new user account. An email verification link will be sent automatically.

**Headers:**
```
Content-Type: application/json
```

**Request Body (Student):**
```json
{
  "email": "student@gordoncollege.edu.ph",
  "password": "SecurePass123!",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "role": "student",
  "yearLevel": "3rd Year",
  "block": "A",
  "agreedToTerms": true
}
```

**Request Body (Other Roles):**
```json
{
  "email": "instructor@example.com",
  "password": "SecurePass123!",
  "firstName": "Maria",
  "lastName": "Santos",
  "role": "instructor"
}
```

**Password Requirements:**
- At least 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Available Roles:**
- `student` (requires @gordoncollege.edu.ph email)
- `custodian`
- `instructor`
- `superadmin`

**Success Response (201 Created):**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "student@gordoncollege.edu.ph",
    "role": "student",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "isActive": true,
    "createdAt": "2026-02-23T10:30:00.000Z",
    "yearLevel": "3rd Year",
    "block": "A",
    "agreedToTerms": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

400 Bad Request:
```json
{
  "error": "Invalid email format"
}
```

409 Conflict:
```json
{
  "error": "User with this email already exists"
}
```

**Rate Limit:**
- 3 registrations per hour per IP
- After exceeding: Blocked for 1 hour

---

## 2. Verify Email

**Endpoint:** `GET /api/auth/verify-email?token={token}`

**Description:** Verify user's email address using the token sent via email.

**Query Parameters:**
- `token` (required): Verification token from email

**Example URL:**
```
http://localhost:5173/api/auth/verify-email?token=a1b2c3d4e5f6...
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully! You can now log in."
}
```

**Error Responses:**

400 Bad Request:
```json
{
  "error": "Verification token is required"
}
```

400 Bad Request (Expired):
```json
{
  "error": "Verification token has expired",
  "message": "Please request a new verification email"
}
```

400 Bad Request (Invalid):
```json
{
  "error": "Invalid or expired verification token"
}
```

**Rate Limit:**
- 60 requests per minute per IP

---

## 3. Resend Verification Email

**Endpoint:** `POST /api/auth/resend-verification`

**Description:** Request a new verification email if the previous one expired or was lost.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "student@gordoncollege.edu.ph"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Verification email has been sent. Please check your inbox."
}
```

**Note:** This endpoint always returns success (even if email doesn't exist) to prevent email enumeration attacks.

**Error Responses:**

400 Bad Request:
```json
{
  "error": "Invalid email format"
}
```

**Rate Limit:**
- 3 requests per hour per IP
- After exceeding: Blocked for 1 hour

---

## 4. Login

**Endpoint:** `POST /api/auth/login`

**Description:** Login with email and password. Email must be verified.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "student@gordoncollege.edu.ph",
  "password": "SecurePass123!"
}
```

**Success Response (200 OK):**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "student@gordoncollege.edu.ph",
    "role": "student",
    "firstName": "Juan",
    "lastName": "Dela Cruz",
    "isActive": true,
    "createdAt": "2026-02-23T10:30:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

401 Unauthorized:
```json
{
  "error": "Invalid credentials"
}
```

403 Forbidden (Email Not Verified):
```json
{
  "error": "Email not verified",
  "message": "Please verify your email address before logging in. Check your inbox for the verification link.",
  "code": "EMAIL_NOT_VERIFIED"
}
```

403 Forbidden (Account Deactivated):
```json
{
  "error": "Account is deactivated"
}
```

**Rate Limit:**
- 5 failed login attempts per 15 minutes
- Only failed attempts are counted
- After exceeding: Blocked for 30 minutes

---

## 5. Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

**Description:** Request a password reset link via email.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "student@gordoncollege.edu.ph"
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Note:** This endpoint always returns success (even if email doesn't exist) to prevent email enumeration attacks.

**Error Responses:**

400 Bad Request:
```json
{
  "error": "Invalid email format"
}
```

**Rate Limit:**
- 3 requests per hour per IP
- After exceeding: Blocked for 1 hour

---

## 6. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Description:** Reset password using the token sent via email.

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "a1b2c3d4e5f6...",
  "password": "NewSecurePass123!"
}
```

**Password Requirements:**
- At least 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Password reset successfully! You can now log in with your new password."
}
```

**Error Responses:**

400 Bad Request:
```json
{
  "error": "Reset token is required"
}
```

400 Bad Request (Expired):
```json
{
  "error": "Reset token has expired",
  "message": "Please request a new password reset link"
}
```

400 Bad Request (Invalid):
```json
{
  "error": "Invalid or expired reset token"
}
```

400 Bad Request (Weak Password):
```json
{
  "error": "Password must be at least 8 characters..."
}
```

403 Forbidden:
```json
{
  "error": "Account is not active. Please contact support."
}
```

**Rate Limit:**
- 60 requests per minute per IP

---

## Testing Flow

### Complete Email Verification Flow:

1. **Register a new user**
   - POST to `/api/auth/register`
   - Check your email inbox for verification link
   - Note: Tokens are sent via email automatically

2. **Verify email**
   - Open the email and click the verification link OR
   - GET to `/api/auth/verify-email?token={token}` (copy token from email URL)

3. **Login**
   - POST to `/api/auth/login` with credentials
   - Should succeed now that email is verified

4. **Test resend verification (optional)**
   - Create another user
   - POST to `/api/auth/resend-verification` with email
   - Check inbox for new verification email

### Complete Password Reset Flow:

1. **Request password reset**
   - POST to `/api/auth/forgot-password` with email
   - Check your email inbox for reset link

2. **Reset password**
   - Copy token from email URL OR click the link
   - POST to `/api/auth/reset-password` with token and new password

3. **Login with new password**
   - POST to `/api/auth/login` with new credentials

---

## Error Codes

| HTTP Code | Meaning |
|-----------|---------|
| 200 | Success |
| 201 | Resource created successfully |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (invalid credentials) |
| 403 | Forbidden (email not verified or account deactivated) |
| 409 | Conflict (user already exists) |
| 429 | Too many requests (rate limit exceeded) |
| 500 | Internal server error |

---

## Rate Limit Headers

All responses include rate limit information in headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1708708200
```

When rate limited:
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708708200
Retry-After: 1800

{
  "error": "Too many requests",
  "message": "You have exceeded the rate limit. Please try again later.",
  "retryAfter": 1800
}
```

---

## Security Features

1. **Cryptographic Token Security**
   - 64-character hex tokens (32 bytes entropy)
   - SHA256 hashed before storage
   - Never store raw tokens in database

2. **Token Expiration**
   - Email verification: 24 hours
   - Password reset: 1 hour

3. **No Email Enumeration**
   - Forgot password always returns success
   - Resend verification always returns success

4. **Rate Limiting**
   - Login: 5 attempts per 15 minutes (30 min block)
   - Registration: 3 per hour (1 hour block)
   - Password reset: 3 per hour (1 hour block)
   - API calls: 60 per minute

5. **Password Requirements**
   - Minimum 8 characters
   - Mixed case, numbers, and special characters
   - Bcrypt hashing with salt

6. **IP-based Rate Limiting**
   - Uses Redis for distributed rate limiting
   - Sliding window algorithm

---

## Postman Collection Setup

### Creating a Postman Collection:

1. **Create New Collection**
   - Name: "CHTM Cooks - Auth & Email"
   - Base URL: `http://localhost:5173`

2. **Create Folders:**
   - Authentication
   - Email Verification
   - Password Reset

3. **Add Environment Variables:**
   - `base_url`: `http://localhost:5173`
   - `access_token`: (will be auto-set after login)
   - `refresh_token`: (will be auto-set after login)

### Example Collection Structure:

```
📁 CHTM Cooks - Auth & Email
  📁 Authentication
    - POST Register User (Student)
    - POST Register User (Instructor)
    - POST Login
    - POST Refresh Token
    - GET Get Current User
  
  📁 Email Verification
    - GET Verify Email
    - POST Resend Verification Email
  
  📁 Password Reset
    - POST Forgot Password
    - POST Reset Password
```

### Pre-request Scripts (for collection):

Add to collection pre-request script to automatically set base URL:
```javascript
pm.environment.set("base_url", "http://localhost:5173");
```

### Test Scripts (for Login endpoint):

Add to Login endpoint's test script to automatically save tokens:
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("access_token", jsonData.accessToken);
    pm.environment.set("refresh_token", jsonData.refreshToken);
}
```

---

## Notes

1. **Email Testing**: Make sure your Gmail app password is correct and 2FA is enabled
2. **Token Security**: Tokens in emails are one-time use and expire
3. **Development**: In production, use HTTPS for all endpoints
4. **Redis**: Ensure Redis is running for rate limiting to work
5. **MongoDB**: Ensure MongoDB connection is active

---

## Support

For issues or questions, contact the CHTM Cooks development team.

**Last Updated:** February 23, 2026
