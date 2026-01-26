import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { subscriptionMiddleware } from '../middleware/subscription.js';
import { llmRateLimit, dailyLimitMiddleware } from '../middleware/rateLimit.js';
import { chat, Message } from '../services/llmService.js';

const router = Router();

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(10000),
    })
  ).min(1).max(50),
  blockedUrl: z.string().url('Invalid blocked URL'),
});

router.post(
  '/chat',
  authMiddleware,
  subscriptionMiddleware,
  llmRateLimit,
  dailyLimitMiddleware(200),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = chatSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: result.error.errors[0].message });
        return;
      }

      const { messages, blockedUrl } = result.data;

      const response = await chat(messages as Message[], blockedUrl);

      res.json({ response });
    } catch (error) {
      console.error('LLM chat error:', error);

      // Handle Anthropic API errors
      if (error instanceof Error) {
        if (error.message.includes('rate limit')) {
          res.status(429).json({
            error: 'Service is busy. Please try again in a moment.',
            code: 'LLM_RATE_LIMIT',
          });
          return;
        }
        if (error.message.includes('invalid_api_key')) {
          res.status(500).json({
            error: 'Service configuration error. Please contact support.',
            code: 'LLM_CONFIG_ERROR',
          });
          return;
        }
      }

      res.status(500).json({ error: 'Failed to get response from LLM' });
    }
  }
);

export default router;
