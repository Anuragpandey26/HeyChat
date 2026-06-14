# heyChat 💬

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-blue?style=for-the-badge&logo=render)](https://heychat-1-9e1d.onrender.com/login)

heyChat is a premium, real-time messaging web application featuring a modern dark-mode user interface, end-to-end encryption (E2EE) security architecture, interactive voice notes, opinion polls, active stories (status updates), dynamic group channels, and real-time notifications.

🚀 **Live Deployment**: [heychat-1-9e1d.onrender.com/login](https://heychat-1-9e1d.onrender.com/login)

Built as a monorepo containing a **React-Vite** frontend and an **Express-PostgreSQL-Socket.io** backend, heyChat guarantees privacy, real-time sync, and rich user interactions.

---

## 🚀 Key Features

### 🔒 Modern Security & E2EE Cryptography
*   **End-to-End Encryption (E2EE)**: Direct private messages are encrypted client-side using Curve25519, XSalsa20, and Poly1305 (via TweetNaCl) before transmission. The server only sees ciphertext.
*   **Secure Authentication**: JWT-based cookie sessions (Access/Refresh token rotation with SHA-256 database hashing and blacklisting).
*   **Key Wrapping & Escrow Recovery**:
    *   One-time random client keypairs are generated upon registration.
    *   The private key is encrypted (wrapped) using a password-derived key and safely stored on the server (`wrappedPrivateKey`).
    *   An escrow wrapper (`securityEscrowKey`) is encrypted with the user's security question answer, allowing private key recovery and preservation of historic messages on password resets.
    *   Supports seamless background migration of legacy key derivation accounts.

### 💬 Real-Time Chats & Message Lifecycle
*   **Real-time Communication**: Instantly exchange private and group channel messages over persistent connections via **Socket.io**.
*   **Message Editing**:
    *   Users can edit their sent text messages within **48 hours**.
    *   Edits in private chats are re-encrypted on the client with the recipient's public key, preserving end-to-end encryption.
    *   Updates sync in real-time with an inline `(edited)` tag next to the timestamp.
*   **Delete for Everyone**: Purge messages and related media attachments globally within a **30-minute** window (or indefinitely for group administrators).
*   **Presence & Live Indicators**: Real-time online/offline indicators and global typing indicators (e.g., *"John is typing..."*) that sync globally across all conversations.
*   **Receipt Ticks**: Delivery status indicators showing `SENT`, `DELIVERED`, and `SEEN` states.
*   **Reactions**: Fast-click emoji picker reactions on chat messages with live socket broadcasts.

### 🎙 Rich Media & Interactive Polls
*   **Audio Voice Notes**: Native high-fidelity audio recording (up to 1 minute) with a pulsing recorder UI and elapsed timer. Integrated custom audio player featuring play/pause controls, seekable waveforms, and timeline trackers.
*   **File Attachments**: Upload and preview images, videos, and PDF documents within chats, backed by Cloudinary.
*   **Shared Media Hub**: Retrieve categorised list views of all images, videos, PDF documents, and URLs shared in any chat window.
*   **Interactive Polls**: Create opinion polls with real-time multi-choice voting, voter avatar stacks, and a results details modal.

### 📖 Ephemeral Status Updates (Stories)
*   **24-Hour Stories**: Share expiring text updates (with custom background colours) or photo updates.
*   **Views & Engagement**: Track views, likes, and custom status emojis from mutual contacts.
*   **PG Queue Consumer**: Driven by a database-backed background consumer that purges expired statuses automatically.

---

## 🛠 Tech Stack

### Frontend
*   **Core**: React 19, Vite 8
*   **State Management**: Zustand 5
*   **Routing**: React Router DOM (v7)
*   **Real-Time Gateway**: Socket.io Client (v4)
*   **Encryption**: TweetNaCl
*   **Styling**: TailwindCSS (v3) + CSS variables (cyber dark-mode)
*   **Icons**: Lucide React

### Backend
*   **Runtime & Server**: Node.js (ESM), Express.js (v5)
*   **Database**: PostgreSQL
*   **ORM**: Prisma ORM (v7)
*   **Real-time Gateway**: Socket.io (v4)
*   **Media Storage**: Cloudinary (via Multer middleware)
*   **Validation**: Zod Schemas
*   **Background Jobs**: PostgreSQL-backed `JobQueue`

---

## 📂 Project Architecture

```
HeyChat/
├── chat-app-frontend/         # Vite React Client
│   ├── public/                # Static assets (favicons, logos)
│   └── src/
│       ├── app/               # Router & App entry, Socket.io client initialization
│       ├── assets/            # Styling variables and design system tokens
│       ├── features/          # Feature domains
│       │   ├── auth/          # Authentication, login/register UI, key-wrapping store
│       │   ├── chats/         # Conversations list, group management modals
│       │   ├── messaging/     # Chat window, text inputs, voice recorder, E2EE hook
│       │   └── status/        # Expiring stories and views tray
│       └── shared/            # Common layout components, Axios clients, and NaCl crypto helper
│
└── chat-app-backend/          # Express API & Socket.io Gateway
    ├── prisma/                # Prisma Schema (schema.prisma) and SQL Migrations
    └── src/
        ├── core/              # Config (Zod validated), PG singletons, and EventBus emitter
        ├── modules/           # API routes, business service logic, and socket controllers
        └── shared/            # Cloudinary adapters, polling queue workers, and rate-limiters
```

---

## ⚙️ Getting Started

### Prerequisites
*   Node.js (v18 or higher recommended)
*   PostgreSQL running locally or hosted

---

### Step 1: Backend Setup

1.  Navigate to the backend directory:
    ```bash
    cd chat-app-backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in `chat-app-backend/`:
    ```env
    PORT=3000
    NODE_ENV=development

    # PostgreSQL Connection String
    DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<database_name>"

    # Authentication Secrets
    JWT_SECRET="generate_a_long_secure_symmetric_string_min_32_chars"
    JWT_REFRESH_SECRET="generate_another_long_secure_symmetric_string_min_32_chars"
    JWT_EXPIRY="15m"
    JWT_ALGORITHM="HS256"
    JWT_REFRESH_EXPIRY_DAYS=7

    # Max attachment file size limits
    MAX_IMAGE_SIZE_BYTES=1048576 # 1 MB
    MAX_PDF_SIZE_BYTES=2097152   # 2 MB
    MAX_VIDEO_SIZE_BYTES=5242880 # 5 MB
    MAX_AUDIO_SIZE_BYTES=2097152 # 2 MB

    # Cloudinary Media Storage details (Falls back to MockStorageAdapter in development if omitted)
    CLOUDINARY_CLOUD_NAME="your_cloud_name"
    CLOUDINARY_API_KEY="your_api_key"
    CLOUDINARY_API_SECRET="your_api_secret"
    ```
4.  Generate the Prisma client:
    ```bash
    npm run db:generate
    ```
5.  Apply database migrations to PostgreSQL:
    ```bash
    npm run db:migrate
    ```
6.  Start the development server (runs nodemon on port 3000):
    ```bash
    npm run dev
    ```

---

### Step 2: Frontend Setup

1.  Open a new terminal and navigate to the frontend directory:
    ```bash
    cd chat-app-frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in `chat-app-frontend/`:
    ```env
    VITE_API_URL=http://localhost:3000/api
    VITE_SOCKET_URL=http://localhost:3000
    ```
4.  Start the frontend development server:
    ```bash
    npm run dev
    ```
5.  Open your browser and navigate to `http://localhost:5173`.

---

## 🏗 Operations & Database Tools

*   **Prisma Studio**: View and edit database tables visually:
    ```bash
    cd chat-app-backend
    npm run db:studio
    ```
*   **PostgreSQL Queue Worker**: The backend hosts a PG polling task consumer (polling every 5 seconds) to clean up expired status models.
*   **Token Verification & Axios Interceptor**: The frontend `apiClient` manages silent refresh flows on `401` HTTP statuses using cookie-based token rotation.
