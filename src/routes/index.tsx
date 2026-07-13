import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "@/features/perfect-property/components/LandingPage";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Perfect Property — AI-powered real estate intelligence" },
      {
        name: "description",
        content:
          "Evaluate markets, rank opportunities, and trace every signal to its source inside one investment workspace.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  return (
    <LandingPage
      onExplore={() => void navigate({ to: "/workspace" })}
      onSignIn={() => void navigate({ to: "/auth", search: { next: "/workspace" } })}
    />
  );
}
