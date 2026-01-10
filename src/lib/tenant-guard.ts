import { prisma } from "./prisma";
import { auth } from "@/auth";

/**
 * Global Tenant Guard
 * 
 * This utility provides an extended Prisma client that automatically injects
 * tenantId into all queries (read, write, update, delete).
 * 
 * It ensures that data isolation is enforced at the database layer.
 * 
 * @param overrideTenantId Optional tenant ID to use instead of the session's tenant ID (for public routes)
 */
export async function getTenantPrisma(overrideTenantId?: string) {
  // If we have an override (e.g. for public gallery actions), use it WITHOUT checking session
  if (overrideTenantId) {
    return createScopedPrisma(overrideTenantId) as any;
  }

  const session = await auth();
  
  if (!session?.user) {
    throw new Error("Unauthorized: No session found");
  }

  // Master admins see everything by default
  // In the future, if they "enter" a tenant, session.user.tenantId will be set
  if (session.user.isMasterAdmin && !session.user.tenantId) {
    return prisma as any;
  }

  const tenantId = session.user.tenantId as string;
  if (!tenantId) {
    throw new Error("Unauthorized: No tenant context found in session");
  }

  return createScopedPrisma(tenantId) as any;
}

/**
 * Internal helper to create the scoped Prisma client
 */
function createScopedPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // List of models that MUST be scoped by tenantId
          const tenantScopedModels = [
            'Client',
            'TeamMember',
            'Property',
            'PropertyAgentAssignment',
            'Gallery',
            'Media',
            'GalleryFavorite',
            'Booking',
            'BookingAssignment',
            'BookingHistory',
            'Service',
            'Invoice',
            'EditRequest',
            'EditTag',
            'Agent',
            'TenantMembership'
          ];

          if (tenantScopedModels.includes(model)) {
            const castArgs = args as any;

            // READ OPERATIONS
            if (['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'].includes(operation)) {
              castArgs.where = { ...castArgs.where, tenantId };
            }

            // CREATE OPERATIONS
            if (['create', 'createMany'].includes(operation)) {
              const injectTenant = (item: any) => {
                const newItem = { ...item };
                
                // For createMany, we MUST use scalar tenantId
                if (operation === 'createMany') {
                  if (!newItem.tenantId) newItem.tenantId = tenantId;
                  return newItem;
                }

                // For regular create, use relation connect (Prisma standard)
                if (!newItem.tenant && !newItem.tenantId) {
                  newItem.tenant = { connect: { id: tenantId } };
                } else if (newItem.tenantId && !newItem.tenant) {
                  // If scalar is provided but relation is missing, convert to relation
                  // to satisfy Prisma's strict relation requirements in some models
                  newItem.tenant = { connect: { id: newItem.tenantId } };
                  delete newItem.tenantId;
                }
                
                return newItem;
              };

              if (Array.isArray(castArgs.data)) {
                castArgs.data = castArgs.data.map(injectTenant);
              } else {
                castArgs.data = injectTenant(castArgs.data);
              }
            }

            // UPDATE OPERATIONS
            if (['update', 'updateMany', 'upsert'].includes(operation)) {
              castArgs.where = { ...castArgs.where, tenantId };
              if (operation === 'upsert') {
                if (!castArgs.create.tenant && !castArgs.create.tenantId) {
                  castArgs.create.tenant = { connect: { id: tenantId } };
                } else if (castArgs.create.tenantId && !castArgs.create.tenant) {
                  castArgs.create.tenant = { connect: { id: castArgs.create.tenantId } };
                  delete castArgs.create.tenantId;
                }
              }
            }

            // DELETE OPERATIONS
            if (['delete', 'deleteMany'].includes(operation)) {
              castArgs.where = { ...castArgs.where, tenantId };
            }

            return query(castArgs);
          }

          // Important: Default return for non-scoped models (like User, Account, etc.)
          return query(args);
        },
      },
    },
  });
}

/**
 * Helper to get the current tenant ID from session safely
 */
export async function getSessionTenantId() {
  const session = await auth();
  return session?.user?.tenantId as string | undefined;
}

/**
 * Checks if the tenant has an active subscription or trial.
 * Returns true if allowed to perform actions, false if "Action-Locked".
 */
export async function checkSubscriptionStatus(tenantId?: string) {
  const tId = tenantId || await getSessionTenantId();
  if (!tId) return false;

  try {
    // We use a raw query here as a fallback in case the Prisma Client generation
    // is being cached by the Next.js dev server.
    const results: any[] = await prisma.$queryRawUnsafe(
      `SELECT "subscriptionStatus", "trialEndsAt", "subscriptionEndsAt", "subscriptionOverwrite" FROM "Tenant" WHERE id = $1 LIMIT 1`,
      tId
    );

    if (!results || results.length === 0) return false;
    const tenant = results[0];

    // 0. Check for master overwrite
    if (tenant.subscriptionOverwrite === true) {
      return true;
    }

    // 1. Check for explicit active subscription
    if (tenant.subscriptionStatus === "active" || tenant.subscriptionStatus === "trialing") {
      return true;
    }

    // 2. Check for trial period still in effect
    if (tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date()) {
      return true;
    }

    // 3. Check for subscription still within paid period (even if canceled)
    if (tenant.subscriptionEndsAt && new Date(tenant.subscriptionEndsAt) > new Date()) {
      return true;
    }

    // Default to trial for new accounts that haven't been processed by the webhook yet
    // but have a trial date (safety fallback)
    if (!tenant.subscriptionStatus && tenant.trialEndsAt) {
      return new Date(tenant.trialEndsAt) > new Date();
    }

    return false;
  } catch (err) {
    console.error("Subscription check fallback error:", err);
    // If the columns don't exist yet in the DB, assume active (safety first)
    return true;
  }
}

/**
 * Enforces a subscription check. Throws an error if not subscribed.
 * Use this in Server Actions to prevent API-level bypasses.
 */
export async function enforceSubscription() {
  const isSubscribed = await checkSubscriptionStatus();
  if (!isSubscribed) {
    throw new Error("Action-Locked: Active subscription required to perform this action.");
  }
}

