import Stripe from 'stripe';
import { prisma } from '../index.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export async function createCustomer(email: string, userId: string): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}

export async function createCheckoutSession(
  customerId: string,
  userId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID not configured');
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });

  return session.url || '';
}

export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId = session.customer as string;

  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }

  // Update user with Stripe customer ID
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customerId },
  });
}

export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const customerId = subscription.customer as string;

  if (!userId) {
    // Try to find user by customer ID
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
    });
    if (!user) {
      console.error('No user found for subscription:', subscription.id);
      return;
    }
    await syncSubscription(user.id, subscription);
    return;
  }

  await syncSubscription(userId, subscription);
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('No user found for customer:', customerId);
    return;
  }

  await syncSubscription(user.id, subscription);
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('No user found for customer:', customerId);
    return;
  }

  // Update user status to NONE
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: 'NONE' },
  });

  // Delete subscription record
  await prisma.subscription.deleteMany({
    where: { userId: user.id },
  });
}

export async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.error('No user found for customer:', customerId);
    return;
  }

  // Update user status to PAST_DUE
  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: 'PAST_DUE' },
  });
}

async function syncSubscription(userId: string, subscription: Stripe.Subscription) {
  const status = mapStripeStatus(subscription.status);

  // Update user subscription status
  await prisma.user.update({
    where: { id: userId },
    data: { subscriptionStatus: status },
  });

  // Upsert subscription record
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      trialEnd,
      currentPeriodEnd,
    },
    update: {
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      trialEnd,
      currentPeriodEnd,
    },
  });
}

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
      return 'CANCELED';
    default:
      return 'NONE';
  }
}

export async function getSubscriptionStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  if (!user) {
    return null;
  }

  return {
    status: user.subscriptionStatus,
    trialEnd: user.subscription?.trialEnd,
    currentPeriodEnd: user.subscription?.currentPeriodEnd,
  };
}

export { stripe };
