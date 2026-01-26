import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  createCustomer,
} from '../services/stripeService.js';
import { prisma } from '../index.js';

const router = Router();

// Create checkout session
router.post(
  '/create-checkout-session',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { successUrl, cancelUrl } = req.body;

      if (!successUrl || !cancelUrl) {
        res.status(400).json({ error: 'successUrl and cancelUrl are required' });
        return;
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Create Stripe customer if not exists
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        customerId = await createCustomer(user.email, user.id);
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // Check if user already has active subscription
      if (['TRIALING', 'ACTIVE'].includes(user.subscriptionStatus)) {
        res.status(400).json({
          error: 'You already have an active subscription',
          code: 'ALREADY_SUBSCRIBED',
        });
        return;
      }

      const checkoutUrl = await createCheckoutSession(
        customerId,
        user.id,
        successUrl,
        cancelUrl
      );

      res.json({ url: checkoutUrl });
    } catch (error) {
      console.error('Create checkout session error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }
);

// Create portal session for managing subscription
router.post(
  '/create-portal-session',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { returnUrl } = req.body;

      if (!returnUrl) {
        res.status(400).json({ error: 'returnUrl is required' });
        return;
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (!user.stripeCustomerId) {
        res.status(400).json({
          error: 'No billing account found',
          code: 'NO_BILLING_ACCOUNT',
        });
        return;
      }

      const portalUrl = await createPortalSession(user.stripeCustomerId, returnUrl);

      res.json({ url: portalUrl });
    } catch (error) {
      console.error('Create portal session error:', error);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  }
);

// Get subscription status
router.get(
  '/subscription-status',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await getSubscriptionStatus(req.userId!);

      if (!status) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(status);
    } catch (error) {
      console.error('Get subscription status error:', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  }
);

export default router;
