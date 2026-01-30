import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import {
  stripe,
  handleCheckoutCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handlePaymentFailed,
} from '../services/stripeService.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Missing Stripe signature or webhook secret');
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    res.status(400).json({ error: `Webhook Error: ${message}` });
    return;
  }

  console.log(`Webhook received: ${event.type}, id: ${event.id}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        console.log(`Processed checkout.session.completed for customer: ${session.customer}`);
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        console.log(`Processed customer.subscription.created: ${subscription.id}, status: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        console.log(`Processed customer.subscription.updated: ${subscription.id}, status: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        console.log(`Processed customer.subscription.deleted: ${subscription.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        console.log(`Processed invoice.payment_failed: ${invoice.id}`);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Could send email notification here
        console.log('Trial ending soon:', event.data.object);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
