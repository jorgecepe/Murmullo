import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token and attach user to request
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user from database
    const user = await db.getUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      plan: user.plan,
      usage_minutes: user.usage_minutes_this_month,
      plan_limit: getPlanLimit(user.plan)
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(error);
  }
}

/**
 * Middleware to check if user has enough usage quota
 */
export function checkUsageQuota(req, res, next) {
  const { usage_minutes, plan_limit } = req.user;

  if (plan_limit !== -1 && usage_minutes >= plan_limit) {
    return res.status(429).json({
      error: 'Usage limit reached',
      message: `You have used ${usage_minutes} minutes of your ${plan_limit} minute monthly limit. Please upgrade your plan.`,
      upgrade_url: '/pricing'
    });
  }

  next();
}

/**
 * Get plan limits in minutes per month
 */
function getPlanLimit(plan) {
  const limits = {
    free: 30,      // 30 minutes/month
    pro: 300,      // 300 minutes/month (5 hours)
    business: -1   // Unlimited
  };
  return limits[plan] || limits.free;
}

/**
 * Generate JWT token for user
 */
export function generateToken(userId, expiresIn = '7d') {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId) {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export default { authenticate, checkUsageQuota, generateToken, generateRefreshToken };
