import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { createOrUpdateUser, deleteUser } from "@/lib/actions/user";

export async function POST(req) {
  const SIGNING_SECRET = process.env.SIGNING_SECRET;

  if (!SIGNING_SECRET) {
    console.error(
      "Error: SIGNING_SECRET is not set in the environment variables."
    );
    return new Response("Internal Server Error", { status: 500 });
  }

  const wh = new Webhook(SIGNING_SECRET);

  // Get headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error("Error: Missing Svix headers");
    return new Response("Bad Request: Missing Svix headers", { status: 400 });
  }

  // Get body from the request
  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    console.error("Error parsing request body:", error);
    return new Response("Bad Request: Invalid JSON", { status: 400 });
  }

  const body = JSON.stringify(payload);

  let evt;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (error) {
    console.error("Error verifying webhook:", error);
    return new Response("Unauthorized: Verification failed", { status: 401 });
  }

  const { id } = evt?.data;
  const eventType = evt?.type;
  console.log(`Received webhook with ID ${id} and event type ${eventType}`);
  console.log("Webhook payload:", body);

  try {
    if (eventType === "user.created" || eventType === "user.updated") {
      const {
        id,
        first_name,
        last_name,
        image_url,
        email_addresses,
        username,
      } = evt?.data;

      const user = await createOrUpdateUser(
        id,
        first_name,
        last_name,
        image_url,
        email_addresses,
        username
      );

      if (user && eventType === "user.created") {
        try {
          console.log("Updating metadata for user ID:", id);
          console.log("User Mongo ID:", user._id);
          console.log("Is Admin:", user.isAdmin);

          await clerkClient.users.updateUserMetadata(id, {
            publicMetadata: {
              userMongoId: user._id.toString(), // Ensure this is a string
              isAdmin: user.isAdmin || false, // Default to false if undefined
            },
          });
        } catch (error) {
          console.error("Error updating user metadata:", error);
        }
      }
    } else if (eventType === "user.deleted") {
      const { id } = evt?.data;
      await deleteUser(id);
    } else {
      console.warn(`Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error("Error processing webhook event:", error);
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("Webhook received", { status: 200 });
}