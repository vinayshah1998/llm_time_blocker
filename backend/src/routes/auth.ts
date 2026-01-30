import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authMiddleware, AuthenticatedRequest, JwtPayload } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { createCustomer } from '../services/stripeService.js';

const router = Router();

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// Validation schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Generate tokens
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

// Signup
router.post('/signup', authRateLimit, async (req, res: Response) => {
  try {
    const result = signupSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0].message });
      return;
    }

    const { email, password } = result.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    // Create Stripe customer
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

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await generateRefreshToken(user.id);

    res.status(201).json({
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
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Login
router.post('/login', authRateLimit, async (req, res: Response) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0].message });
      return;
    }

    const { email, password } = result.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check if user has a password (OAuth-only users don't)
    if (!user.passwordHash) {
      res.status(401).json({ error: 'This account uses Google sign-in. Please sign in with Google.' });
      return;
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate tokens
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh token
router.post('/refresh', async (req, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    // Find and validate refresh token
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    if (tokenRecord.expiresAt < new Date()) {
      // Delete expired token
      await prisma.refreshToken.delete({
        where: { id: tokenRecord.id },
      });
      res.status(401).json({ error: 'Refresh token expired' });
      return;
    }

    // Delete old refresh token (rotate tokens)
    await prisma.refreshToken.delete({
      where: { id: tokenRecord.id },
    });

    // Generate new tokens
    const accessToken = generateAccessToken(tokenRecord.user.id, tokenRecord.user.email);
    const newRefreshToken = await generateRefreshToken(tokenRecord.user.id);

    res.json({
      user: {
        id: tokenRecord.user.id,
        email: tokenRecord.user.email,
        subscriptionStatus: tokenRecord.user.subscriptionStatus,
      },
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Delete specific refresh token
      await prisma.refreshToken.deleteMany({
        where: {
          token: refreshToken,
          userId: req.userId,
        },
      });
    } else {
      // Delete all refresh tokens for user
      await prisma.refreshToken.deleteMany({
        where: { userId: req.userId },
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
      subscription: user.subscription
        ? {
            status: user.subscription.status,
            trialEnd: user.subscription.trialEnd,
            currentPeriodEnd: user.subscription.currentPeriodEnd,
          }
        : null,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

export default router;
