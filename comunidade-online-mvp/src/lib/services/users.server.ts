import { safeServerApiFetch, serverApiFetch } from "@/lib/api/server";
import type { Me } from "@/lib/services/users";
import { redirect } from "next/navigation";

export const usersServerService = {
  me: () => safeServerApiFetch<Me>("/users/me"),
  requireMe: async () => {
    try {
      return await serverApiFetch<Me>("/users/me");
    } catch {
      redirect("/login");
    }
  },
};
