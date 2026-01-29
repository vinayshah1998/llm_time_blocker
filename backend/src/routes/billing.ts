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

// Helper to check if error is "No such customer" (test mode customer used with production API)
function isNoSuchCustomerError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('No such customer')
  );
}

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

      try {
        const checkoutUrl = await createCheckoutSession(
          customerId,
          user.id,
          successUrl,
          cancelUrl
        );
        res.json({ url: checkoutUrl });
      } catch (stripeError) {
        // Handle test mode customer ID used with production API
        if (isNoSuchCustomerError(stripeError)) {
          console.log(`Invalid customer ${customerId} for user ${user.id}, creating new production customer`);

          // Create new production customer
          const newCustomerId = await createCustomer(user.email, user.id);
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: newCustomerId },
          });

          // Retry checkout session with new customer
          const checkoutUrl = await createCheckoutSession(
            newCustomerId,
            user.id,
            successUrl,
            cancelUrl
          );
          res.json({ url: checkoutUrl });
        } else {
          throw stripeError;
        }
      }
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

      try {
        const portalUrl = await createPortalSession(user.stripeCustomerId, returnUrl);
        res.json({ url: portalUrl });
      } catch (stripeError) {
        // Handle test mode customer ID used with production API
        if (isNoSuchCustomerError(stripeError)) {
          console.log(`Invalid customer ${user.stripeCustomerId} for user ${user.id}, creating new production customer`);

          // Create new production customer
          const newCustomerId = await createCustomer(user.email, user.id);
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: newCustomerId },
          });

          // Retry portal session with new customer
          const portalUrl = await createPortalSession(newCustomerId, returnUrl);
          res.json({ url: portalUrl });
        } else {
          throw stripeError;
        }
      }
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
