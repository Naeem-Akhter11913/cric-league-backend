const { Schema, model } = require('mongoose');

const matchSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    teamA: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    teamB: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue' },
    scorerId: { type: Schema.Types.ObjectId, ref: 'User' },
    scheduledAt: { type: Date },
    overs: { type: Number },
    toss: {
      winner: { type: Schema.Types.ObjectId, ref: 'Team' },
      decision: { type: String, enum: ['bat', 'bowl'] },
    },
    status: {
      type: String,
      enum: ['scheduled', 'toss_done', 'live', 'innings_break', 'completed', 'abandoned'],
      default: 'scheduled',
    },
    result: {
      winner: { type: Schema.Types.ObjectId, ref: 'Team' },
      summary: { type: String },
      isTie: { type: Boolean, default: false },
      isNoResult: { type: Boolean, default: false },
    },
    currentInningsId: { type: Schema.Types.ObjectId, ref: 'Innings' },
  },
  { timestamps: true }
);

module.exports = model('Match', matchSchema);
