import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { createOrUpdateUser, deleteUser } from "@/lib/actions/user";

export async function POST(req) {
  const SIGNING_SECRET = process.env.WEBHOOK_SECRET || process.env.SIGNING_SECRET;

  if (!SIGNING_SECRET) {
    console.error("Error: Webhook signing secret is missing");
    return new Response("Internal Server Error", { status: 500 });
  }

  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Bad Request: Missing Svix headers", { status: 400 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response("Bad Request: Invalid JSON", { status: 400 });
  }

  const wh = new Webhook(SIGNING_SECRET);
  let evt;

  try {
    evt = wh.verify(JSON.stringify(payload), {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    return new Response("Unauthorized: Verification failed", { status: 401 });
  }

  const eventType = evt.type;
  console.log(`Webhook event: ${eventType}`);

  try {
    if (eventType === "user.created" || eventType === "user.updated") {
      const { id, first_name, last_name, image_url, email_addresses, username } = evt.data;

      const user = await createOrUpdateUser(
        id,
        first_name,
        last_name,
        image_url,
        email_addresses,
        username
      );

      if (user) {
        try {
          await clerkClient.users.updateUser(id, {
            publicMetadata: {
              userMongoId: user._id?.toString() || "",
              isAdmin: user.isAdmin || false,
            },
          });
          console.log(`Successfully updated metadata for user ${id}`);
        } catch (error) {
          console.error("Error updating Clerk metadata:", error);
          // Don't return error response here as the user was created successfully
        }
      }
    } else if (eventType === "user.deleted") {
      const { id } = evt.data;
      await deleteUser(id);
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("Webhook processed successfully", { status: 200 });
}