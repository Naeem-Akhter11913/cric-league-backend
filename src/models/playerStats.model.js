const { Schema, model } = require('mongoose');

const playerStatsSchema = new Schema(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament' }, // null = career totals
    matches: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    ballsFaced: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    oversBowled: { type: Number, default: 0 },
    runsConceded: { type: Number, default: 0 },
    catches: { type: Number, default: 0 },
    runOuts: { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    bestBowling: { type: String },
  },
  { timestamps: true }
);

playerStatsSchema.index({ playerId: 1, tournamentId: 1 }, { unique: true });

module.exports = model('PlayerStats', playerStatsSchema);
