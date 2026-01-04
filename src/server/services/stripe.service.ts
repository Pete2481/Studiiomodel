import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";

export class StripeService {
  private static instance: StripeService;

  private constructor() {}

  public static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Ensures a tenant has a Stripe Customer ID.
   */
  async getOrCreateCustomer(tenantId: string) {
    // Use raw query for safety
    const results: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, name, "contactEmail", "stripeCustomerId" FROM "Tenant" WHERE id = $1 LIMIT 1`,
      tenantId
    );
    const tenant = results[0];

    if (!tenant) throw new Error("Tenant not found");
    if (tenant.stripeCustomerId) return tenant.stripeCustomerId;

    const customer = await stripe.customers.create({
      name: tenant.name,
      email: tenant.contactEmail || undefined,
      metadata: { tenantId: tenant.id }
    });

    await prisma.$executeRawUnsafe(
      `UPDATE "Tenant" SET "stripeCustomerId" = $1 WHERE id = $2`,
      customer.id,
      tenantId
    );

    return customer.id;
  }

  /**
   * Creates a Checkout Session for the $30 Pro Plan.
   */
  async createCheckoutSession(tenantId: string, returnUrl: string) {
    const customerId = await this.getOrCreateCustomer(tenantId);
    
    // We expect a STRIPE_PRO_PRICE_ID in env for the $30 plan
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) throw new Error("STRIPE_PRO_PRICE_ID is not configured");

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl,
      subscription_data: {
        metadata: { tenantId }
      }
    });

    return session.url;
  }

  /**
   * Creates a Customer Portal session for billing management.
   */
  async createPortalSession(tenantId: string, returnUrl: string) {
    const results: any[] = await prisma.$queryRawUnsafe(
      `SELECT "stripeCustomerId" FROM "Tenant" WHERE id = $1 LIMIT 1`,
      tenantId
    );
    const tenant = results[0];

    if (!tenant?.stripeCustomerId) throw new Error("No billing history found");

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  /**
   * Syncs subscription status from Stripe events.
   */
  async syncSubscription(subscriptionId: string) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const tenantId = subscription.metadata.tenantId;

    if (!tenantId) {
      // Fallback: look up by customer ID
      const results: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Tenant" WHERE "stripeCustomerId" = $1 LIMIT 1`,
        subscription.customer as string
      );
      const tenant = results[0];
      if (!tenant) return;
      
      await this.updateTenantSubscription(tenant.id, subscription);
    } else {
      await this.updateTenantSubscription(tenantId, subscription);
    }
  }

  private async updateTenantSubscription(tenantId: string, subscription: any) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Tenant" SET 
        "stripeSubscriptionId" = $1, 
        "subscriptionStatus" = $2, 
        "stripePriceId" = $3, 
        "subscriptionEndsAt" = $4
      WHERE id = $5`,
      subscription.id,
      subscription.status,
      subscription.items.data[0].price.id,
      new Date(subscription.current_period_end * 1000),
      tenantId
    );
  }

  /**
   * Initializes a 3-month trial for a new tenant.
   */
  async initializeTrial(tenantId: string) {
    const trialEndsAt = addDays(new Date(), 90); // 3 months
    await prisma.$executeRawUnsafe(
      `UPDATE "Tenant" SET "trialEndsAt" = $1, "subscriptionStatus" = $2 WHERE id = $3`,
      trialEndsAt,
      "trialing",
      tenantId
    );
  }
}

export const stripeService = StripeService.getInstance();

