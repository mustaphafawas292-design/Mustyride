require('dotenv').config();
const mongoose = require('mongoose');
const { Admin, Rider } = require('./src/models');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const admins = await Admin.find().select('+password');
  console.log('ADMINS:', JSON.stringify(admins, null, 2));

  const riders = await Rider.find({}, { phone: 1, verificationStatus: 1, name: 1 });
  console.log('RIDERS:', JSON.stringify(riders, null, 2));

  await mongoose.disconnect();
}

run();