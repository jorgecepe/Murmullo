import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { db } from '../db/index.js';
import { generateToken, generateRefreshToken, authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().trim().isLength({ max: 255 })
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;

      // Check if user already exists
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const password_hash = await bcrypt.hash(password, salt);

      // Create user
      const user = await db.createUser({ email, password_hash, name });

      // Generate tokens
      const accessToken = generateToken(user.id);
      const refreshToken = generateRefreshToken(user.id);

      // Store refresh token
      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await db.storeRefreshToken(user.id, refreshToken, refreshExpiry);

      logger.info('New user registered', { userId: user.id, email: user.email });

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '7d'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Check if account is active
      if (!user.is_active) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate tokens
      const accessToken = generateToken(user.id);
      const refreshToken = generateRefreshToken(user.id);

      // Store refresh token
      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.storeRefreshToken(user.id, refreshToken, refreshExpiry);

      logger.info('User logged in', { userId: user.id });

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          usage_minutes: user.usage_minutes_this_month
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '7d'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh',
  [body('refreshToken').notEmpty()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { refreshToken } = req.body;

      // Validate refresh token
      const tokenData = await db.validateRefreshToken(refreshToken);
      if (!tokenData) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      // Get user
      const user = await db.getUserById(tokenData.user_id);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }

      // Revoke old refresh token
      await db.revokeRefreshToken(refreshToken);

      // Generate new tokens
      const newAccessToken = generateToken(user.id);
      const newRefreshToken = generateRefreshToken(user.id);

      // Store new refresh token
      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.storeRefreshToken(user.id, newRefreshToken, refreshExpiry);

      res.json({
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: '7d'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/auth/logout
 * Logout user (revoke refresh token)
 */
router.post('/logout',
  authenticate,
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await db.revokeRefreshToken(refreshToken);
      }

      logger.info('User logged out', { userId: req.user.id });

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);
    const stats = await db.getUserStats(req.user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        usage_minutes: user.usage_minutes_this_month,
        total_usage_minutes: user.total_usage_minutes,
        created_at: user.created_at
      },
      stats: {
        total_transcriptions: parseInt(stats.total_transcriptions) || 0,
        total_duration_seconds: parseFloat(stats.total_duration_seconds) || 0,
        total_words: parseInt(stats.total_words) || 0
      },
      limits: {
        plan: user.plan,
        minutes_used: user.usage_minutes_this_month,
        minutes_limit: getPlanLimit(user.plan),
        reset_date: getNextMonthStart()
      }
    });
  } catch (error) {
    next(error);
  }
});

function getPlanLimit(plan) {
  const limits = { free: 30, pro: 300, business: -1 };
  return limits[plan] || limits.free;
}

function getNextMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

export default router;
