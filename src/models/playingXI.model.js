const { Schema, model } = require('mongoose');

const playingXISchema = new Schema(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    captain: { type: Schema.Types.ObjectId, ref: 'Player' },
    wicketKeeper: { type: Schema.Types.ObjectId, ref: 'Player' },
    substitutes: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

playingXISchema.index({ matchId: 1, teamId: 1 }, { unique: true });

module.exports = model('PlayingXI', playingXISchema);
