const { Schema, model } = require('mongoose');

const teamSchema = new Schema( 
  {
    name: { type: String, required: true },
    logoUrl: { type: String },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    captain: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viceCaptain: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    homeVenue: { type: Schema.Types.ObjectId, ref: 'Venue', default: null},
    tournament: {type: Schema.Types.ObjectId, ref: 'Tournament', default: null},
    players:[{ type: Schema.Types.ObjectId, ref: 'Player' }],
    status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = model('Team', teamSchema);
