import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Admin authentication middleware
 * Requires ADMIN_SECRET header
 */
function adminAuth(req, res, next) {
  const adminSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret) {
    logger.error('ADMIN_SECRET not configured');
    return res.status(500).json({ error: 'Admin endpoint not configured' });
  }

  if (!adminSecret || adminSecret !== expectedSecret) {
    logger.warn('Unauthorized admin access attempt', { ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * POST /api/v1/admin/set-plan
 * Set user plan (requires admin secret)
 */
router.post('/set-plan',
  adminAuth,
  [
    body('email').isEmail().normalizeEmail(),
    body('plan').isIn(['free', 'pro', 'business'])
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, plan } = req.body;

      // Find user by email
      const userResult = await db.query(
        'SELECT id, email, plan FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const oldPlan = user.plan;

      // Update plan
      await db.updateUserPlan(user.id, plan);

      logger.info('Admin: User plan updated', {
        email,
        oldPlan,
        newPlan: plan
      });

      res.json({
        message: 'Plan updated successfully',
        user: {
          id: user.id,
          email: user.email,
          oldPlan,
          newPlan: plan
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/reset-usage
 * Reset monthly usage for a user (requires admin secret)
 */
router.post('/reset-usage',
  adminAuth,
  [body('email').isEmail().normalizeEmail()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;

      const result = await db.query(
        `UPDATE users
         SET usage_minutes_this_month = 0, updated_at = NOW()
         WHERE email = $1
         RETURNING id, email, usage_minutes_this_month`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('Admin: User usage reset', { email });

      res.json({
        message: 'Usage reset successfully',
        user: result.rows[0]
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/users
 * List all users (requires admin secret)
 */
router.get('/users', adminAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, plan, usage_minutes_this_month,
              total_usage_minutes, is_active, created_at, last_usage_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({
      count: result.rows.length,
      users: result.rows
    });

  } catch (error) {
    next(error);
  }
});

export default router;
