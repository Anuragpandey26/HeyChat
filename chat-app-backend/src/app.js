import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRouter from './modules/auth/auth.routes.js';
import usersRouter from './modules/users/users.routes.js';
import chatsRouter from './modules/chats/chats.routes.js';
import messagesRouter from './modules/messages/messages.routes.js';
import statusRouter from './modules/status/status.routes.js';

import { AppError } from './core/errors/AppError.js';
import { env } from './core/config/env.config.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1 || env.NODE_ENV === 'test') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'server is fine' });
});

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/status', statusRouter);

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.code === 'P2002') {
    err.statusCode = 400;
    err.status = 'fail';
    const fields = err.meta?.target ? err.meta.target.join(', ') : 'field';
    err.message = `Duplicate value for: ${fields}. Must be unique.`;
  }

  if (err.code === 'P2025') {
    err.statusCode = 404;
    err.status = 'fail';
    err.message = err.meta?.cause || 'Record not found';
  }

  if (env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack: err.stack,
      error: err,
    });
  } else {
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    } else {
      console.error('ERROR:', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong on the server',
      });
    }
  }
});

export default app;
// Trigger server reload for new Prisma client definition v2
