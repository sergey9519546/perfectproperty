import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      throw redirect({ to: "/auth", search: { next: "/admin" } });
    }
    const { data: isAdmin, error } = await (supabase as any).rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (error || !isAdmin) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});
