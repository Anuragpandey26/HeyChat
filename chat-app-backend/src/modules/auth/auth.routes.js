import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { rateLimiter } from '../../shared/middlewares/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  recoverVerifySchema,
  recoverResetSchema,
} from './auth.schemas.js';

const router = Router();
const controller = new AuthController();

router.post(
  '/register',
  rateLimiter('register', 15, 60 * 60), // 15 registrations per hour max
  validateRequest(registerSchema),
  controller.register
);

router.post(
  '/login',
  rateLimiter('login', 5, 60), // 5 login attempts per minute max
  validateRequest(loginSchema),
  controller.login
);

router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);

router.post(
  '/recover/verify',
  rateLimiter('recover-verify', 5, 15 * 60),
  validateRequest(recoverVerifySchema),
  controller.verifyRecovery
);

router.post(
  '/recover/reset',
  rateLimiter('recover-reset', 5, 15 * 60),
  validateRequest(recoverResetSchema),
  controller.resetPassword
);

export default router;
