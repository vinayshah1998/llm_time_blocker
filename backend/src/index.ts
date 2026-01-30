import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import llmRoutes from './routes/llm.js';
import webhookRoutes from './routes/webhooks.js';
import checkoutRedirectRoutes from './routes/checkout-redirect.js';

const app = express();
const prisma = new PrismaClient();

// Trust proxy for Railway (required for express-rate-limit and correct IP detection)
app.set('trust proxy', 1);

// CORS configuration for Chrome extension
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests from Chrome extensions
    if (!origin || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else if (process.env.NODE_ENV === 'development') {
      // Allow localhost in development
      callback(null, true);
    } else {
      // Allow browser requests to checkout redirect pages (no origin for direct navigation)
      callback(null, true);
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Webhook route must use raw body parser (before express.json)
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON body parser for other routes
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/llm', llmRoutes);
app.use('/checkout', checkoutRedirectRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { prisma };
