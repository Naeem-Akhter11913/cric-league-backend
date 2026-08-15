const { Schema, model } = require('mongoose');

const teamPlayerSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    playerCategory: {
      type: String,
      enum: ['team_player', 'outsider_player'],
      default: 'team_player',
    },
    jerseyNumber: { type: Number },
    role: { type: String, enum: ['captain', 'vice_captain', 'player'], default: 'player' },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: true }
);

teamPlayerSchema.index({ teamId: 1, playerId: 1 }, { unique: true });

module.exports = model('TeamPlayer', teamPlayerSchema);
