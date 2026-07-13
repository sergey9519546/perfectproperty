import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { TopBar } from "./components/TopBar";
import { NavigationRail } from "./components/NavigationRail";
import { EvidencePanel } from "./components/EvidencePanel";
import { DealTable } from "./components/DealTable";
import { CommandPalette } from "./components/CommandPalette";
import { MapCanvas } from "./components/MapCanvas";
import {
  deals,
  markets,
  type LayerMode,
  type Market,
  type PropertyFilter,
  type RegionFilter,
} from "./data";

const routeByNavigationId: Record<string, string> = {
  deals: "/deals",
  assets: "/shadow",
  models: "/accuracy",
  targets: "/prophecy",
  sources: "/admin",
};

export function MarketWorkspace() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState("map");
  const [region, setRegion] = useState<RegionFilter>("All markets");
  const [propertyType, setPropertyType] = useState<PropertyFilter>("All types");
  const [layer, setLayer] = useState<LayerMode>("Opportunity score");
  const [selected, setSelected] = useState<Market | null>(markets[0]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filteredMarkets = useMemo(
    () =>
      markets.filter((market) => {
        const regionMatch =
          region === "All markets" ||
          (region === "California" ? market.state === "CA" : market.state === "FL");
        const typeMatch = propertyType === "All types" || market.type === propertyType;
        return regionMatch && typeMatch;
      }),
    [region, propertyType],
  );

  useEffect(() => {
    if (filteredMarkets.length && selected && !filteredMarkets.some((market) => market.id === selected.id)) {
      setSelected(filteredMarkets[0]);
    }
    if (!filteredMarkets.length) setSelected(null);
  }, [filteredMarkets, selected]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const selectFromDeal = (marketName: string) => {
    const [name] = marketName.split(",");
    const market = markets.find((item) => item.name === name);
    if (market) {
      setRegion("All markets");
      setPropertyType("All types");
      setSelected(market);
    }
  };

  const handleNavigation = (id: string) => {
    setActiveNav(id);
    if (id === "map") return;
    const route = routeByNavigationId[id];
    if (route) {
      void navigate({ to: route as "/deals" });
      return;
    }
    notify(`${id[0].toUpperCase() + id.slice(1)} workspace is coming soon`);
  };

  return (
    <div className="perfect-property-ui app-shell min-h-[100dvh] bg-[#01070c] text-[#f3f6f8]">
      <TopBar
        onHome={() => void navigate({ to: "/" })}
        onOpenPalette={() => setPaletteOpen(true)}
        onExport={() => notify("Investment brief exported")}
      />
      <div className="app-body grid min-h-0 grid-cols-[64px_minmax(0,1fr)] max-md:grid-cols-1">
        <NavigationRail active={activeNav} onChange={handleNavigation} />
        <div className="product-grid grid min-h-0 grid-cols-[minmax(0,1fr)_350px] max-xl:grid-cols-[minmax(0,1fr)_320px] max-lg:grid-cols-1">
          <div className="center-workspace grid min-h-0 grid-rows-[minmax(0,1fr)_258px] max-lg:grid-rows-[620px_auto] max-md:grid-rows-[62dvh_auto]">
            <MapCanvas
              markets={filteredMarkets}
              selected={selected}
              onSelect={setSelected}
              region={region}
              propertyType={propertyType}
              onRegionChange={setRegion}
              onPropertyTypeChange={setPropertyType}
              layer={layer}
              onLayerChange={setLayer}
            />
            <DealTable
              deals={deals}
              selectedMarket={selected ? `${selected.name}, ${selected.state}` : null}
              onSelectMarket={selectFromDeal}
            />
          </div>
          <EvidencePanel
            market={selected}
            onUnderwrite={() => notify(`${selected?.name ?? "Market"} underwrite created`)}
          />
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        markets={markets}
        onClose={() => setPaletteOpen(false)}
        onSelect={(market) => {
          setRegion("All markets");
          setPropertyType("All types");
          setSelected(market);
        }}
      />
      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
            className="fixed bottom-5 right-5 z-30 flex items-center gap-3 rounded-[5px] border border-[#83a0b3]/25 bg-[#091721] px-4 py-3 text-[12px] shadow-[0_20px_60px_rgba(0,5,9,.46),inset_0_1px_0_rgba(255,255,255,.05)]"
          >
            <CheckCircle size={18} className="text-[#05d680]" />
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
