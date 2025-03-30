import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { createOrUpdateUser, deleteUser } from "@/lib/actions/user";

export async function POST(req) {
  // 1. Get the WEBHOOK_SECRET from environment variables
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.SIGNING_SECRET;
  
  if (!WEBHOOK_SECRET) {
    console.error("WEBHOOK_SECRET is missing from environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  // 2. Get the Svix headers for verification
  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing required Svix headers", { status: 400 });
  }

  // 3. Get the webhook payload
  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  // 4. Verify the webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;

  try {
    evt = wh.verify(JSON.stringify(payload), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Invalid webhook signature", { status: 401 });
  }

  // 5. Handle the webhook event
  const eventType = evt.type;
  console.log(`Processing Clerk webhook event: ${eventType}`);

  try {
    if (eventType === "user.created" || eventType === "user.updated") {
      const { id, first_name, last_name, image_url, email_addresses, username } = evt.data;

      // 5a. Create/update user in your database
      const user = await createOrUpdateUser(
        id,
        first_name,
        last_name,
        image_url,
        email_addresses,
        username
      );

      if (!user) {
        console.error("Database operation failed for user:", id);
        return new Response("Database operation failed", { status: 500 });
      }

      // 5b. Update Clerk metadata with database ID
      try {
        const updatedUser = await clerkClient.users.updateUser(id, {
          publicMetadata: {
            databaseId: user._id.toString(),
            isAdmin: Boolean(user.isAdmin),
          },
        });
        console.log(`Successfully updated Clerk metadata for user ${id}`);
      } catch (error) {
        console.error("Failed to update Clerk metadata:", error);
        // Continue processing even if metadata update fails
      }

    } else if (eventType === "user.deleted") {
      const { id } = evt.data;
      await deleteUser(id);
      console.log(`Deleted user ${id} from database`);
    }

    return new Response("Webhook processed successfully", { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal server error", { status: 500 });
  }
}