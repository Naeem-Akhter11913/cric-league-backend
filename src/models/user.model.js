const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    // Origanization: This role will create the tournament and manage the rournamnet and can create and manage team also
    // team_manager: This role will create team only 
    role: {
      type: String,
      enum: ['super_admin', 'organizer', 'team_manager', 'player', 'scorer'],
      required: true,
      default: 'player'
    },
    status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
    avatarUrl: { type: String },
    refreshTokens: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
