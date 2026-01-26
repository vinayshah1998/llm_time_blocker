import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from './auth.js';

// Per-user rate limiting for LLM endpoint
export const llmRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  keyGenerator: (req) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.userId || req.ip || 'anonymous';
  },
  message: {
    error: 'Rate limit exceeded. Please wait before sending more messages.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Daily limit per user
const dailyUsage = new Map<string, { count: number; resetAt: number }>();

export function dailyLimitMiddleware(maxDaily: number = 200) {
  return (req: AuthenticatedRequest, res: any, next: any) => {
    if (!req.userId) {
      return next();
    }

    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);
    const tomorrow = today + 24 * 60 * 60 * 1000;

    let usage = dailyUsage.get(req.userId);

    if (!usage || usage.resetAt < now) {
      usage = { count: 0, resetAt: tomorrow };
      dailyUsage.set(req.userId, usage);
    }

    if (usage.count >= maxDaily) {
      return res.status(429).json({
        error: 'Daily limit exceeded. Please try again tomorrow.',
        code: 'DAILY_LIMIT_EXCEEDED'
      });
    }

    usage.count++;
    next();
  };
}

// Auth endpoint rate limiting
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
