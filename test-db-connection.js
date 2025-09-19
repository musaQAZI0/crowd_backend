const mongoose = require('mongoose');
require('dotenv').config();

async function testDatabaseConnection() {
    try {
        console.log('Testing MongoDB connection...');
        console.log('Using URI:', process.env.MONGODB_URI ? 'URI found' : 'No URI found');

        // Set connection options for better debugging
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // 10 seconds
            connectTimeoutMS: 10000,
        };

        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, options);

        console.log('✅ MongoDB connected successfully!');
        console.log('Connection state:', mongoose.connection.readyState);
        console.log('Database name:', mongoose.connection.name);

        // Test a simple operation
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));

        await mongoose.disconnect();
        console.log('✅ Database test completed successfully');

    } catch (error) {
        console.error('❌ Database connection failed:');
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);

        if (error.reason) {
            console.error('Reason:', error.reason);
        }

        if (error.code) {
            console.error('Error code:', error.code);
        }

        process.exit(1);
    }
}

testDatabaseConnection();