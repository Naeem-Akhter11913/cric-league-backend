const { Schema, model } = require('mongoose');

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    logo: { type: String, require: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    format: { type: String, enum: ['T20', 'T15', 'T10', 'SORT-BOUNDARY'], default: 'SORT-BOUNDARY' },
    formatType: {
      type: String,
      enum: ["Knockout", "Round Robin", "League + Playoffs",
        "Double Elimination",
      ], default: 'Knockout'
    },
    startDate: { type: Date },
    endDate: { type: Date },
    registrationDeadline: { type: Date },
    venues: [{ type: Schema.Types.ObjectId, ref: 'Venue' }],
    rules: { type: String, require: true },
    winnerPrice:{type: Number, require: true},
    runnerPrice:{type: Number, require: true},
    status: {
      type: String,
      enum: ['draft', 'registration_open', 'ongoing', 'completed','upcoming'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

module.exports = model('Tournament', tournamentSchema);
