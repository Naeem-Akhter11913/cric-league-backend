const { getIO } = require('../config/socket');

// Call this from scoring.service.js after a ball is recorded / innings ends / match completes
function broadcastBallScored(matchId, payload) {
  getIO().to(`match:${matchId}`).emit('ball_scored', payload);
}

function broadcastInningsEnd(matchId, payload) {
  getIO().to(`match:${matchId}`).emit('innings_end', payload);
}

function broadcastMatchCompleted(matchId, payload) {
  getIO().to(`match:${matchId}`).emit('match_completed', payload);
}

module.exports = { broadcastBallScored, broadcastInningsEnd, broadcastMatchCompleted };
