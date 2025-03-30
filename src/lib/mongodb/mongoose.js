import mongoose from "mongoose";

let initialized = false;

export const connect = async () => {
  mongoose.set("strictQuery", true);

  // Only connect if not already initialized
  if (initialized) {
    console.log("MongoDB connection already initialized");
    return;
  }

  try {
    console.log("Connecting to MongoDB...");
    
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "next-blog",
      maxPoolSize: 10, // Maximum number of sockets in the connection pool
      serverSelectionTimeoutMS: 5000, // Timeout for server selection
      socketTimeoutMS: 45000, // Socket timeout
    });

    // Connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to DB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('Mongoose disconnected');
      // Optional: Implement reconnection logic here if needed
    });

    // For SIGINT (Ctrl+C) or process termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('Mongoose connection closed due to app termination');
      process.exit(0);
    });

    console.log("Connected to MongoDB");
    initialized = true;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    
    // Implement retry logic for production environments
    if (process.env.NODE_ENV === 'production') {
      console.log('Retrying connection in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connect(); // Recursive retry
    }
    
    throw new Error("Failed to connect to MongoDB");
  }
};