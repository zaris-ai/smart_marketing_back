import mongoose from 'mongoose';

export async function connectDb() {
  const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb://root:root123@localhost:27017/dashboard_db?authSource=admin';

  mongoose.set('strictQuery', true);

  await mongoose.connect(mongoUri);

  console.log('MongoDB connected');
}