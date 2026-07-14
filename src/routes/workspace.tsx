import { createFileRoute, redirect } from "@tanstack/react-router";
import { MarketWorkspace } from "@/features/perfect-property/MarketWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { SectionBoundary } from "@/components/SectionBoundary";

export const Route = createFileRoute("/workspace")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: "/workspace" } });
  },
  head: () => ({
    meta: [
      { title: "Live Workspace — Perfect Property" },
      {
        name: "description",
        content: "Map, rank, and inspect live underwritten parcels with source-backed evidence.",
      },
    ],
  }),
  component: () => (
    <SectionBoundary label="Workspace unavailable" minHeight={400}>
      <MarketWorkspace />
    </SectionBoundary>
  ),
});