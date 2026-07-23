require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { FareConfig, Admin } = require('../models');

async function seed() {
  await connectDB();

  const existingConfig = await FareConfig.findOne({ isActive: true });
  if (!existingConfig) {
    await FareConfig.create({});
    console.log('[Seed] Default fare config created.');
  } else {
    console.log('[Seed] Fare config already exists, skipping.');
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@mustyride.ng';
  const existingAdmin = await Admin.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await Admin.create({
      fullName: 'MustyRide Admin',
      email: adminEmail,
      password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
      role: 'super_admin',
    });
    console.log(`[Seed] First admin created: ${adminEmail} (change the password immediately after logging in).`);
  } else {
    console.log('[Seed] Admin already exists, skipping.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
