#!/usr/bin/env node

/**
 * Auto-Login Test Script
 * 
 * This script tests the auto-login functionality by:
 * 1. Creating a test user
 * 2. Logging in with "Remember Me"
 * 3. Verifying remember-me token is created
 * 4. Simulating browser restart (clearing access/refresh tokens)
 * 5. Testing auto-login with remember-me token
 * 6. Verifying user is authenticated
 * 7. Cleaning up test data
 * 
 * Usage: node scripts/test-auto-login.js
 */

import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chtm_cooks';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[Step ${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`  ${message}`, 'blue');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAutoLogin() {
  let client;
  let testUserId;
  let rememberMeToken;
  
  try {
    log('\n' + '='.repeat(60), 'bright');
    log('AUTO-LOGIN FUNCTIONALITY TEST', 'bright');
    log('='.repeat(60), 'bright');
    
    // Step 1: Connect to database
    logStep(1, 'Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();
    logSuccess('Connected to MongoDB');
    
    // Step 2: Create test user
    logStep(2, 'Creating test user...');
    const testEmail = `test-autologin-${Date.now()}@test.com`;
    const testPassword = 'TestPassword123!';
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    
    const testUser = {
      email: testEmail,
      password: hashedPassword,
      role: 'student',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      emailVerified: true,
      agreedToTerms: true,
      createdAt: new Date(),
      lastLogin: new Date()
    };
    
    const result = await db.collection('users').insertOne(testUser);
    testUserId = result.insertedId;
    logSuccess(`Test user created: ${testEmail}`);
    logInfo(`User ID: ${testUserId}`);
    
    // Step 3: Simulate login with "Remember Me"
    logStep(3, 'Simulating login with "Remember Me"...');
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        rememberMe: true
      }),
      credentials: 'include'
    });
    
    if (!loginResponse.ok) {
      const error = await loginResponse.json();
      throw new Error(`Login failed: ${error.error || loginResponse.statusText}`);
    }
    
    const loginData = await loginResponse.json();
    logSuccess('Login successful');
    logInfo(`User: ${loginData.user.email}`);
    logInfo(`Role: ${loginData.user.role}`);
    
    // Extract cookies
    const cookies = loginResponse.headers.get('set-cookie');
    if (!cookies) {
      throw new Error('No cookies returned from login');
    }
    
    // Parse remember_me cookie
    const rememberMeCookie = cookies.split(',').find(c => c.includes('remember_me='));
    if (!rememberMeCookie) {
      throw new Error('remember_me cookie not found');
    }
    
    rememberMeToken = rememberMeCookie.split('remember_me=')[1].split(';')[0];
    logSuccess('Remember-me token received');
    logInfo(`Token preview: ${rememberMeToken.substring(0, 20)}...`);
    
    // Step 4: Verify token in database
    logStep(4, 'Verifying token in database...');
    const [selector] = rememberMeToken.split(':');
    const tokenDoc = await db.collection('remember_tokens').findOne({ selector });
    
    if (!tokenDoc) {
      throw new Error('Token not found in database');
    }
    
    logSuccess('Token found in database');
    logInfo(`Token ID: ${tokenDoc._id}`);
    logInfo(`User ID: ${tokenDoc.userId}`);
    logInfo(`Device: ${tokenDoc.deviceName || 'Unknown'}`);
    logInfo(`Expires: ${tokenDoc.expiresAt.toISOString()}`);
    logInfo(`Revoked: ${tokenDoc.isRevoked}`);
    
    // Step 5: Simulate browser restart (wait a bit)
    logStep(5, 'Simulating browser restart...');
    await sleep(1000);
    logSuccess('Simulated browser restart');
    
    // Step 6: Test auto-login
    logStep(6, 'Testing auto-login...');
    const autoLoginResponse = await fetch(`${API_BASE_URL}/api/auth/auto-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `remember_me=${rememberMeToken}`
      },
      credentials: 'include'
    });
    
    if (!autoLoginResponse.ok) {
      const error = await autoLoginResponse.json();
      throw new Error(`Auto-login failed: ${error.error || autoLoginResponse.statusText}`);
    }
    
    const autoLoginData = await autoLoginResponse.json();
    logSuccess('Auto-login successful!');
    logInfo(`User: ${autoLoginData.user.email}`);
    logInfo(`Role: ${autoLoginData.user.role}`);
    
    // Step 7: Verify token rotation
    logStep(7, 'Verifying token rotation...');
    const oldTokenDoc = await db.collection('remember_tokens').findOne({ _id: tokenDoc._id });
    
    if (oldTokenDoc && oldTokenDoc.isRevoked) {
      logSuccess('Old token was revoked (rotation successful)');
    } else {
      logInfo('Token rotation may not be enabled or failed');
    }
    
    // Check for new token
    const newTokenCount = await db.collection('remember_tokens').countDocuments({
      userId: testUserId,
      isRevoked: false
    });
    logInfo(`Active tokens for user: ${newTokenCount}`);
    
    // Step 8: Test /api/auth/me endpoint
    logStep(8, 'Testing /api/auth/me endpoint...');
    const newCookies = autoLoginResponse.headers.get('set-cookie');
    const accessTokenCookie = newCookies?.split(',').find(c => c.includes('access_token='));
    
    if (!accessTokenCookie) {
      throw new Error('access_token cookie not found after auto-login');
    }
    
    const accessToken = accessTokenCookie.split('access_token=')[1].split(';')[0];
    
    const meResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        'Cookie': `access_token=${accessToken}`
      },
      credentials: 'include'
    });
    
    if (!meResponse.ok) {
      throw new Error('Failed to get user info with new access token');
    }
    
    const meData = await meResponse.json();
    logSuccess('User info retrieved with new access token');
    logInfo(`User: ${meData.user.email}`);
    
    // Success!
    log('\n' + '='.repeat(60), 'bright');
    log('✓✓✓ ALL TESTS PASSED ✓✓✓', 'green');
    log('='.repeat(60), 'bright');
    log('\nAuto-login functionality is working correctly!', 'green');
    
  } catch (error) {
    log('\n' + '='.repeat(60), 'bright');
    log('✗✗✗ TEST FAILED ✗✗✗', 'red');
    log('='.repeat(60), 'bright');
    logError(`\nError: ${error.message}`);
    if (error.stack) {
      logInfo('\nStack trace:');
      console.log(error.stack);
    }
    process.exit(1);
    
  } finally {
    // Cleanup
    if (client && testUserId) {
      logStep('Cleanup', 'Removing test data...');
      try {
        await client.db().collection('users').deleteOne({ _id: testUserId });
        await client.db().collection('remember_tokens').deleteMany({ userId: testUserId });
        logSuccess('Test data cleaned up');
      } catch (cleanupError) {
        logError(`Cleanup failed: ${cleanupError.message}`);
      }
    }
    
    if (client) {
      await client.close();
      logInfo('Database connection closed');
    }
  }
}

// Run the test
testAutoLogin().catch(error => {
  logError(`Unhandled error: ${error.message}`);
  process.exit(1);
});
