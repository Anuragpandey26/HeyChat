import { ChatsService } from './chats.service.js';

const chatsService = new ChatsService();

export class ChatsController {
  async listChats(req, res, next) {
    try {
      const chats = await chatsService.listChats(req.user.id);
      res.status(200).json({
        status: 'success',
        data: { chats },
      });
    } catch (err) {
      next(err);
    }
  }

  async getGroupMembers(req, res, next) {
    try {
      const { chatId } = req.params;
      const members = await chatsService.getGroupMembers(req.user.id, chatId);
      res.status(200).json({
        status: 'success',
        data: { members },
      });
    } catch (err) {
      next(err);
    }
  }

  async createPrivateChat(req, res, next) {
    try {
      const { targetUserId } = req.body;
      const result = await chatsService.createPrivateChat(req.user.id, targetUserId);

      res.status(201).json({
        status: 'success',
        message: result.isNew ? 'Private chat created successfully' : 'Existing conversation loaded',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async createGroupChat(req, res, next) {
    try {
      const { groupName, participantIds, description } = req.body;
      const result = await chatsService.createGroupChat(
        req.user.id,
        groupName,
        participantIds,
        description
      );

      res.status(201).json({
        status: 'success',
        message: 'Group created successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateGroup(req, res, next) {
    try {
      const { chatId } = req.params;
      await chatsService.updateGroup(req.user.id, chatId, req.body);

      res.status(200).json({
        status: 'success',
        message: 'Group updated successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async addMember(req, res, next) {
    try {
      const { chatId } = req.params;
      const { userIdToAdd } = req.body;
      await chatsService.addMember(req.user.id, chatId, userIdToAdd);

      res.status(200).json({
        status: 'success',
        message: 'Member added to group successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async removeMemberOrLeave(req, res, next) {
    try {
      const { chatId, id } = req.params;
      await chatsService.removeMemberOrLeave(req.user.id, chatId, id);

      const message = req.user.id === id ? 'You left the group' : 'Member removed from group';
      res.status(200).json({
        status: 'success',
        message,
      });
    } catch (err) {
      next(err);
    }
  }

  async togglePinChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const isPinned = await chatsService.togglePinChat(req.user.id, chatId);

      res.status(200).json({
        status: 'success',
        message: isPinned ? 'Conversation pinned' : 'Conversation unpinned',
        data: { isPinned },
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteChat(req, res, next) {
    try {
      const { chatId } = req.params;
      const { deleteType } = req.body; // 'ME' | 'EVERYONE'

      const result = await chatsService.deleteChat(req.user.id, chatId, deleteType);

      res.status(200).json({
        status: 'success',
        message: result.status === 'deleted_everyone' 
          ? 'Conversation deleted for everyone successfully' 
          : 'Conversation cleared for you successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getGroupPreview(req, res, next) {
    try {
      const { chatId } = req.params;
      const group = await chatsService.getGroupPreview(chatId);

      res.status(200).json({
        status: 'success',
        data: { group },
      });
    } catch (err) {
      next(err);
    }
  }

  async joinGroup(req, res, next) {
    try {
      const { chatId } = req.params;
      await chatsService.joinGroup(req.user.id, chatId);

      res.status(200).json({
        status: 'success',
        message: 'Joined group successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
