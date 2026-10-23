import { createFileRoute } from "@tanstack/react-router";
import { TradeForm } from "@/components/journal/trade-form";

export const Route = createFileRoute("/setups/new")({
  component: NewTrade,
});

function NewTrade() {
  return <TradeForm />;
}
