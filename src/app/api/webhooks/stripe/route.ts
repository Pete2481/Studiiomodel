import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { stripeService } from "@/server/services/stripe.service";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature") as string;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        if (session.subscription) {
          await stripeService.syncSubscription(session.subscription as string);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        await stripeService.syncSubscription(subscription.id);
        break;
      }
      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`Webhook handler failed: ${error.message}`);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

