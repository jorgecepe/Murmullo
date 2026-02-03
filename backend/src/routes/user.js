import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/user/profile
 * Get user profile
 */
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      created_at: user.created_at,
      last_usage_at: user.last_usage_at
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/user/profile
 * Update user profile
 */
router.put('/profile',
  authenticate,
  [
    body('name').optional().trim().isLength({ max: 255 })
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name } = req.body;

      await db.query(
        'UPDATE users SET name = COALESCE($2, name), updated_at = NOW() WHERE id = $1',
        [req.user.id, name]
      );

      const user = await db.getUserById(req.user.id);

      logger.info('User profile updated', { userId: req.user.id });

      res.json({
        message: 'Profile updated',
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/user/password
 * Change password
 */
router.put('/password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;

      const user = await db.getUserById(req.user.id);

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const newHash = await bcrypt.hash(newPassword, salt);

      // Update password
      await db.query(
        'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1',
        [req.user.id, newHash]
      );

      logger.info('User password changed', { userId: req.user.id });

      res.json({ message: 'Password updated successfully' });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/user/subscription
 * Get subscription info
 */
router.get('/subscription', authenticate, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);

    const plans = {
      free: {
        name: 'Free',
        price: 0,
        minutes_limit: 30,
        features: ['30 minutes/month', 'Basic transcription', 'Email support']
      },
      pro: {
        name: 'Pro',
        price: 9.99,
        minutes_limit: 300,
        features: ['300 minutes/month', 'AI text processing', 'Priority support', 'History export']
      },
      business: {
        name: 'Business',
        price: 24.99,
        minutes_limit: -1,
        features: ['Unlimited minutes', 'AI text processing', 'Priority support', 'API access', 'Team features']
      }
    };

    const currentPlan = plans[user.plan] || plans.free;

    res.json({
      current_plan: user.plan,
      plan_details: currentPlan,
      usage: {
        minutes_used: parseFloat(user.usage_minutes_this_month) || 0,
        minutes_limit: currentPlan.minutes_limit,
        reset_date: getNextMonthStart()
      },
      available_plans: plans
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/user/upgrade
 * Request plan upgrade (placeholder for Stripe integration)
 */
router.post('/upgrade',
  authenticate,
  [body('plan').isIn(['pro', 'business'])],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { plan } = req.body;

      // TODO: Integrate with Stripe for payment
      // For now, just return the checkout URL placeholder

      logger.info('Plan upgrade requested', { userId: req.user.id, plan });

      res.json({
        message: 'Upgrade request received',
        redirect_url: `/checkout?plan=${plan}`,
        note: 'Stripe integration pending'
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/user/account
 * Delete user account (GDPR compliance)
 */
router.delete('/account',
  authenticate,
  [body('password').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { password } = req.body;

      const user = await db.getUserById(req.user.id);

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(400).json({ error: 'Password is incorrect' });
      }

      // Delete user (cascades to related tables)
      await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);

      logger.info('User account deleted', { userId: req.user.id, email: user.email });

      res.json({ message: 'Account deleted successfully' });

    } catch (error) {
      next(error);
    }
  }
);

function getNextMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

export default router;
