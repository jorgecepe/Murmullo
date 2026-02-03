import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

/**
 * GET /health/detailed
 * Detailed health check including database
 */
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // Check database connection
  try {
    await db.query('SELECT 1');
    health.checks.database = { status: 'ok' };
  } catch (error) {
    health.status = 'degraded';
    health.checks.database = { status: 'error', message: error.message };
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    status: 'ok',
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
  };

  // Check uptime
  health.checks.uptime = {
    status: 'ok',
    seconds: Math.round(process.uptime())
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
