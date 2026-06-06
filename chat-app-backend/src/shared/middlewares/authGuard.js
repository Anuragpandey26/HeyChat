import { verifyAccessToken } from '../utils/jwt.utils.js';
import { AppError } from '../../core/errors/AppError.js';
import prisma from '../../core/database/prisma.singleton.js';
import cacheService from '../services/cache.service.js';

export const authGuard = async (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return next(new AppError('Invalid token or token expired.', 401));
    }

    // Check if token is blacklisted (logged out)
    const isBlacklisted = await cacheService.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new AppError('Session expired. Please log in again.', 401));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        bio: true,
        profilePictureUrl: true,
        publicKey: true,
      },
    });

    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
