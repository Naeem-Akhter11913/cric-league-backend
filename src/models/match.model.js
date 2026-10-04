// const { Schema, model } = require('mongoose');

// const matchSchema = new Schema(
//   {
//     tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
//     teamA: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
//     teamB: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
//     venueId: { type: Schema.Types.ObjectId, ref: 'Venue' },
//     scorerId: { type: Schema.Types.ObjectId, ref: 'User' },
//     scheduledAt: { type: Date },
//     overs: { type: Number },
//     toss: {
//       winner: { type: Schema.Types.ObjectId, ref: 'Team' },
//       decision: { type: String, enum: ['bat', 'bowl'] },
//     },
//     status: {
//       type: String,
//       enum: ['scheduled', 'toss_done', 'live', 'innings_break', 'completed', 'abandoned'],
//       default: 'scheduled',
//     },
//     result: {
//       winner: { type: Schema.Types.ObjectId, ref: 'Team' },
//       summary: { type: String },
//       isTie: { type: Boolean, default: false },
//       isNoResult: { type: Boolean, default: false },
//     },
//     currentInningsId: { type: Schema.Types.ObjectId, ref: 'Innings' },
//   },
//   { timestamps: true }
// );

// module.exports = model('Match', matchSchema);



const { Schema, model } = require('mongoose');

const FORMATS = ['T20', 'T10', 'ODI', 'Test'];

const matchSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    matchNumber: { type: Number },
    teamA: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    teamB: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue' },
    scorerId: { type: Schema.Types.ObjectId, ref: 'User' },
    format: { type: String, enum: FORMATS, default: 'T20' },
    scheduledAt: { type: Date, required: true },
    overs: { type: Number, min: 1, max: 50 },            // empty for Test
    toss: {
      winner: { type: Schema.Types.ObjectId, ref: 'Team' },
      decision: { type: String, enum: ['bat', 'bowl'] },
    },
    status: {
      type: String,
      enum: ['scheduled', 'toss_done', 'live', 'innings_break', 'completed', 'abandoned', 'cancelled'],
      default: 'scheduled',
    },
    cancelReason: { type: String },
    result: {
      winner: { type: Schema.Types.ObjectId, ref: 'Team' },
      summary: { type: String },                          // "Strikers Club won"
      margin: { type: String },                           // "By 28 Runs"
      isTie: { type: Boolean, default: false },
      isNoResult: { type: Boolean, default: false },
    },
    playerOfMatch: {
      player: { type: Schema.Types.ObjectId, ref: 'Player' },
      summary: { type: String },                          // "4/18 (4 Overs)"
    },
    currentInningsId: { type: Schema.Types.ObjectId, ref: 'Innings' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

matchSchema.pre('validate', function (next) {
  if (this.teamA && this.teamB && String(this.teamA) === String(this.teamB)) {
    this.invalidate('teamB', 'Team A and Team B must be different');
  }
  next();
});

matchSchema.index({ createdBy: 1, status: 1, scheduledAt: 1 });
matchSchema.index({ tournamentId: 1, matchNumber: 1 });
matchSchema.index({ teamA: 1, scheduledAt: 1 });
matchSchema.index({ teamB: 1, scheduledAt: 1 });
matchSchema.index({ venueId: 1, scheduledAt: 1 });

module.exports = model('Match', matchSchema);