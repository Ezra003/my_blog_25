import User from "../models/user.model";
import { connect } from "../mongodb/mongoose";

export const createOrUpdateUser = async (
  id,
  first_name,
  last_name,
  image_url,
  email_addresses,
  username
) => {
  try {
    // Ensure MongoDB is connected
    await connect();

    // Find and update the user, or create a new one if it doesn't exist
    const user = await User.findOneAndUpdate(
      { clerkId: id },
      {
        $set: {
          firstName: first_name,
          lastName: last_name,
          profilePicture: image_url,
          email: email_addresses[0]?.email_address, // Safely access email
          username: username,
        },
      },
      { new: true, upsert: true } // Return the updated document and create if not found
    );

    return user;
  } catch (error) {
    console.error("Error creating or updating user:", error);
    throw new Error("Failed to create or update user"); // Throw error for better handling
  }
};

export const deleteUser = async (id) => {
  try {
    // Ensure MongoDB is connected
    await connect();

    // Find and delete the user by Clerk ID
    const deletedUser = await User.findOneAndDelete({ clerkId: id });

    if (!deletedUser) {
      console.warn(`User with Clerk ID ${id} not found for deletion.`);
    }

    return deletedUser;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user"); // Throw error for better handling
  }
};

