"use server";

import { auth } from "@/auth";
import { stripeService } from "@/server/services/stripe.service";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function createStripeCheckoutAction() {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Unauthorized");

  const host = (await headers()).get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const returnUrl = `${protocol}://${host}/tenant/settings?tab=billing`;

  const url = await stripeService.createCheckoutSession(session.user.tenantId, returnUrl);
  if (url) redirect(url);
}

export async function createStripePortalAction() {
  const session = await auth();
  if (!session?.user?.tenantId) throw new Error("Unauthorized");

  const host = (await headers()).get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const returnUrl = `${protocol}://${host}/tenant/settings?tab=billing`;

  const url = await stripeService.createPortalSession(session.user.tenantId, returnUrl);
  if (url) redirect(url);
}

