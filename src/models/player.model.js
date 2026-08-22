const { Schema, model } = require('mongoose');

const playerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },// Play id
    forPlayer: { type: Schema.Types.ObjectId, ref: 'User', required: true },// This flag will be used to identify the player for whom it is intended.
    personalInfo: {
      dob: Date,
      gender: String,
      city: String,
      country: String,
    },
    battingStyle: { type: String, enum: ['right_hand', 'left_hand'] },
    bowlingStyle: { type: String },
    playerType: {
      type: String,
      enum: ['batter', 'bowler', 'all_rounder', 'wicket_keeper'],
    },
    isIndependent: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
); 

module.exports = model('Player', playerSchema);
