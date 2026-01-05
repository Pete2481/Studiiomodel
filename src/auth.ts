import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
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
            isMasterAdmin: true
          };
        }

        if (user.memberships.length === 0) {
          return null;
        }

        const membership = user.memberships[0];

        // Ensure the membership isn't for a deleted team member
        if (membership.teamMember?.deletedAt) {
          return null;
        }

        // 4. Contextual Name: Use Agent/TeamMember name if applicable
        let displayName = user.name;
        let agentId = null;
        let teamMemberId = null;
        let sessionRole = membership.role as string;
        
        if (membership.role === "AGENT" && membership.clientId) {
          const agent = await prisma.agent.findFirst({
            where: { 
              clientId: membership.clientId,
              tenantId: membership.tenantId,
              email: user.email,
              deletedAt: null // Ensure agent isn't deleted
            },
            select: { id: true, name: true }
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
              deletedAt: null // Ensure team member isn't deleted
            },
            select: { id: true, displayName: true, role: true }
          });
          if (member) {
            displayName = member.displayName;
            teamMemberId = member.id;
            
            // Promote sub-role to session role ONLY if the user isn't already a TENANT_ADMIN or ADMIN
            // This prevents downgrading an admin who happens to have a team member record for assignments.
            if (membership.role !== "TENANT_ADMIN" && membership.role !== "ADMIN") {
              if (member.role === "EDITOR") {
                sessionRole = "EDITOR";
              } else if (member.role === "PHOTOGRAPHER") {
                sessionRole = "PHOTOGRAPHER";
              }
            }
          } else if (membership.role === "TEAM_MEMBER") {
            // If we're here, it means we have a TEAM_MEMBER membership but no non-deleted TeamMember record
            return null;
          }
        }

        // 5. Return User object for JWT
        // SAFETY: Only return what is NECESSARY for the session.
        // We strip the 'image' if it's too large to prevent header/cookie overflow.
        const safeImage = (user.image && user.image.length > 2000) ? null : user.image;

        return {
          id: user.id,
          email: user.email,
          name: displayName,
          image: safeImage,
          tenantId: membership.tenantId,
          tenantSlug: membership.tenant.slug, // Added slug
          role: sessionRole,
          clientId: membership.clientId ?? undefined,
          agentId: agentId ?? undefined,
          teamMemberId: teamMemberId ?? undefined,
          isMasterAdmin: user.isMasterAdmin
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug; // Added slug
        token.role = user.role;
        token.clientId = user.clientId;
        token.agentId = user.agentId;
        token.teamMemberId = user.teamMemberId;
        token.isMasterAdmin = user.isMasterAdmin;

        // Fetch specific permissions for the membership
        if (token.tenantId) {
          try {
            const dbRole = (token.role === "EDITOR" || token.role === "PHOTOGRAPHER") 
              ? "TEAM_MEMBER" 
              : token.role;

            const membership = await prisma.tenantMembership.findFirst({
              where: { 
                tenantId: token.tenantId as string,
                userId: token.id as string,
                role: dbRole as any,
                clientId: (token.clientId as string | null) || null
              },
              select: { permissions: true }
            });
            if (membership) {
              token.permissions = membership.permissions;
            }
          } catch (permissionError) {
            console.error("[AUTH_JWT_PERMISSIONS_ERROR]:", permissionError);
            // Non-blocking, continue with default permissions
          }
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.id;
        session.user.tenantId = token.tenantId;
        session.user.tenantSlug = token.tenantSlug; // Added slug
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

