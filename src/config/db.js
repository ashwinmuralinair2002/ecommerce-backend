// MongoDB database connection configuration
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

let connectionPromise = null;
let listenersRegistered = false;

const registerConnectionListeners = () => {
    if (listenersRegistered) {
        return;
    }

    mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error.message);
    });

    mongoose.connection.on('disconnected', () => {
        console.error('MongoDB disconnected');
    });

    listenersRegistered = true;
};

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
        console.error('MONGO_URI is not defined. Refusing to start without a MongoDB connection string.');
        process.exit(1);
    }

    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    registerConnectionListeners();

    connectionPromise = mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        })
        .then((conn) => {
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
        })
        .catch((error) => {
            connectionPromise = null;
            console.error(`MongoDB initial connection failed: ${error.message}`);
            process.exit(1);
        });

    return connectionPromise;
};
module.exports = connectDB;
