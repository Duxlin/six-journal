import { createFileRoute } from "@tanstack/react-router";
import { LiveChart } from "@/components/chart/live-chart";

export const Route = createFileRoute("/chart")({
  component: ChartPage,
});

function ChartPage() {
  return <LiveChart />;
}
