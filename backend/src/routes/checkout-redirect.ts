import { Router, Request, Response } from 'express';

const router = Router();

// Common styles for both pages
const commonStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e0e0e0;
  }
  .container {
    text-align: center;
    padding: 40px;
    max-width: 480px;
  }
  .icon {
    font-size: 64px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 28px;
    margin-bottom: 16px;
    color: #fff;
  }
  p {
    font-size: 16px;
    line-height: 1.6;
    margin-bottom: 12px;
    color: #b0b0b0;
  }
  .highlight {
    color: #4ade80;
    font-weight: 500;
  }
  .instructions {
    margin-top: 32px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .instructions p {
    margin-bottom: 0;
  }
`;

// Success page HTML
const successHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Successful - LLM Time Blocker</title>
  <style>${commonStyles}
    .success-icon {
      color: #4ade80;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon success-icon">&#10003;</div>
    <h1>Subscription Successful!</h1>
    <p>Thank you for subscribing to <span class="highlight">LLM Time Blocker Pro</span>.</p>
    <p>Your subscription is now active and you have full access to all features.</p>
    <div class="instructions">
      <p>You can now close this tab and return to the extension popup to see your updated subscription status.</p>
    </div>
  </div>
</body>
</html>
`;

// Cancel page HTML
const cancelHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout Canceled - LLM Time Blocker</title>
  <style>${commonStyles}
    .cancel-icon {
      color: #f87171;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon cancel-icon">&#10007;</div>
    <h1>Checkout Canceled</h1>
    <p>Your subscription checkout was canceled.</p>
    <p>No charges have been made to your account.</p>
    <div class="instructions">
      <p>You can close this tab and return to the extension popup to try again when you're ready.</p>
    </div>
  </div>
</body>
</html>
`;

// GET /checkout/success
router.get('/success', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(successHtml);
});

// GET /checkout/cancel
router.get('/cancel', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(cancelHtml);
});

export default router;
