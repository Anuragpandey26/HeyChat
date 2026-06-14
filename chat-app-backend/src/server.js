import http from 'http';
import app from './app.js';
import { env } from './core/config/env.config.js';
import prisma from './core/database/prisma.singleton.js';
import queueService from './shared/services/queue.service.js';
import socketService from './shared/services/socket.service.js';
import { initChatsListeners } from './modules/chats/chats.listeners.js';

const PORT = env.PORT || 3000;
const server = http.createServer(app);

// Initialize Socket.io service cleanly (decoupled presence and message registration)
socketService.init(server);

// Register custom PostgreSQL Queue handlers
queueService.registerHandler('purge_status', async (payload) => {
  const { statusId } = payload;
  try {
    await prisma.status.delete({
      where: { id: statusId },
    });
    console.log(`[Queue Worker] Expired status ${statusId} deleted from database.`);
  } catch (err) {
    // Ignore record not found (P2025)
    if (err.code !== 'P2025') {
      console.error(`Failed to purge status ${statusId}:`, err);
      throw err;
    }
  }
});

// Initialize internal listeners
initChatsListeners();

// Start Queue background consumer
queueService.start();

// Launch HTTP Server
server.listen(PORT, () => {
  console.log(`heyChat server listening on port ${PORT} in ${env.NODE_ENV} mode`);
});

// Graceful Shutdown logic
const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new HTTP requests
  server.close(() => {
    console.log('HTTP server closed.');
  });

  // Close active Socket.io connections cleanly via SocketService
  socketService.close(() => {
    console.log('Socket.io server closed.');
  });

  // Terminate PG queue polling worker
  queueService.stop();

  // Close database connections safely
  try {
    await prisma.$disconnect();
    console.log('Prisma disconnected successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during Prisma disconnection:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Triggering nodemon reload for audio middleware validation and typing indicator updates

