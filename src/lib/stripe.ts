import Stripe from "stripe";

// Use a dummy key if not provided during build/evaluation phase
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_key_for_build_purposes";

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-12-18.acacia" as any, // Standard modern version
  appInfo: {
    name: "Studiio SaaS",
    version: "0.1.0",
  },
});

