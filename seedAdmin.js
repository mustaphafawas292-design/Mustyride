require('dotenv').config();
const mongoose = require('mongoose');
const { Admin } = require('./src/models');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await Admin.findOne({ email: 'admin@mustyride.ng' });
  if (existing) {
    console.log('Admin already exists:', existing.email);
    await mongoose.disconnect();
    return;
  }

  const admin = await Admin.create({
    fullName: 'Mustapha Fawaz',
    email: 'admin@mustyride.ng',
    password: 'ChangeThisPassword123!',
    role: 'super_admin',
  });

  console.log('Admin created:', admin.email);
  await mongoose.disconnect();
}

run();