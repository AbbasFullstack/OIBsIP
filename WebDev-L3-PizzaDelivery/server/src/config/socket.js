import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from './env.js';
import { SOCKET_ROOMS } from './constants.js';
import logger from '../utils/logger.js';

let io = null;

// Attaches Socket.io to the existing HTTP server. Connections are authenticated
// in the handshake and placed into a targeted room (`admin` or `user:<id>`), so
// broadcasts never leak across tenants.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      socket.data.userId = payload.id;
      socket.data.role = payload.role;
      return next();
    } catch {
      return next(new Error('Invalid or expired session'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.role === 'admin') socket.join(SOCKET_ROOMS.admin);
    else socket.join(SOCKET_ROOMS.user(socket.data.userId));

    logger.debug(`Socket connected ${socket.id} (role=${socket.data.role})`);

    // Tracking pages join explicitly; the connection is already scoped to the
    // user's own room so this mainly acknowledges the subscription.
    socket.on('order:subscribe', (orderId) => {
      if (orderId) socket.join(`order:${orderId}`);
    });

    socket.on('disconnect', () => logger.debug(`Socket disconnected ${socket.id}`));
  });

  return io;
};

// Accessor so controllers/services can emit without importing the HTTP server
// (which would create a circular dependency).
export const getIO = () => io;

export const emitToAdmin = (event, payload) => {
  io?.to(SOCKET_ROOMS.admin).emit(event, payload);
};

export const emitToUser = (userId, event, payload) => {
  io?.to(SOCKET_ROOMS.user(userId)).emit(event, payload);
};

export default { initSocket, getIO, emitToAdmin, emitToUser };