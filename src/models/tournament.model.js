const { Schema, model } = require('mongoose');

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    format: { type: String, enum: ['T20', 'ODI', 'Test', 'Custom'], default: 'T20' },
    startDate: { type: Date },
    endDate: { type: Date },
    registrationDeadline: { type: Date },
    venues: [{ type: Schema.Types.ObjectId, ref: 'Venue' }],
    rules: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['draft', 'registration_open', 'ongoing', 'completed'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

module.exports = model('Tournament', tournamentSchema);
