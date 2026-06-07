# HeyChat — Full Codebase Context

## Project Overview

**HeyChat** is a full-stack real-time chat application with **end-to-end encryption (E2EE)**. It supports private 1-on-1 chats, group chats, ephemeral status updates, polls, reactions, delivery/seen ticks, media sharing, and user presence.

| Layer | Stack |
|---|---|
| Backend | Node.js (ESM), Express 5, Socket.io 4, Prisma 7, PostgreSQL |
| Frontend | React 19, Vite 8, Zustand 5, TailwindCSS 3, Socket.io-client 4 |
| E2EE Crypto | TweetNaCl (NaCl box) – `tweetnacl` + `tweetnacl-util` |
| Storage | Cloudinary (or MockStorageAdapter in dev) |
| Auth | HTTPOnly cookies (accessToken 15m + refreshToken 7d, rotation) |
| Queue | PostgreSQL-backed job queue (`JobQueue` table) |
| Cache | PostgreSQL-backed cache (`Cache` table via CacheService) |

---

## Repository Layout

```
CHATAPP/
├── chat-app-backend/
│   ├── prisma/schema.prisma          # Full DB schema
│   ├── prisma.config.js
│   └── src/
│       ├── app.js                    # Express app, CORS, routes, error handler
│       ├── server.js                 # HTTP server, Socket init, queue start, graceful shutdown
│       ├── core/
│       │   ├── config/env.config.js  # Zod-validated env vars
│       │   ├── database/prisma.singleton.js  # Prisma + pg Pool singleton
│       │   ├── errors/AppError.js    # Operational error class
│       │   └── events/eventBus.js    # Node.js EventEmitter singleton (decoupled pub/sub)
│       ├── modules/
│       │   ├── auth/                 # register, login, refresh, logout, password recovery
│       │   ├── chats/                # private/group chat CRUD + Socket listeners
│       │   ├── messages/             # message history, media upload, delete, socket handlers
│       │   ├── status/               # 24-hour statuses, views, likes
│       │   └── users/                # profile, avatar, search, block/unblock
│       └── shared/
│           ├── adapters/storage/     # CloudinaryAdapter, MockStorageAdapter, StorageAdapter (base)
│           ├── factories/StorageFactory.js
│           ├── middlewares/          # authGuard, rateLimiter, uploadMiddleware, validateRequest
│           ├── services/             # cache.service, fts.service, queue.service, socket.service
│           └── utils/jwt.utils.js
└── chat-app-frontend/
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                   # Renders <AppRouter />
        ├── app/
        │   ├── router.jsx            # BrowserRouter with ProtectedRoute / PublicRoute
        │   └── socket.js             # socket.io-client singleton (autoConnect: false)
        ├── features/
        │   ├── auth/
        │   │   ├── components/       # LoginForm, RegisterForm, SecurityQuestionRecovery
        │   │   └── store/useAuthStore.js
        │   ├── chats/
        │   │   ├── components/       # ChatList, ChatListItem, CreateChatModal
        │   │   └── store/useChatStore.js
        │   ├── messaging/
        │   │   ├── components/       # ChatWindow, ChatInput, ChatBubble
        │   │   ├── hooks/useSocketMessages.js
        │   │   └── store/useMessageStore.js
        │   ├── notifications/
        │   │   └── components/NotificationProvider.jsx
        │   └── status/
        │       ├── components/       # StatusTray, StatusUploadModal, StatusViewerModal
        │       └── store/useStatusStore.js
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Login.jsx
        │   ├── Profile.jsx
        │   └── GroupInvite.jsx
        └── shared/
            ├── components/ui/        # Button, Input, Modal, Textarea
            ├── lib/
            │   ├── apiClient.js      # Axios + silent token refresh interceptor
            │   └── crypto.js         # NaCl box encrypt/decrypt + deriveKeyPair
            └── utils/
                ├── cn.js             # className utility (clsx/twMerge)
                └── format.js         # formatLastSeen, date/time helpers
```

---

## Database Schema (Prisma / PostgreSQL)

