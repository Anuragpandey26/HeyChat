import { Router } from 'express';
import { StatusController } from './status.controller.js';
import { authGuard } from '../../shared/middlewares/authGuard.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { createStatusSchema } from './status.schemas.js';
import { uploadSingle } from '../../shared/middlewares/uploadMiddleware.js';

const router = Router();
const controller = new StatusController();

router.use(authGuard);

router.get('/', controller.listStatuses);
router.post('/', uploadSingle('image'), validateRequest(createStatusSchema), controller.createStatus);
router.post('/:statusId/view', controller.viewStatus);
router.get('/:statusId/viewers', controller.getViewers);
router.delete('/:statusId', controller.deleteStatus);

export default router;

