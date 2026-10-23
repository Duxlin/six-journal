import { Link, createFileRoute } from "@tanstack/react-router";
import { TradeForm } from "@/components/journal/trade-form";
import { useJournal } from "@/lib/journal/store";

export const Route = createFileRoute("/setups/$tradeId/edit")({
  component: EditTrade,
});

function EditTrade() {
  const { tradeId } = Route.useParams();
  const trade = useJournal((state) => state.trades.find((item) => item.id === tradeId));
  if (!trade) {
    return (
      <div>
        <p className="text-sm text-muted">That setup is not in this journal.</p>
        <Link to="/setups" className="mt-4 inline-block text-sm text-brass">
          Back to trades
        </Link>
      </div>
    );
  }
  return <TradeForm existing={trade} />;
}
