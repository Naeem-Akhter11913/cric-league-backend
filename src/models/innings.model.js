const { Schema, model } = require('mongoose');

const inningsSchema = new Schema(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    inningsNumber: { type: Number, required: true }, // 1 or 2
    battingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    bowlingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    totalRuns: { type: Number, default: 0 },
    totalWickets: { type: Number, default: 0 },
    totalOvers: { type: Number, default: 0 }, // e.g. 14.3
    extras: {
      wides: { type: Number, default: 0 },
      noBalls: { type: Number, default: 0 },
      byes: { type: Number, default: 0 },
      legByes: { type: Number, default: 0 },
    },
    currentBatters: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    currentBowler: { type: Schema.Types.ObjectId, ref: 'Player' },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
  },
  { timestamps: true }
);

module.exports = model('Innings', inningsSchema);
