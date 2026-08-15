const { Schema, model } = require('mongoose');

const organizationSchema = new Schema(
  {
    name: { type: String, required: true },
    superAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = model('Organization', organizationSchema);
