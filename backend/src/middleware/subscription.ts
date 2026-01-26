import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { prisma } from '../index.js';

const ALLOWED_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'];

export async function subscriptionMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { subscription: true }
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Check if user has an allowed subscription status
    if (!ALLOWED_STATUSES.includes(user.subscriptionStatus)) {
      res.status(403).json({
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        subscriptionStatus: user.subscriptionStatus
      });
      return;
    }

    // For CANCELED status, check if the subscription period has ended
    if (user.subscriptionStatus === 'CANCELED' && user.subscription) {
      if (new Date() > user.subscription.currentPeriodEnd) {
        // Update status to NONE since period has ended
        await prisma.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'NONE' }
        });

        res.status(403).json({
          error: 'Subscription has ended',
          code: 'SUBSCRIPTION_ENDED'
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('Subscription middleware error:', error);
    res.status(500).json({ error: 'Subscription check failed' });
  }
}
