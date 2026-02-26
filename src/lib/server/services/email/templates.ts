import { APP_URL } from '$env/static/private';

/**
 * Get the base URL for the application
 * Falls back to localhost if APP_URL is not set
 */
function getAppUrl(): string {
	return APP_URL || 'http://localhost:5173';
}

/**
 * Base email template wrapper with consistent styling
 */
function emailTemplate(content: string): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CHTM Cooks</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
            color: #333333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .content h2 {
            color: #333333;
            font-size: 24px;
            margin: 0 0 20px 0;
            font-weight: 600;
        }
        .content p {
            color: #666666;
            font-size: 16px;
            line-height: 1.6;
            margin: 0 0 20px 0;
        }
        .button {
            display: inline-block;
            padding: 14px 32px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
            transition: transform 0.2s;
        }
        .button:hover {
            transform: translateY(-2px);
        }
        .token-box {
            background-color: #f8f9fa;
            border: 2px dashed #dee2e6;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
            font-family: 'Courier New', monospace;
            font-size: 18px;
            font-weight: bold;
            color: #495057;
            word-break: break-all;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #dee2e6;
        }
        .footer p {
            color: #6c757d;
            font-size: 14px;
            margin: 5px 0;
        }
        .warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .warning p {
            color: #856404;
            margin: 0;
            font-size: 14px;
        }
        @media only screen and (max-width: 600px) {
            .content {
                padding: 30px 20px;
            }
            .header h1 {
                font-size: 24px;
            }
            .content h2 {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🍳 CHTM Cooks</h1>
        </div>
        ${content}
        <div class="footer">
            <p>© ${new Date().getFullYear()} CHTM Cooks. All rights reserved.</p>
            <p>Gordon College - College of Hospitality and Tourism Management</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * Email verification template
 * @param firstName - User's first name
 * @param verificationToken - Token for email verification
 * @returns HTML email template
 */
export function emailVerificationTemplate(firstName: string, verificationToken: string): string {
	const verificationUrl = `${getAppUrl()}/api/auth/verify-email?token=${verificationToken}`;

	const content = `
        <div class="content">
            <h2>Welcome to CHTM Cooks! 🎉</h2>
            <p>Hi <strong>${firstName}</strong>,</p>
            <p>Thank you for registering with CHTM Cooks. We're excited to have you join our culinary community!</p>
            <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
            
            <center>
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </center>
            
            <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
            <div class="token-box">${verificationUrl}</div>
            
            <div class="warning">
                <p><strong>⏰ Important:</strong> This verification link will expire in 24 hours.</p>
            </div>
            
            <p>If you didn't create an account with CHTM Cooks, please ignore this email.</p>
            
            <p>Best regards,<br>The CHTM Cooks Team</p>
        </div>
    `;

	return emailTemplate(content);
}

/**
 * Password reset request template
 * @param firstName - User's first name
 * @param resetToken - Token for password reset
 * @returns HTML email template
 */
export function passwordResetTemplate(firstName: string, resetToken: string): string {
	const resetUrl = `${getAppUrl()}/auth/reset-password?token=${resetToken}`;

	const content = `
        <div class="content">
            <h2>Password Reset Request 🔐</h2>
            <p>Hi <strong>${firstName}</strong>,</p>
            <p>We received a request to reset the password for your CHTM Cooks account.</p>
            <p>Click the button below to reset your password:</p>
            
            <center>
                <a href="${resetUrl}" class="button">Reset Password</a>
            </center>
            
            <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
            <div class="token-box">${resetUrl}</div>
            
            <div class="warning">
                <p><strong>⏰ Important:</strong> This password reset link will expire in 1 hour for security reasons.</p>
            </div>
            
            <p><strong>Security Notice:</strong> If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            
            <p>Best regards,<br>The CHTM Cooks Team</p>
        </div>
    `;

	return emailTemplate(content);
}

/**
 * Password reset success confirmation template
 * @param firstName - User's first name
 * @returns HTML email template
 */
export function passwordResetSuccessTemplate(firstName: string): string {
	const content = `
        <div class="content">
            <h2>Password Successfully Reset ✅</h2>
            <p>Hi <strong>${firstName}</strong>,</p>
            <p>Your password has been successfully reset. You can now log in to your CHTM Cooks account with your new password.</p>
            
            <center>
				<a href="${getAppUrl()}/auth/login" class="button">Log In Now</a>
            
            <div class="warning">
                <p><strong>🔒 Security Alert:</strong> If you didn't make this change, please contact our support team immediately.</p>
            </div>
            
            <p>Best regards,<br>The CHTM Cooks Team</p>
        </div>
    `;

	return emailTemplate(content);
}

/**
 * Email verification success template
 * @param firstName - User's first name
 * @returns HTML email template
 */
export function emailVerificationSuccessTemplate(firstName: string): string {
	const content = `
        <div class="content">
            <h2>Email Verified Successfully! ✅</h2>
            <p>Hi <strong>${firstName}</strong>,</p>
            <p>Great news! Your email address has been successfully verified.</p>
            <p>You now have full access to all CHTM Cooks features. Start exploring and enjoy your culinary journey!</p>
            
            <center>
				<a href="${getAppUrl()}/auth/login" class="button">Get Started</a>
            
            <p>Thank you for being part of our community!</p>
            
            <p>Best regards,<br>The CHTM Cooks Team</p>
        </div>
    `;

	return emailTemplate(content);
}
