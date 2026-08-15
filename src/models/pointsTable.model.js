const { Schema, model } = require('mongoose');

const pointsTableSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    tied: { type: Number, default: 0 },
    noResult: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    netRunRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

pointsTableSchema.index({ tournamentId: 1, teamId: 1 }, { unique: true });

module.exports = model('PointsTable', pointsTableSchema);
