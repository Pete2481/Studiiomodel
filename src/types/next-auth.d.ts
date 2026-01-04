import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId?: string;
      tenantSlug?: string;
      role?: string;
      clientId?: string;
      isMasterAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    tenantId?: string;
    tenantSlug?: string;
    role?: string;
    clientId?: string;
    isMasterAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId?: string;
    tenantSlug?: string;
    role?: string;
    clientId?: string;
    isMasterAdmin: boolean;
  }
}

