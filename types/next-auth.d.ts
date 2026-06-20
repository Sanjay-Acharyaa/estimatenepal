import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      isSuperAdmin: boolean;
      orgId: string | null;
      trialEndsAt: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    isSuperAdmin?: boolean;
    orgId?: string | null;
    orgName?: string | null;
    trialEndsAt?: string | null;
    passwordChangedAt?: string | null;
    sessionSeq?: number;
    invalidated?: boolean;
  }
}
