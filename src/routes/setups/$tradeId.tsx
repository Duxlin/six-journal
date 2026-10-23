import { Link, createFileRoute } from "@tanstack/react-router";
import { TradeDetail } from "@/components/journal/trade-detail";
import { useJournal } from "@/lib/journal/store";

export const Route = createFileRoute("/setups/$tradeId")({
  component: TradePage,
});

function TradePage() {
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
  return <TradeDetail trade={trade} />;
}
