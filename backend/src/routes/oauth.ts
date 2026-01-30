import { Router, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../index.js';
import { JwtPayload } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { createCustomer } from '../services/stripeService.js';

console.log('oauth.ts module loading...');

const router = Router();

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// Validation schema for Google OAuth (access token from chrome.identity.getAuthToken)
const googleOAuthSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
});

// Generate tokens (reused from auth.ts pattern)
function generateAccessToken(userId: string, email: string): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET not configured');

  return jwt.sign({ userId, email } as JwtPayload, secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return token;
}

// Verify Google access token and get user info
// This is used with chrome.identity.getAuthToken() which returns an access token directly
async function verifyGoogleToken(
  accessToken: string
): Promise<{ email: string; providerUserId: string }> {
  // Use Google's userinfo endpoint to verify the token and get user info
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userInfoResponse.ok) {
    const errorData = await userInfoResponse.json().catch(() => ({}));
    console.error('Google userinfo request failed:', errorData);
    throw new Error('Invalid or expired access token');
  }

  const userInfo = await userInfoResponse.json() as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };

  if (!userInfo.email) {
    throw new Error('Email not available from Google account');
  }

  if (!userInfo.sub) {
    throw new Error('User ID not available from Google account');
  }

  return {
    email: userInfo.email,
    providerUserId: userInfo.sub, // Google's unique user ID
  };
}

// Google OAuth endpoint
router.post('/google', authRateLimit, async (req, res: Response) => {
  try {
    const result = googleOAuthSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0].message });
      return;
    }

    const { accessToken: googleAccessToken } = result.data;

    // Verify the access token and get user info from Google
    const { email, providerUserId } = await verifyGoogleToken(googleAccessToken);

    // Check if this OAuth account already exists
    let oauthAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'google',
          providerUserId,
        },
      },
      include: { user: true },
    });

    let user;

    if (oauthAccount) {
      // Existing OAuth account - use associated user
      user = oauthAccount.user;
    } else {
      // Check if user with this email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        // Link OAuth account to existing user
        user = existingUser;
        await prisma.oAuthAccount.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerUserId,
            email,
          },
        });
      } else {
        // Create new user with OAuth account
        user = await prisma.user.create({
          data: {
            email,
            // passwordHash is null for OAuth-only users
            oauthAccounts: {
              create: {
                provider: 'google',
                providerUserId,
                email,
              },
            },
          },
        });

        // Create Stripe customer for new user
        try {
          const stripeCustomerId = await createCustomer(email, user.id);
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId },
          });
        } catch (stripeError) {
          console.error('Failed to create Stripe customer:', stripeError);
          // Continue without Stripe customer - can be created later
        }
      }
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await generateRefreshToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'OAuth authentication failed'
    });
  }
});

console.log('oauth.ts routes registered, exporting router');
export default router;
