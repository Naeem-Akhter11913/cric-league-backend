// const { Schema, model } = require('mongoose');

// const venueSchema = new Schema(
//   {
//     name: { type: String, required: true },
//     city: { type: String },
//     address: { type: String },
//     capacity: { type: Number },
//     createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// module.exports = model('Venue', venueSchema);




const { Schema, model } = require('mongoose');

const venueSchema = new Schema(
  {
    name: { type: String, required: true },
    city: { type: String },

    // address: {
    //   line1: { type: String },
    //   line2: { type: String, default: null },
    //   state: { type: String },
    //   country: { type: String },
    //   pincode: { type: String },
    // },

    surface: {
      type: { type: String },
      behavior: { type: String, default: null },
    },

    capacity: { type: Number, default: 0 },
    floodLights: { type: Boolean, default: true },
    indoorOutdoor: { type: String, enum: ['indoor', 'outdoor'], default: 'outdoor' },
    pitchCount: { type: Number, default: null },

    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      mapLocation: { type: String, default: null },
    },

    // contact: {
    //   name: { type: String, default: null },
    //   number: { type: String, default: null },
    //   email: { type: String, default: null },
    // },

    description: { type: String, default: null },
    amenities: [{ type: String }],
    images: [{ type: String }],

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = model('Venue', venueSchema);