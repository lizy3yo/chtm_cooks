# Postman Testing Guide for Security Headers

This guide provides step-by-step instructions for testing security headers using Postman.

## 🚀 Quick Setup

### 1. Start Your Development Server

```powershell
npm run dev
```

Wait for the server to start (usually at `http://localhost:5173`).

---

## 📬 Postman Requests

### Test 1: Verify Security Headers on Homepage

**Purpose**: Check that security headers are applied to all responses.

#### Setup:
1. Open Postman
2. Click "New" → "HTTP Request"
3. Set method to **GET**
4. Enter URL: `http://localhost:5173/`
5. Click **Send**

#### Verify These Headers (in "Headers" tab of response):

Create a checklist and verify each header:

```
✅ Content-Security-Policy
   Example: default-src 'self'; script-src 'self' 'unsafe-inline' ...

✅ X-Frame-Options
   Should be: DENY

✅ X-Content-Type-Options
   Should be: nosniff

✅ X-XSS-Protection
   Should be: 1; mode=block

✅ Referrer-Policy
   Should be: strict-origin-when-cross-origin

✅ Permissions-Policy
   Should contain: camera=(), microphone=(), geolocation=() ...

✅ Origin-Agent-Cluster
   Should be: ?1

✅ X-DNS-Prefetch-Control
   Should be: on

✅ X-Download-Options
   Should be: noopen

✅ X-Permitted-Cross-Domain-Policies
   Should be: none
```

**Expected Result**: All headers present with correct values.

---

### Test 2: Security Configuration Analysis

**Purpose**: Get detailed security score and recommendations.

#### Setup:
1. Create new request
2. Set method to **GET**
3. Enter URL: `http://localhost:5173/api/security-test`
4. Click **Send**

#### Expected Response (200 OK):

```json
{
  "status": "ok",
  "timestamp": "2026-02-23T...",
  "environment": "development",
  "securityHeaders": {
    "Content-Security-Policy": "...",
    "X-Frame-Options": "DENY",
    ...
  },
  "analysis": {
    "score": 85,
    "grade": "A-",
    "recommendations": [...]
  },
  "cspValidation": {
    "valid": false,
    "warnings": [
      "CSP Warning: 'unsafe-inline' in script-src reduces XSS protection...",
      ...
    ]
  },
  "info": {
    "message": "These are the security headers currently applied to all responses",
    ...
  }
}
```

#### What to Check:
- ✅ `status` is "ok"
- ✅ `analysis.score` is a number (0-100)
- ✅ `analysis.grade` shows your security grade
- ✅ `securityHeaders` object contains all headers
- ✅ `cspValidation.warnings` shows CSP issues (expected in dev)

**Expected Score**: 80-90 in development (lower due to unsafe-inline/eval)

---

### Test 3: API Endpoint - Health Check

**Purpose**: Verify security headers on API routes.

#### Setup:
1. Create new request
2. Set method to **GET**
3. Enter URL: `http://localhost:5173/api/health`
4. Click **Send**

#### Verify:
- ✅ Status: 200 OK
- ✅ All security headers present (same as Test 1)
- ✅ Response body shows health status

**Expected Result**: Health endpoint returns normally WITH security headers.

---

### Test 4: Protected API Endpoint - Auth Me

**Purpose**: Test security headers on authenticated endpoints.

#### Setup:
1. Create new request
2. Set method to **GET**
3. Enter URL: `http://localhost:5173/api/auth/me`
4. Add header: `Authorization: Bearer YOUR_TOKEN_HERE`
5. Click **Send**

#### Expected Results:
- **Without token**: 401 Unauthorized (but still has security headers)
- **With valid token**: 200 OK with user data (and security headers)

#### Verify:
- ✅ Security headers present in both success and error responses
- ✅ Response includes `X-Request-ID` header

---

### Test 5: CSP Report Endpoint

**Purpose**: Test CSP violation reporting endpoint.

#### Setup:
1. Create new request
2. Set method to **POST**
3. Enter URL: `http://localhost:5173/api/csp-report`
4. Go to "Body" tab
5. Select "raw" and "JSON"
6. Enter this test payload:

