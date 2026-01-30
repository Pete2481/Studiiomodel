import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

async function buildSessionUserFromUser(user: any, tenantId: string) {
  if (!user) return null;

  // For MASTER login, just check the flag
  if (tenantId === "MASTER") {
    if (!user.isMasterAdmin) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      tenantId: undefined,
      role: "MASTER_ADMIN",
      isMasterAdmin: true,
    };
  }

  // SAFETY: Master Admins are NOT allowed to act as Tenant Admins or Team Members
  if (user.isMasterAdmin) {
    console.warn(`[AUTH] Master Admin (${user.email}) attempted to login to tenant ${tenantId}. Blocked.`);
    return null;
  }

  if (!Array.isArray(user.memberships) || user.memberships.length === 0) {
    return null;
  }

  const membership = user.memberships[0];

  // Ensure the membership isn't for a deleted team member
  if (membership.teamMember?.deletedAt) {
    return null;
  }

  // Contextual Name: Use Agent/TeamMember name if applicable
  let displayName = user.name;
  let agentId = null;
  let teamMemberId = null;
  let sessionRole = membership.role as string;

  if (membership.role === "CLIENT" && membership.clientId) {
    const client = await prisma.client.findFirst({
      where: {
        id: membership.clientId,
        tenantId: membership.tenantId,
        deletedAt: null,
      },
      select: { name: true },
    });
    if (client?.name) displayName = client.name;
  } else if (membership.role === "AGENT" && membership.clientId) {
    const agent = await prisma.agent.findFirst({
      where: {
        clientId: membership.clientId,
        tenantId: membership.tenantId,
        email: user.email,
        deletedAt: null, // Ensure agent isn't deleted
      },
      select: { id: true, name: true },
    });
    if (agent) {
      displayName = agent.name;
      agentId = agent.id;
    }
  } else if (membership.role === "TEAM_MEMBER" || membership.role === "TENANT_ADMIN") {
    const member = await prisma.teamMember.findFirst({
      where: {
        tenantId: membership.tenantId,
        email: user.email,
        deletedAt: null, // Ensure team member isn't deleted
      },
      select: { id: true, displayName: true, role: true },
    });
    if (member) {
      displayName = member.displayName;
      teamMemberId = member.id;

      // Promote sub-role to session role ONLY if the user isn't already a TENANT_ADMIN
      // This prevents downgrading an admin who happens to have a team member record for assignments.
      if (membership.role === "TEAM_MEMBER") {
        sessionRole = member.role;
      }
    } else if (membership.role === "TEAM_MEMBER") {
      // If we're here, it means we have a TEAM_MEMBER membership but no non-deleted TeamMember record
      return null;
    }
  }

  // SAFETY: Only return what is NECESSARY for the session.
  // We strip the 'image' if it's too large to prevent header/cookie overflow.
  const safeImage = user.image && user.image.length > 2000 ? null : user.image;

  return {
    id: user.id,
    email: user.email,
    name: displayName,
    image: safeImage,
    tenantId: membership.tenantId,
    tenantSlug: membership.tenant.slug,
    membershipId: membership.id,
    role: sessionRole,
    clientId: membership.clientId ?? undefined,
    agentId: agentId ?? undefined,
    teamMemberId: teamMemberId ?? undefined,
    isMasterAdmin: user.isMasterAdmin,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      id: "password",
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        tenantId: { label: "Tenant ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.tenantId) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = String(credentials.password || "");
        const tenantId = credentials.tenantId as string;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              where:
                tenantId === "MASTER"
                  ? undefined
                  : {
                      id: tenantId,
                      tenant: { deletedAt: null }, // Ensure tenant isn't deleted
                    },
              include: {
                tenant: true,
                teamMember: true, // Include teamMember to check deletion
              },
            },
          },
        });

        if (!user) return null;
        if (!(await verifyPassword(password, (user as any).passwordHash))) return null;

        return await buildSessionUserFromUser(user, tenantId);
      },
    }),
    Credentials({
      name: "OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        tenantId: { label: "Tenant ID", type: "text" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.otp || !credentials?.tenantId) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const otp = credentials.otp as string;
        const tenantId = credentials.tenantId as string;

        // 1. Verify OTP
        const identifier = `${email}:${tenantId}`;
        const tokenRecord = await prisma.verificationToken.findFirst({
          where: {
            identifier,
            token: otp,
            expires: { gte: new Date() }
          }
        });

        if (!tokenRecord) {
          return null;
        }

        // 2. Consume OTP (delete it)
        await prisma.verificationToken.delete({
          where: { token: otp }
        });

        // 3. Find User & Membership
        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              where: tenantId === "MASTER" ? undefined : { 
                id: tenantId,
                tenant: { deletedAt: null } // Ensure tenant isn't deleted
              },
              include: { 
                tenant: true,
                teamMember: true // Include teamMember to check deletion
              }
            }
          }
        });

        return await buildSessionUserFromUser(user, tenantId);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.membershipId = user.membershipId;
        token.role = user.role;
        token.clientId = user.clientId;
        token.agentId = user.agentId;
        token.teamMemberId = user.teamMemberId;
        token.isMasterAdmin = user.isMasterAdmin;
      }

      // IMPORTANT: Membership.permissions can change after login (admin updates toggles).
      // Refresh permissions periodically so access changes take effect without requiring logout/login.
      if (token?.tenantId && token?.id) {
        try {
          // CRITICAL: This callback runs in middleware (edge runtime) too.
          // Prisma Client cannot run in Edge, and attempting it causes errors + can delay requests.
          if (process.env.NEXT_RUNTIME === "edge") {
            return token;
          }

          const now = Date.now();
          const last = typeof (token as any)._permRefreshedAt === "number" ? (token as any)._permRefreshedAt : 0;
          const shouldRefresh = !last || now - last > 30_000; // 30s TTL
          if (shouldRefresh) {
            const dbRole =
              token.role === "EDITOR" || token.role === "PHOTOGRAPHER" || token.role === "ACCOUNTS"
                ? "TEAM_MEMBER"
                : token.role;

            const membership = await prisma.tenantMembership.findFirst({
              where: {
                tenantId: token.tenantId as string,
                userId: token.id as string,
                role: dbRole as any,
                clientId: (token.clientId as string | null) || null,
              },
              select: { permissions: true },
            });
            if (membership) {
              token.permissions = membership.permissions;
            }
            (token as any)._permRefreshedAt = now;
          }
        } catch (permissionError) {
          console.error("[AUTH_JWT_PERMISSIONS_ERROR]:", permissionError);
          // Non-blocking, continue with last-known permissions
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.id;
        session.user.tenantId = token.tenantId;
        session.user.tenantSlug = token.tenantSlug;
        session.user.membershipId = token.membershipId;
        session.user.role = token.role;
        session.user.clientId = token.clientId;
        session.user.agentId = token.agentId;
        session.user.teamMemberId = token.teamMemberId;
        session.user.isMasterAdmin = token.isMasterAdmin;
        (session.user as any).permissions = token.permissions;
      }
      return session;
    },
  },
});

