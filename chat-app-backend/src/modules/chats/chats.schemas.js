import { z } from 'zod';

export const createPrivateChatSchema = z.object({
  body: z.object({
    targetUserId: z.string().uuid('Invalid target user ID'),
  }),
});

export const createGroupChatSchema = z.object({
  body: z.object({
    groupName: z.string().min(1, 'Group name is required').max(100),
    description: z.string().max(500).optional().nullable(),
    participantIds: z.array(z.string().uuid('Invalid participant ID')).min(1, 'At least one participant must be added'),
  }),
});

export const updateGroupChatSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
  body: z.object({
    groupName: z.string().min(1, 'Group name cannot be empty').max(100).optional(),
    description: z.string().max(500).optional().nullable(),
    onlyAdminsCanSend: z.boolean().optional(),
    groupPhotoUrl: z.string().optional().nullable(),
  }),
});

export const addMemberSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
  body: z.object({
    userIdToAdd: z.string().uuid('Invalid user ID'),
  }),
});

export const removeMemberSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
    id: z.string().uuid('Invalid member ID'),
  }),
});

export const deleteChatSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
  body: z.object({
    deleteType: z.enum(['ME', 'EVERYONE'], { required_error: 'Delete type is required' }),
  }),
});

export const getGroupPreviewSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
});

export const joinGroupSchema = z.object({
  params: z.object({
    chatId: z.string().uuid('Invalid chat ID'),
  }),
});

