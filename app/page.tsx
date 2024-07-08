import TierListManager from "@/components/TierListManager";
import {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import {ThemeSelector} from "@/components/ThemeSelector";
import {Separator} from "@/components/ui/separator";
import {ZenToggle} from "@/components/ZenToggle";

const Home = () => {
  return (
    <main className="flex flex-col items-center justify-between">
      <div className="flex flex-row p-4 w-full justify-between items-center align-middle">
        <h1 className="text-xl">Tier Scribble</h1>
        <div className="space-x-1">
          <ZenToggle/>
          <span className="hide-in-zen">
            <ThemeSelector/>
          </span>
        </div>
      </div>
      <Separator className="mb-8"/>
      <TierListManager initialTiers={DEFAULT_TIER_TEMPLATE}/>
    </main>
  );
};

export default Home;