### Models

| Model | Key Fields |
|---|---|
| `User` | id (uuid), username (unique), email (unique), fullName, bio, profilePictureUrl, passwordHash, **securityQuestionHash**, **publicKey**, isOnline, lastSeen |
| `RefreshToken` | id, userId, tokenHash (sha256), expiresAt |
| `Conversation` | id, chatType (PRIVATE\|GROUP) |
| `GroupDetails` | chatId (1-1 with Conversation), groupName, description, groupPhotoUrl, onlyAdminsCanSend |
| `Participant` | chatId + userId (PK), role (MEMBER\|ADMIN\|LEFT\|REMOVED), isPinned, joinedAt, leftAt, **clearedAt** |
| `Message` | id, chatId, senderId, **encryptedContent**, mediaUrl, mediaType, sentAt, editedAt, **isDeletedEveryone** |
| `Receipt` | messageId + recipientId (PK), status (SENT\|DELIVERED\|SEEN) |
| `MessageReaction` | id, messageId, userId, emoji |
| `Status` | id, userId, statusType (TEXT\|IMAGE\|VIDEO), encryptedContent, mediaUrl, backgroundColor, expiresAt |
| `StatusView` | statusId + viewerId (PK), isLiked, emoji, viewedAt |
| `BlockList` | blockerId + blockedId (PK) |
| `Poll` / `PollOption` / `PollVote` | Linked to Message |
| `Cache` | key (PK), value (JSON text), expiresAt |
| `JobQueue` | id, queueName, payload, status (PENDING\|PROCESSING\|COMPLETED\|FAILED), attempts, maxAttempts, runAt, lockedAt |

### Enums
- `ChatType`: PRIVATE, GROUP
- `ParticipantRole`: MEMBER, ADMIN, LEFT, REMOVED
- `MediaType`: TEXT, IMAGE, VIDEO, PDF, LINK, POLL
- `ReceiptStatus`: SENT, DELIVERED, SEEN
- `StatusType`: TEXT, IMAGE, VIDEO

---

## Backend Architecture

### Entry Points
- **[app.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/app.js)** — Express setup, CORS (allows `localhost:5173` + `FRONTEND_URL`), cookie-parser, route mounting, error handling middleware (handles Prisma P2002/P2025 codes)
- **[server.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/server.js)** — HTTP server creation, `socketService.init()`, queue handler registration (`purge_status`), `initChatsListeners()`, `queueService.start()`, graceful shutdown (SIGTERM/SIGINT)

### Core Layer
- **[env.config.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/core/config/env.config.js)** — Zod schema validates all required env vars on startup (exits on failure)
- **[prisma.singleton.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/core/database/prisma.singleton.js)** — `PrismaClient` with `PrismaPg` adapter (connection pooling via `pg.Pool`), uses `global.prisma` in dev to avoid reconnection on reload
- **[AppError.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/core/errors/AppError.js)** — Operational error with `isOperational: true`, `statusCode`, `status`
- **[eventBus.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/core/events/eventBus.js)** — Node.js `EventEmitter` singleton for decoupled internal pub/sub

### Shared Services
- **[socket.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/services/socket.service.js)** — `SocketService` class (singleton). Holds `userSockets: Map<userId, Set<socketId>>`. Auth middleware reads `accessToken` from cookie/auth header/query. Lazy-imports `messages.sockets.js` per connection. Listens to `eventBus` for `TICK_UPDATED`, `MESSAGE_DELETED`, `CHAT_DELETED`. Handles user presence DB update + cache invalidation on connect/disconnect.
- **[cache.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/services/cache.service.js)** — PostgreSQL-backed K/V cache (TTL-aware, JSON-serialized values, async expiry cleanup)
- **[queue.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/services/queue.service.js)** — PostgreSQL polling queue with `FOR UPDATE SKIP LOCKED`, retry backoff (linear), max attempts, PROCESSING/COMPLETED/FAILED status transitions
- **[fts.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/services/fts.service.js)** — PostgreSQL fuzzy user search using `ILIKE` + `pg_trgm` `similarity()` scoring

