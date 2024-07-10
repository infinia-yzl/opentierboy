import TierListManager from "@/components/TierListManager";
import {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";

const Home = () => {
  return (
    <main className="flex flex-col items-center justify-between">
      <TierListManager initialTiers={DEFAULT_TIER_TEMPLATE}/>
    </main>
  );
};

export default Home;
