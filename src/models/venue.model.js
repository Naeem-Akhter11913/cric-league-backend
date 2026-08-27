// const { Schema, model } = require('mongoose');

// const venueSchema = new Schema(
//   {
//     name: { type: String, required: true },
//     createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
//     city: { type: String },

//     surface: {
//       type: { type: String },
//       behavior: { type: String, default: null },
//     },

//     capacity: { type: Number, default: 0 },
//     floodLights: { type: Boolean, default: true },
//     indoorOutdoor: { type: String, enum: ['indoor', 'outdoor'], default: 'outdoor' },
//     pitchCount: { type: Number, default: null },

//     location: {
//       latitude: { type: Number, default: null },
//       longitude: { type: Number, default: null },
//       mapLocation: { type: String, default: null },
//     },

//     contact: {
//       name: { type: String, default: null },
//       number: { type: String, default: null },
//       email: { type: String, default: null },
//     },

//     description: { type: String, default: null },
//     amenities: [{ type: String }],
//     images: [{ type: String }],

//   },
//   { timestamps: true }
// );

// module.exports = model('Venue', venueSchema);



const { Schema, model } = require('mongoose');

const venueSchema = new Schema(
  {
    name: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    city: { type: String, required: true },

    surface: {
      type: { type: String, required: true },
      behavior: { type: String, required: true },
    },

    capacity: { type: Number, required: true },
    floodLights: { type: Boolean, default: true },
    indoorOutdoor: { type: String, enum: ['indoor', 'outdoor'], required: true },
    pitchCount: { type: Number, required: true },

    address: {
      line1: { type: String, required: true },
      line2: { type: String, required: true },
      area: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      pincode: { type: String, required: true },
    },

    contact: {
      name: { type: String, required: true },
      number: { type: String, required: true },
      email: { type: String, required: true },
    },

    description: { type: String, required: true },
    amenities: [{ type: String }],
    images: [{ type: String }],
    status: { type: String, enum: ['pending', 'approved', 'suspended'], default: 'pending' },
  },
  { timestamps: true }
);

module.exports = model('Venue', venueSchema);