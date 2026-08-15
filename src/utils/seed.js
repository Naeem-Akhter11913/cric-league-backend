/* Basic seed script: creates a super admin user if one doesn't exist. Run with `npm run seed`. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const env = require('../config/env');
const { User } = require('../models');

async function seed() {
  await mongoose.connect(env.mongoUri);

  const existing = await User.findOne({ role: 'super_admin' });
  if (existing) {
    console.log('Super admin already exists:', existing.email);
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash('ChangeMe123!', 10);
  const admin = await User.create({
    name: 'Super Admin',
    email: 'admin@cricleague.com',
    passwordHash,
    role: 'super_admin',
    status: 'approved',
  });

  console.log('Created super admin:', admin.email, '(password: ChangeMe123!)');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
