const { Schema, model } = require('mongoose');

const venueSchema = new Schema(
  {
    name: { type: String, required: true },
    city: { type: String },
    address: { type: String },
    capacity: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = model('Venue', venueSchema);
