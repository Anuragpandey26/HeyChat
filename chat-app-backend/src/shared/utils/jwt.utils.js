import jwt from 'jsonwebtoken';
import { env } from '../../core/config/env.config.js';

export const signAccessToken = (userId, role = 'MEMBER') => {
  return jwt.sign(
    { sub: userId, role },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRY,
      algorithm: env.JWT_ALGORITHM,
    }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: [env.JWT_ALGORITHM],
  });
};

export const decodeToken = (token) => {
  return jwt.decode(token);
};
