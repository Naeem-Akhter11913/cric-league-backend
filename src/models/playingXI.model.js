// const { Schema, model } = require('mongoose');

// const playingXISchema = new Schema(
//   {
//     matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
//     teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
//     players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
//     captain: { type: Schema.Types.ObjectId, ref: 'Player' },
//     wicketKeeper: { type: Schema.Types.ObjectId, ref: 'Player' },
//     substitutes: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
//     confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// playingXISchema.index({ matchId: 1, teamId: 1 }, { unique: true });

// module.exports = model('PlayingXI', playingXISchema);


const { Schema, model } = require('mongoose');

const playingXISchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    format: { type: String, enum: ['T20', 'T10', 'ODI', 'Test'], default: 'T20', required: true },
    matchId: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],       // exactly 11
    substitutes: [{ type: Schema.Types.ObjectId, ref: 'Player' }],   // max 4
    captain: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    viceCaptain: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// one XI per team + format (+ match, when it's attached to one)
playingXISchema.index({ teamId: 1, format: 1, matchId: 1 }, { unique: true });

module.exports = model('PlayingXI', playingXISchema);