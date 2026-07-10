import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchParcels from "./tools/search-parcels";
import getParcelScore from "./tools/get-parcel-score";
import lookupAddress from "./tools/lookup-address";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "perfect-property-mcp",
  title: "Perfect Property Engine",
  version: "0.1.0",
  instructions:
    "Query the Perfect Property Engine: search parcels, fetch nightly underwriting scores (ARV, offer, projected profit, risk metrics), and resolve street addresses to parcels. All tools act as the signed-in user; row-level security applies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchParcels, getParcelScore, lookupAddress],
});
