const { Server } = require('socket.io');
const env = require('./env');
const logger = require('../utils/logger');

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client joins a match room to receive live score/commentary updates
    socket.on('join_match_room', (matchId) => {
      socket.join(`match:${matchId}`);
    });

    socket.on('leave_match_room', (matchId) => {
      socket.leave(`match:${matchId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized. Call initSocket first.');
  return io;
}

module.exports = { initSocket, getIO };
