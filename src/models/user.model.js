const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['super_admin', 'organizer', 'team_manager', 'player', 'scorer'],
      required: true,
    },
    status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
    avatarUrl: { type: String },
    refreshTokens: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
