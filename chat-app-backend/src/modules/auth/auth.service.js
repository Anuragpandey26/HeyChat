import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../../core/database/prisma.singleton.js';
import { env } from '../../core/config/env.config.js';
import { AppError } from '../../core/errors/AppError.js';
import cacheService from '../../shared/services/cache.service.js';
import { signAccessToken, decodeToken } from '../../shared/utils/jwt.utils.js';

export class AuthService {
  constructor(db = prisma, cache = cacheService) {
    this.db = db;
    this.cache = cache;
  }

  async generateTokens(userId) {
    const accessToken = signAccessToken(userId);

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  async register(data) {
    const existingEmail = await this.db.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      throw new AppError('Email address is already in use', 400);
    }

    const existingUsername = await this.db.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) {
      throw new AppError('Username is already taken', 400);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const securityQuestionHash = await bcrypt.hash(data.securityQuestionHash, 12);

    const user = await this.db.user.create({
      data: {
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        phoneNumber: data.phoneNumber || null,
        bio: data.bio || null,
        passwordHash,
        securityQuestionHash,
        publicKey: data.publicKey,
        wrappedPrivateKey: data.wrappedPrivateKey || null,
        securityEscrowKey: data.securityEscrowKey || null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(email, password) {
    const user = await this.db.user.findUnique({
      where: { email },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError('Incorrect email or password', 401);
    }

    const tokens = await this.generateTokens(user.id);
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        wrappedPrivateKey: user.wrappedPrivateKey || null,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await this.db.refreshToken.findFirst({
      where: {
        tokenHash,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!storedToken) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    // Revoke old refresh token (Rotation)
    await this.db.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Generate new pair
    const tokens = await this.generateTokens(storedToken.userId);
    return tokens;
  }

  async logout(accessToken, refreshToken) {
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await this.db.refreshToken.deleteMany({
        where: { tokenHash },
      });
    }

    if (accessToken) {
      try {
        const decoded = decodeToken(accessToken);
        if (decoded && decoded.exp) {
          const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
          if (remainingTtl > 0) {
            await this.cache.set(`blacklist:${accessToken}`, true, remainingTtl);
          }
        }
      } catch (err) {
        // Ignore
      }
    }

    return true;
  }

  async verifySecurityQuestion(email, securityAnswer) {
    const user = await this.db.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('No user found with that email address', 404);
    }

    const isMatch = await bcrypt.compare(securityAnswer, user.securityQuestionHash);
    if (!isMatch) {
      throw new AppError('Incorrect answer to security question', 400);
    }

    const recoveryToken = crypto.randomBytes(32).toString('hex');
    await this.cache.set(`recovery:${email}`, recoveryToken, 15 * 60); // 15 mins

    return {
      recoveryToken,
      username: user.username,
      securityEscrowKey: user.securityEscrowKey || null,
    };
  }

  async resetPassword(email, recoveryToken, newPassword, wrappedPrivateKey = null, securityEscrowKey = null) {
    const cachedToken = await this.cache.get(`recovery:${email}`);
    if (!cachedToken || cachedToken !== recoveryToken) {
      throw new AppError('Invalid or expired recovery session', 400);
    }

    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError('User no longer exists', 404);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const updateData = {
      passwordHash,
    };

    // Key wrapping: update the wrapped private key (re-wrapped with new password)
    // Public key stays the same — only the wrapping changes
    if (wrappedPrivateKey) {
      updateData.wrappedPrivateKey = wrappedPrivateKey;
    }
    if (securityEscrowKey) {
      updateData.securityEscrowKey = securityEscrowKey;
    }

    await this.db.$transaction([
      this.db.user.update({
        where: { email },
        data: updateData,
      }),
      this.db.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    await this.cache.delete(`recovery:${email}`);
    return true;
  }
}
