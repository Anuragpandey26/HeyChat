import cacheService from '../services/cache.service.js';

export const rateLimiter = (prefix, limit, windowSeconds) => {
  return async (req, res, next) => {
    try {
      const identifier = req.body.email || req.ip;
      const key = `ratelimit:${prefix}:${identifier}`;
      
      const record = await cacheService.get(key);
      
      if (!record) {
        await cacheService.set(
          key,
          { count: 1, resetTime: Date.now() + windowSeconds * 1000 },
          windowSeconds
        );
        return next();
      }

      if (record.count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((record.resetTime - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({
          status: 'fail',
          message: `Too many requests. Please try again after ${retryAfter} seconds.`,
        });
      }

      const remainingTtl = Math.max(1, Math.ceil((record.resetTime - Date.now()) / 1000));
      await cacheService.set(
        key,
        { count: record.count + 1, resetTime: record.resetTime },
        remainingTtl
      );
      
      next();
    } catch (err) {
      console.error('Rate limiter cache error:', err);
      next();
    }
  };
};
