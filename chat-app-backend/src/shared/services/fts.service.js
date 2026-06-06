import prisma from '../../core/database/prisma.singleton.js';

class FtsService {
  constructor(db = prisma) {
    this.db = db;
  }

  async searchUsers(query, excludeUserId, limit = 20) {
    if (!query || query.trim() === '') return [];
    
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    return this.db.$queryRaw`
      SELECT id, username, "fullName", "profilePictureUrl", bio, "publicKey", "isOnline", "lastSeen",
        (
          (CASE WHEN LOWER(username) = LOWER(${cleanQuery}) THEN 2.0 ELSE 0.0 END) +
          (CASE WHEN LOWER("fullName") = LOWER(${cleanQuery}) THEN 2.0 ELSE 0.0 END) +
          (CASE WHEN username ILIKE ${'%' + cleanQuery + '%'} THEN 1.0 ELSE 0.0 END) +
          (CASE WHEN "fullName" ILIKE ${'%' + cleanQuery + '%'} THEN 1.0 ELSE 0.0 END) +
          similarity(username, ${cleanQuery}) * 1.5 +
          similarity("fullName", ${cleanQuery}) * 1.5
        ) AS score
      FROM "User"
      WHERE id != ${excludeUserId}::uuid
        AND (
          username ILIKE ${'%' + cleanQuery + '%'}
          OR "fullName" ILIKE ${'%' + cleanQuery + '%'}
          OR similarity(username, ${cleanQuery}) > 0.15
          OR similarity("fullName", ${cleanQuery}) > 0.15
        )
      ORDER BY score DESC
      LIMIT ${limit};
    `;
  }
}

const ftsService = new FtsService();
export default ftsService;
