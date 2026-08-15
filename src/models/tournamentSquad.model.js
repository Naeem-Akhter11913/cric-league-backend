const { Schema, model } = require('mongoose');

const tournamentSquadSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    players: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

tournamentSquadSchema.index({ tournamentId: 1, teamId: 1 }, { unique: true });

module.exports = model('TournamentSquad', tournamentSquadSchema);