### Shared Middlewares
- **[authGuard.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/middlewares/authGuard.js)** — Reads `accessToken` cookie or `Authorization: Bearer` header. Checks token blacklist in cache. Loads user from DB. Attaches `req.user`.
- **[rateLimiter.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/middlewares/rateLimiter.js)** — PostgreSQL-cache-backed rate limiter factory (`rateLimiter(prefix, limit, windowSeconds)`)
- **[uploadMiddleware.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/middlewares/uploadMiddleware.js)** — Multer memory storage, 10MB cap, allowlist of MIME types
- **[validateRequest.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/middlewares/validateRequest.js)** — Zod schema validation (body + query + params), returns `400` with field-level errors

### Modules

#### Auth (`/api/auth`)
| Route | Handler | Notes |
|---|---|---|
| POST /register | `AuthController.register` | Rate-limited 15/hr. Hashes password + securityAnswer (bcrypt). Stores `publicKey`. Issues token pair. |
| POST /login | `AuthController.login` | Rate-limited 5/min. Returns user + sets HTTPOnly cookies. |
| POST /refresh | `AuthController.refresh` | Validates SHA-256 hashed refresh token. Token rotation (deletes old, creates new). |
| POST /logout | `AuthController.logout` | Blacklists access token in cache. Deletes refresh token. |
| POST /recover/verify | `AuthController.verifyRecovery` | Validates security answer (bcrypt). Issues 15-min recovery token in cache. |
| POST /recover/reset | `AuthController.resetPassword` | Validates recovery token from cache. Updates password hash + optionally `publicKey`. Revokes all refresh tokens. |

#### Chats (`/api/chats`)
- `listChats(userId)` — Cached (`chats:list:{userId}`, 1hr TTL). Respects `clearedAt` for message filtering. Includes unread count, lastMessage, online status, block info for private chats.
- `createPrivateChat` / `createGroupChat` — Emit `CHAT_CREATED` on eventBus. Group creation sends system message.
- `updateGroup` / `addMember` / `removeMemberOrLeave` — Admin-gated. System messages via `createSystemMessage()` which also emits `receive_message` socket event.
- `deleteChat(deleteType)` — `ME`: sets `clearedAt`; `EVERYONE`: hard-deletes conversation (cascades). Emits `CHAT_DELETED`.
- `getGroupPreview(chatId)` — Public info for join-link previews (no auth required on route).
- `joinGroup(userId, chatId)` — Re-activates LEFT/REMOVED participant. Invalidates all members' caches.
- `togglePinChat` — Flips `isPinned` on Participant.

#### Messages (`/api/messages`)
- `getHistory(userId, chatId, page, limit=30)` — Paginated, ordered desc, reversed before return. Filters by `clearedAt`. Includes sender, reactions, polls with votes.
- `getMediaGallery(userId, chatId)` — Groups messages by media type (images, videos, docs, links). Scrapes URLs from TEXT messages.
- `uploadMedia(fileBuffer, mimeType)` — Enforces per-type size limits. Delegates to `StorageFactory.getAdapter()`.
- `deleteForEveryone(userId, messageId)` — Sender (within 30 min) or group admin. Sets `isDeletedEveryone`, purges `encryptedContent`. Deletes from storage. Emits `MESSAGE_DELETED`.

#### Messages Sockets (`messages.sockets.js`)
| Socket Event | Description |
|---|---|
| `join_chats` | Verifies membership then joins `chat:{id}` rooms |
| `send_message` | Validates sender, checks group restrictions, checks blocklist, creates message + receipts in transaction, broadcasts `receive_message`, emits `receive_notification` (MENTION/@all for groups, direct for private) |
| `update_tick` | Updates `Receipt.status` (DELIVERED\|SEEN), emits `TICK_UPDATED` on eventBus |
| `read_conversation` | Bulk marks all messages as SEEN, emits `TICK_UPDATED` per message |
| `typing_start` / `typing_stop` | Re-emits `user_typing` to room |
| `delete_message` | Calls `MessagesService.deleteForEveryone` |
| `send_reaction` | Upsert/delete `MessageReaction`. Broadcasts `receive_reaction`. Emits reaction notification to sender. |
| `cast_vote` | Toggle PollVote. Broadcasts full `poll_updated` to room. |

