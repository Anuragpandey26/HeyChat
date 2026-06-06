import { Router } from 'express';
import { MessagesController } from './messages.controller.js';
import { authGuard } from '../../shared/middlewares/authGuard.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { uploadSingle } from '../../shared/middlewares/uploadMiddleware.js';
import { getMessagesSchema, getMediaGallerySchema } from './messages.schemas.js';

const router = Router();
const controller = new MessagesController();

router.use(authGuard);

router.get('/:chatId', validateRequest(getMessagesSchema), controller.getHistory);
router.get('/:chatId/media', validateRequest(getMediaGallerySchema), controller.getMediaGallery);
router.post('/upload', uploadSingle('file'), controller.uploadMedia);

export default router;
