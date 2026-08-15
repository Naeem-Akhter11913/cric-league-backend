const { Schema, model } = require('mongoose');

const teamStatsSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament' }, // null = overall
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    totalRunsScored: { type: Number, default: 0 },
    totalWicketsTaken: { type: Number, default: 0 },
    highestTeamScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

teamStatsSchema.index({ teamId: 1, tournamentId: 1 }, { unique: true });

module.exports = model('TeamStats', teamStatsSchema);
