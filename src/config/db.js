// MongoDB database connection configuration
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        console.error('MONGO_URI is not defined. Refusing to start without a MongoDB connection string.');
        process.exit(1);
    }

    mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error.message);
    });

    mongoose.connection.on('disconnected', () => {
        console.error('MongoDB disconnected');
    });

    try {
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`MongoDB initial connection failed: ${error.message}`);
        process.exit(1);
    }
};
console.log("MONGO_URI:", process.env.MONGO_URI);
module.exports = connectDB;
