import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log request
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')?.substring(0, 50)
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel](`${req.method} ${req.path} ${res.statusCode}`, {
      duration: `${duration}ms`,
      userId: req.user?.id
    });
  });

  next();
}

export default requestLogger;