#### Users (`/api/users`)
- `getMe` — Returns profile + list of group memberships
- `updateProfile` — Updates fullName, bio, phoneNumber, username. Emits `USER_PROFILE_UPDATED`.
- `updateAvatar` — Uploads to storage, updates DB, deletes old avatar
- `searchUser` — FTS via `fts.service.js` (PostgreSQL similarity)
- `getAllUsers` — All users except self (for contact directory)
- `blockUser` / `unblockUser` — Creates/deletes `BlockList` entry, invalidates both users' chat list caches
- `getBlockedUsers` — Returns list of blocked user profiles

#### Status (`/api/status`)
- `createStatus` — 24-hour TTL. Image only via file upload; TEXT has backgroundColor. Schedules `purge_status` job in queue (runs at `expiresAt`).
- `listStatuses` — Returns self statuses + active statuses of mutual contacts (shared private chat). Grouped by user with `viewed`, `isLiked`, `emoji`, `viewCount` (owner only).
- `viewStatus` — Upserts `StatusView` with optional like/emoji.
- `getStatusViewerList` — Only accessible by status owner.
- `deleteStatus` — Hard-deletes from DB (cascade removes views).

---

## Frontend Architecture

### State Management (Zustand stores)

| Store | Location | Responsibilities |
|---|---|---|
| `useAuthStore` | `features/auth/store` | user, privateKey, publicKey, isAuthenticated, login, register, logout, updateProfile, updateAvatar, initializeAuth (session check) |
| `useChatStore` | `features/chats/store` | chats[], activeChatId, fetchChats, selectChat, createPrivateChat, createGroupChat, togglePinChat, updateGroupSettings, addGroupMember, removeGroupMember, deleteChat, blockUser, unblockUser, searchUsers, fetchAllUsers |
| `useMessageStore` | `features/messaging/store` | messagesByChatId{}, typingUsersByChatId{}, fetchMessages, addMessage, deleteMessageForMe, deleteMessageLocally, updateTick, updateReaction, updatePoll, setTypingUsers |
| `useStatusStore` | `features/status/store` | statuses state, fetch/create/view/delete status actions |

### Routing
- `/login` — PublicRoute (redirects to `/` if authenticated)
- `/` — ProtectedRoute → `Dashboard`
- `/profile/:userId?` — ProtectedRoute → `Profile`
- `/join/:chatId` — Public → `GroupInvite` (group invite link handler)
- Wrapped in `NotificationProvider` (manages `receive_notification` socket events)

### Key Components

**`ChatWindow`** — Main chat view. Handles:
- Fetches message history + triggers `read_conversation` on open
- Renders `ChatBubble` list + `ChatInput`
- Slide-out info panel: shared media gallery (images/videos/docs/links), group settings (admin), member directory with kick/leave, block/unblock, delete chat

**`ChatInput`** — Message composition with:
- Text messages, emoji picker, file upload (image/video/PDF), link sending, poll creation
- E2EE encryption for private chats using `encryptMessage(plainText, recipientPublicKey, senderPrivateKey)`
- Typing indicators via socket events

**`ChatBubble`** — Renders individual messages:
- Decrypted content display, media previews, poll voting UI
- Emoji reactions (long-press/click), delete options
- Delivery tick status (SENT/DELIVERED/SEEN) indicator

**`useSocketMessages` hook** — Registers all socket event listeners for a chat:
- `receive_message` → `addMessage` (with E2EE decryption) + auto-emits `update_tick` SEEN
- `tick_updated` → `updateTick`
- `message_deleted` → `deleteMessageLocally`
- `user_typing` → `setTypingUsers`
- `receive_reaction` → `updateReaction`
- `poll_updated` → `updatePoll`
- `chat_deleted` → deselects chat + refetches