```json
{
  "csp-report": {
    "document-uri": "http://localhost:5173/page",
    "violated-directive": "script-src",
    "blocked-uri": "https://malicious-site.com/evil.js",
    "original-policy": "default-src 'self'; script-src 'self'"
  }
}
```

7. Click **Send**

#### Expected Result:
- ✅ Status: 204 No Content
- ✅ No response body
- ✅ Check your server console for logged warning

**Console Output**:
```
CSP Violation Report: {
  documentUri: 'http://localhost:5173/page',
  violatedDirective: 'script-src',
  blockedUri: 'https://malicious-site.com/evil.js'
}
```

---

## 📊 Automated Tests (Optional)

### Add Tests to Postman

For each request, go to the "Tests" tab and add these scripts:

#### Test Script for Homepage / API Endpoints:

```javascript
// Basic response check
pm.test("Response is successful", function () {
    pm.response.to.be.success;
});

// Security headers tests
pm.test("Has Content-Security-Policy", function () {
    pm.response.to.have.header("Content-Security-Policy");
    const csp = pm.response.headers.get("Content-Security-Policy");
    pm.expect(csp).to.include("default-src");
});

pm.test("Has X-Frame-Options set to DENY", function () {
    pm.response.to.have.header("X-Frame-Options");
    pm.expect(pm.response.headers.get("X-Frame-Options")).to.equal("DENY");
});

pm.test("Has X-Content-Type-Options set to nosniff", function () {
    pm.response.to.have.header("X-Content-Type-Options");
    pm.expect(pm.response.headers.get("X-Content-Type-Options")).to.equal("nosniff");
});

pm.test("Has X-XSS-Protection", function () {
    pm.response.to.have.header("X-XSS-Protection");
});

pm.test("Has Referrer-Policy", function () {
    pm.response.to.have.header("Referrer-Policy");
    pm.expect(pm.response.headers.get("Referrer-Policy")).to.equal("strict-origin-when-cross-origin");
});

pm.test("Has Permissions-Policy", function () {
    pm.response.to.have.header("Permissions-Policy");
    const policy = pm.response.headers.get("Permissions-Policy");
    pm.expect(policy).to.include("camera=()");
    pm.expect(policy).to.include("microphone=()");
});

pm.test("Has Origin-Agent-Cluster", function () {
    pm.response.to.have.header("Origin-Agent-Cluster");
    pm.expect(pm.response.headers.get("Origin-Agent-Cluster")).to.equal("?1");
});

// Count security headers
pm.test("Has minimum 7 security headers", function () {
    const securityHeaders = [
        "Content-Security-Policy",
        "X-Frame-Options",
        "X-Content-Type-Options",
        "X-XSS-Protection",
        "Referrer-Policy",
        "Permissions-Policy",
        "Origin-Agent-Cluster"
    ];
    
    let count = 0;
    securityHeaders.forEach(header => {
        if (pm.response.headers.has(header)) {
            count++;
        }
    });
    
    pm.expect(count).to.be.at.least(7);
});
```

#### Test Script for Security Test Endpoint:

```javascript
pm.test("Status is 200 OK", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has correct structure", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('status');
    pm.expect(jsonData).to.have.property('securityHeaders');
    pm.expect(jsonData).to.have.property('analysis');
    pm.expect(jsonData.status).to.equal('ok');
});

pm.test("Has security score between 0-100", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.analysis.score).to.be.a('number');
    pm.expect(jsonData.analysis.score).to.be.at.least(0);
    pm.expect(jsonData.analysis.score).to.be.at.most(100);
});

pm.test("Security score is passing (>= 70)", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.analysis.score).to.be.at.least(70);
});

pm.test("Has security grade", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.analysis.grade).to.be.a('string');
    const validGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
    pm.expect(validGrades).to.include(jsonData.analysis.grade);
});

pm.test("Development environment detected", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.environment).to.equal('development');
});

pm.test("Has CSP validation warnings", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.cspValidation).to.have.property('warnings');
    pm.expect(jsonData.cspValidation.warnings).to.be.an('array');
});
```

