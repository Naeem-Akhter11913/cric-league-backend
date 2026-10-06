const { Schema, model } = require('mongoose');

const scorerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', index: true }, // the organization this scorer works for
    city: { type: String, trim: true },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    isChief: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = model('Scorer', scorerSchema);