### E2EE Cryptography Model (`crypto.js`)

- **`deriveKeyPair(username, password)`** — Deterministic NaCl keypair from `username:password` seed using `nacl.hash()`. Private key stored in `sessionStorage` only.
- **`encryptMessage(plainText, recipientPublicKeyB64, senderPrivateKeyB64)`** — NaCl box (Curve25519 + XSalsa20 + Poly1305). Nonce prepended to ciphertext, Base64-encoded.
- **`decryptMessage(combinedB64, senderPublicKeyB64, recipientPrivateKeyB64)`** — Splits nonce + ciphertext, opens box. Returns `[Decryption Error]` on failure.

**Group chats are NOT E2EE** — content is sent as plaintext (MVP limitation noted in code comments).

### API Client (`apiClient.js`)
- Axios instance with `withCredentials: true` (HTTPOnly cookie auto-send)
- **Silent refresh interceptor**: On `401`, calls `POST /auth/refresh`. If that fails, dispatches `auth-expired` window event. Queue of failed requests to retry after refresh.

### Socket Client (`socket.js`)
- `socket.io-client` singleton with `autoConnect: false`, `withCredentials: true`, `transports: ['websocket']`
- `connectSocket()` / `disconnectSocket()` called on login/logout from `useAuthStore`

---

## Key Design Patterns & Gotchas

### Cache Invalidation
- `chats:list:{userId}` is invalidated on: message send, presence change, group member add/remove, block/unblock, chat delete, status creation
- Cache is PostgreSQL-backed — no Redis dependency

### Participant Roles
- `MEMBER` + `ADMIN` = active participants
- `LEFT` + `REMOVED` = past participants (shown in group directory, excluded from active queries)
- `clearedAt` on Participant — used to hide messages before the "delete for me" timestamp

### Token Security
- Access tokens: 15min, signed with `JWT_SECRET`
- Refresh tokens: 7 days, stored as SHA-256 hash in DB, rotated on each use
- Logout blacklists the access token in PostgreSQL cache for remaining TTL

### File Uploads
- Multer memory storage → Cloudinary (or Mock in dev)
- Per-type size limits enforced in `MessagesService.uploadMedia` using env vars

### PostgreSQL Queue (Status Purge)
- `purge_status` jobs scheduled at status `expiresAt`
- Worker polls every 5s (200ms between consecutive jobs), `FOR UPDATE SKIP LOCKED` for concurrency safety
- Linear retry backoff: `attempts * 60s`

### FTS / User Search
- PostgreSQL `pg_trgm` extension required (`similarity()` function)
- Scoring: exact match (2.0) > ILIKE (1.0) > trigram similarity (×1.5)

---

## Environment Variables (Backend)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Min 32 chars |
| `JWT_REFRESH_SECRET` | ✅ | Min 32 chars |
| `JWT_EXPIRY` | ✅ | Default `15m` |
| `JWT_ALGORITHM` | ✅ | Default `HS256` |
| `JWT_REFRESH_EXPIRY_DAYS` | ✅ | Default `7` |
| `PORT` | ❌ | Default `3000` |
| `NODE_ENV` | ❌ | `development`\|`production`\|`test` |
| `FRONTEND_URL` | ❌ | Production CORS origin |
| `CLOUDINARY_CLOUD_NAME` | ❌ | Falls back to MockStorageAdapter |
| `CLOUDINARY_API_KEY` | ❌ | |
| `CLOUDINARY_API_SECRET` | ❌ | |
| `MAX_IMAGE_SIZE_BYTES` | ❌ | Default `1024` |
| `MAX_PDF_SIZE_BYTES` | ❌ | Default `2097152` (2 MB) |
| `MAX_VIDEO_SIZE_BYTES` | ❌ | Default `5242880` (5 MB) |

## Frontend Env

| Variable | Default |
|---|---|
| `VITE_API_URL` | `http://localhost:3000/api` |
| `VITE_SOCKET_URL` | `http://localhost:3000` |
