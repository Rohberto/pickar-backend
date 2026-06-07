/**
 * createSuperAdmin.js
 * Run once to seed your first super_admin account.
 *
 * Usage:
 *   node src/scripts/createSuperAdmin.js
 *
 * Set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in your .env
 * or edit the defaults below before running.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const seed = async () => {
  // Connect directly — bypasses your Express middleware version of connectDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const email    = process.env.ADMIN_EMAIL    || 'admin@pickar.ng';
  const password = process.env.ADMIN_PASSWORD || 'SuperSecret123!';
  const fullName = process.env.ADMIN_NAME     || 'Pickar Super Admin';

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`✅  Admin already exists: ${email}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  await Admin.create({ fullName, email, password, role: 'super_admin' });
  console.log(`✅  Super admin created: ${email}`);
  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});