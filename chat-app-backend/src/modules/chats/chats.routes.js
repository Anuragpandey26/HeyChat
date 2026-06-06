import { Router } from 'express';
import { ChatsController } from './chats.controller.js';
import { authGuard } from '../../shared/middlewares/authGuard.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import {
  createPrivateChatSchema,
  createGroupChatSchema,
  updateGroupChatSchema,
  addMemberSchema,
  removeMemberSchema,
  deleteChatSchema,
  getGroupPreviewSchema,
  joinGroupSchema,
} from './chats.schemas.js';

const router = Router();
const controller = new ChatsController();

// Public route - group preview for invite link (does not require authentication)
router.get('/group-preview/:chatId', validateRequest(getGroupPreviewSchema), controller.getGroupPreview);

router.use(authGuard);

router.get('/', controller.listChats);
router.get('/group/:chatId/members', controller.getGroupMembers);
router.post('/private', validateRequest(createPrivateChatSchema), controller.createPrivateChat);
router.post('/group', validateRequest(createGroupChatSchema), controller.createGroupChat);
router.patch('/group/:chatId', validateRequest(updateGroupChatSchema), controller.updateGroup);
router.post('/group/:chatId/members', validateRequest(addMemberSchema), controller.addMember);
router.post('/group/:chatId/join', validateRequest(joinGroupSchema), controller.joinGroup);
router.delete('/group/:chatId/members/:id', validateRequest(removeMemberSchema), controller.removeMemberOrLeave);
router.put('/:chatId/pin', controller.togglePinChat);
router.delete('/:chatId', validateRequest(deleteChatSchema), controller.deleteChat);

export default router;
