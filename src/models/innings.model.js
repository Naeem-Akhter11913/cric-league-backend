// const { Schema, model } = require('mongoose');

// const inningsSchema = new Schema(
//   {
//     matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
//     inningsNumber: { type: Number, required: true }, // 1 or 2
//     battingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
//     bowlingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
//     totalRuns: { type: Number, default: 0 },
//     totalWickets: { type: Number, default: 0 },
//     totalOvers: { type: Number, default: 0 }, // e.g. 14.3
//     extras: {
//       wides: { type: Number, default: 0 },
//       noBalls: { type: Number, default: 0 },
//       byes: { type: Number, default: 0 },
//       legByes: { type: Number, default: 0 },
//     },
//     currentBatters: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
//     currentBowler: { type: Schema.Types.ObjectId, ref: 'Player' },
//     status: {
//       type: String,
//       enum: ['not_started', 'in_progress', 'completed'],
//       default: 'not_started',
//     },
//   },
//   { timestamps: true }
// );

// module.exports = model('Innings', inningsSchema);



const { Schema, model } = require('mongoose');

const inningsSchema = new Schema(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    inningsNumber: { type: Number, required: true }, // 1 or 2
    battingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    bowlingTeam: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    totalRuns: { type: Number, default: 0 },
    totalWickets: { type: Number, default: 0 },
    totalOvers: { type: Number, default: 0 },   // display value, e.g. 14.3
    legalBalls: { type: Number, default: 0 },   // 87 = 14.3 overs
    extras: {
      wides: { type: Number, default: 0 },
      noBalls: { type: Number, default: 0 },
      byes: { type: Number, default: 0 },
      legByes: { type: Number, default: 0 },
    },
    // who is on the field right now; null = a new player must be chosen
    striker: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    nonStriker: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    currentBowler: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    target: { type: Number },                    // innings 2 only
    endReason: { type: String, enum: ['all_out', 'overs_complete', 'target_chased'] },
    status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
  },
  { timestamps: true }
);

inningsSchema.index({ matchId: 1, inningsNumber: 1 }, { unique: true });

module.exports = model('Innings', inningsSchema);