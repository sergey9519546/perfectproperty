import { createFileRoute } from "@tanstack/react-router";
import { MarketWorkspace } from "@/features/perfect-property/MarketWorkspace";

export const Route = createFileRoute("/workspace")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Market Intelligence — Perfect Property" },
      {
        name: "description",
        content: "Explore calibrated real-estate markets, opportunities, and evidence.",
      },
    ],
  }),
  component: MarketWorkspace,
});
