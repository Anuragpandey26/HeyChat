import { Router } from 'express';
import { UsersController } from './users.controller.js';
import { authGuard } from '../../shared/middlewares/authGuard.js';
import { uploadSingle } from '../../shared/middlewares/uploadMiddleware.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { updateProfileSchema } from './users.schemas.js';

const router = Router();
const controller = new UsersController();

router.use(authGuard);

router.get('/me', controller.getMe);
router.patch('/me', validateRequest(updateProfileSchema), controller.updateProfile);
router.put('/me/avatar', uploadSingle('avatar'), controller.updateAvatar);
router.get('/list/all', controller.listAllUsers);
router.post('/block', controller.blockUser);
router.post('/unblock', controller.unblockUser);
router.get('/blocked', controller.getBlockedUsers);
router.get('/profile/:userId', controller.getUserProfile);
router.get('/:username', controller.searchUser);

export default router;
