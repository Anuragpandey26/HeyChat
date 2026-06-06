# heyChat 💬

heyChat is a premium, real-time messaging web application featuring a modern dark-mode user interface, real-time chats, active status (stories) system, notifications, group channels, profile settings, and robust privacy layers.

The project is built as a monorepo containing a React-Vite frontend and an Express-PostgreSQL-Socket.io backend.

---

## 🚀 Key Features

*   **Real-time Communication**: Instantly send and receive messages with live active statuses using **Socket.io**.
*   **Presence Tracking**: Live online/offline status indicators for all users in your directory.
*   **Secure Accounts**: Robust authentication with cookie-based JWT sessions, password hashing (bcrypt), and account recovery via security questions.
*   **Dynamic Group Chats**: Create custom group channels, manage member roles, and generate shareable group invite links.
*   **Rich Media Attachments**: Upload and preview photos, videos, and PDF documents within chats, integrated with **Cloudinary**.
*   **Shared Media Gallery**: Access a categorized hub of all media, documents, and links shared in any private conversation.
*   **Expiring Stories (Status Updates)**: Post text or photo updates that automatically expire after 24 hours (driven by a background queue database consumer).
*   **Privacy & Encryption**: Built-in cryptographic key pair derivation (TweetNaCl) running under the hood to ensure message payload privacy.

---

## 🛠 Tech Stack

### Frontend
*   **Core**: React 19, Vite
*   **State Management**: Zustand
*   **Routing**: React Router DOM (v7)
*   **Real-time Layer**: Socket.io Client
*   **Styling**: TailwindCSS (v3) + CSS variables (modern dark cyber-theme)
*   **Icons**: Lucide React
*   **Encryption**: TweetNaCl

### Backend
*   **Runtime & Server**: Node.js, Express.js (v5)
*   **Database**: PostgreSQL
*   **ORM**: Prisma ORM
*   **Real-time Gateway**: Socket.io
*   **Media Storage**: Cloudinary (via Multer middleware)
*   **Validation**: Zod Schemas

---

## 📂 Project Architecture

```
HeyChat/
├── chat-app-frontend/         # Vite React Client
│   ├── public/                # Static assets (favicons, logos)
│   └── src/
│       ├── app/               # Router & App entry
│       ├── assets/            # App images & icons
│       ├── features/          # Core modules (auth, chats, messaging, status, notifications)
│       ├── pages/             # Page view containers (Login, Profile, GroupInvite, Dashboard)
│       └── shared/            # Reusable UI components, hooks, utilities, and API clients
│
└── chat-app-backend/          # Express API & Web Socket Server
    ├── prisma/                # PostgreSQL schema & database migrations
    └── src/
        ├── core/              # Database connections, config, and system middleware
        ├── modules/           # Module controllers, routes, schemas, and event listeners
        └── shared/            # Shared adapters (Cloudinary storage), queue workers, and socket services
```

---

## ⚙️ Getting Started

### Prerequisites
*   Node.js (v18 or higher recommended)
*   PostgreSQL instance running locally or hosted

---

### Step 1: Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd chat-app-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in `chat-app-backend/` matching the configuration below:
   ```env
   PORT=3000
   NODE_ENV=development

   # PostgreSQL Connection string
   DATABASE_URL="postgresql://<username>:<password>@localhost:5432/<database_name>"

   # Authentication Secrets
   JWT_SECRET="generate_a_long_secure_symmetric_string"
   JWT_REFRESH_SECRET="generate_another_long_secure_symmetric_string"
   JWT_EXPIRY="15m"
   JWT_ALGORITHM="HS256"
   JWT_REFRESH_EXPIRY_DAYS=7

   # Max attachment file size limits
   MAX_IMAGE_SIZE_BYTES=1048576 # 1 MB
   MAX_PDF_SIZE_BYTES=2097152   # 2 MB
   MAX_VIDEO_SIZE_BYTES=5242880 # 5 MB

   # Cloudinary Media Storage details
   CLOUDINARY_CLOUD_NAME="your_cloud_name"
   CLOUDINARY_API_KEY="your_api_key"
   CLOUDINARY_API_SECRET="your_api_secret"
   ```
4. Generate the Prisma database client:
   ```bash
   npm run db:generate
   ```
5. Apply database migrations to PostgreSQL:
   ```bash
   npm run db:migrate
   ```
6. Start the backend development server:
   ```bash
   npm run dev
   ```

---

### Step 2: Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd chat-app-frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in `chat-app-frontend/` specifying backend host URLs:
   ```env
   VITE_API_URL=http://localhost:3000/api
   VITE_SOCKET_URL=http://localhost:3000
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:5173` to start chatting!

---

## 🏗 Database Management

*   **Prisma Studio**: View and edit database tables visually.
    ```bash
    cd chat-app-backend
    npm run db:studio
    ```
*   **Expiring Status Queue**: The backend runs a database-backed task consumer queue to automatically delete expired statuses.
