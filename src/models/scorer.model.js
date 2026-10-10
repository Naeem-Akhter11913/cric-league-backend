const { Schema, model } = require('mongoose');

const scorerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // the organization this scorer works for
    city: { type: String, trim: true },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    isChief: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    matchesScored: { type: Number, default: 0 },
    ballsRecorded: { type: Number, default: 0 },
    ballsUndone: { type: Number, default: 0 },     // how many times the scorer pressed Undo
    accuracy: { type: Number, default: null },
    lastScoredAt: { type: Date },
  },
  { timestamps: true }
);





module.exports = model('Scorer', scorerSchema);