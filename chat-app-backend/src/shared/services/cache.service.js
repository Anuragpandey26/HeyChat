import prisma from '../../core/database/prisma.singleton.js';

class CacheService {
  async get(key) {
    try {
      const cacheItem = await prisma.cache.findUnique({
        where: { key },
      });

      if (!cacheItem) return null;

      if (cacheItem.expiresAt && cacheItem.expiresAt < new Date()) {
        // Expired - delete asynchronously
        prisma.cache.delete({ where: { key } }).catch((err) => {
          console.error(`Failed to delete expired cache key ${key}:`, err);
        });
        return null;
      }

      return JSON.parse(cacheItem.value);
    } catch (err) {
      console.error(`Cache get error for key ${key}:`, err);
      return null;
    }
  }

  async set(key, value, ttlSeconds = null) {
    try {
      const stringified = JSON.stringify(value);
      const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;

      await prisma.cache.upsert({
        where: { key },
        update: {
          value: stringified,
          expiresAt,
        },
        create: {
          key,
          value: stringified,
          expiresAt,
        },
      });

      return true;
    } catch (err) {
      console.error(`Cache set error for key ${key}:`, err);
      return false;
    }
  }

  async delete(key) {
    try {
      await prisma.cache.delete({
        where: { key },
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  async clearExpired() {
    try {
      const result = await prisma.cache.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });
      return result.count;
    } catch (err) {
      console.error('Failed to clear expired cache:', err);
      return 0;
    }
  }
}

const cacheService = new CacheService();
export default cacheService;