---

## 🎯 Postman Collection JSON

Save this as a `.json` file and import into Postman:

```json
{
  "info": {
    "name": "Security Headers Tests",
    "description": "Test suite for security headers implementation",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "1. Homepage - Verify Headers",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/",
          "host": ["{{baseUrl}}"],
          "path": [""]
        }
      }
    },
    {
      "name": "2. Security Test - Analysis",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/api/security-test",
          "host": ["{{baseUrl}}"],
          "path": ["api", "security-test"]
        }
      }
    },
    {
      "name": "3. Health Check - API Headers",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/api/health",
          "host": ["{{baseUrl}}"],
          "path": ["api", "health"]
        }
      }
    },
    {
      "name": "4. Auth Me - Protected Route",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}",
            "type": "text"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/auth/me",
          "host": ["{{baseUrl}}"],
          "path": ["api", "auth", "me"]
        }
      }
    },
    {
      "name": "5. CSP Report - Test Endpoint",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"csp-report\": {\n    \"document-uri\": \"http://localhost:5173/page\",\n    \"violated-directive\": \"script-src\",\n    \"blocked-uri\": \"https://malicious-site.com/evil.js\",\n    \"original-policy\": \"default-src 'self'; script-src 'self'\"\n  }\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/api/csp-report",
          "host": ["{{baseUrl}}"],
          "path": ["api", "csp-report"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5173"
    },
    {
      "key": "token",
      "value": "your-jwt-token-here"
    }
  ]
}
```

### To Import:
1. Open Postman
2. Click "Import" (top left)
3. Select "Raw text" or "File"
4. Paste the JSON above or select the saved file
5. Click "Import"

---

## 🌐 Testing Production Headers

When testing in production (HTTPS):

### Additional Headers to Verify:

```
✅ Strict-Transport-Security
   Should be: max-age=63072000; includeSubDomains; preload

✅ Cross-Origin-Embedder-Policy
   Should be: require-corp

✅ Cross-Origin-Opener-Policy
   Should be: same-origin

✅ Cross-Origin-Resource-Policy
   Should be: same-origin
```

### Production Environment Setup:

1. Create new Postman environment: "Production"
2. Add variables:
   - `baseUrl`: `https://yourdomain.com`
   - `token`: `your-production-token`
3. Switch to "Production" environment
4. Run all tests

---

## 🔍 Troubleshooting

### Issue: No Security Headers

**Check**:
1. Is the dev server running?
2. Try: `http://localhost:5173/api/health`
3. Check server console for errors

### Issue: 404 Not Found

**Check**:
1. Correct URL? (include port 5173)
2. Endpoint path correct?
3. Server running?

### Issue: CSP Test Warnings

**This is normal in development!**
- Development mode allows `unsafe-inline` and `unsafe-eval`
- Production will have stricter policies
- Warnings help you prepare for production

### Issue: Low Security Score

**Expected in development**: 80-90
- Production score should be 95+
- Remove `unsafe-inline` and `unsafe-eval` for higher score
- Follow recommendations in response

---

## 📝 Expected Results Summary

| Test | Expected Status | Expected Score | Expected Headers |
|------|----------------|----------------|------------------|
| Homepage | 200 OK | N/A | All headers present |
| Security Test | 200 OK | 80-90 (dev) | JSON response |
| Health Check | 200 OK | N/A | All headers present |
| Auth Me (no token) | 401 Unauthorized | N/A | Headers present |
| Auth Me (with token) | 200 OK | N/A | Headers present |
| CSP Report | 204 No Content | N/A | No body |

---

## 🎓 Next Steps

After successful testing:

1. ✅ All tests passing? Great!
2. 📖 Read the recommendations in `/api/security-test`
3. 🔧 Customize security config in `src/lib/server/middleware/security/config.ts`
4. 🚀 Deploy to production
5. 🔍 Test production at https://securityheaders.com
6. 📊 Verify HSTS, COEP, COOP, CORP headers in production

---

**Happy testing! 🛡️**
