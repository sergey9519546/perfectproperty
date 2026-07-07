/**
 * NYC Department of Finance — Citywide Rolling Calendar Sales.
 * Single Socrata endpoint covers all five boroughs.
 *
 * Dataset: https://data.cityofnewyork.us/resource/usep-8jbt
 * Columns: borough | block | lot | building_class_category | address | zip_code
 *          residential_units | land_square_feet | gross_square_feet | year_built
 *          sale_price | sale_date
 */

import { socrataQuery } from "./socrata";

export const NYC_CITYWIDE_SALES_URL = "https://data.cityofnewyork.us/resource/usep-8jbt.json";

// NYC borough code → county FIPS
const BOROUGH_TO_FIPS: Record<string, string> = {
  "1": "36061", // Manhattan / New York County
  "2": "36005", // Bronx
  "3": "36047", // Brooklyn / Kings
  "4": "36081", // Queens
  "5": "36085", // Staten Island / Richmond
};

const BOROUGH_NAME: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

export interface NycSaleRow {
  external_apn: string;
  county_fips: string;
  address: string | null;
  sold_at: string;
  sale_price: number;
  living_sqft: number | null;
  land_sqft: number | null;
  year_built: number | null;
  building_class: string | null;
  source_url: string;
}

function toBBL(borough: string, block: number, lot: number): string {
  return `${borough}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}




/**
 * Fetch recent arms-length sales for one borough (or citywide when fips omitted).
 */
export async function fetchNycSales(fips: string | null, limit = 1000): Promise<NycSaleRow[]> {
  const cutoff = new Date(Date.now() - 500 * 86400 * 1000).toISOString().slice(0, 10);
  const boroughCode = fips ? Object.entries(BOROUGH_TO_FIPS).find(([, f]) => f === fips)?.[0] : null;
  const where = [
    `sale_price > 10000`,
    `sale_date > '${cutoff}'`,
    boroughCode ? `borough='${boroughCode}'` : null,
  ].filter(Boolean).join(" AND ");
  const rows = await socrataQuery(NYC_CITYWIDE_SALES_URL, { limit, where });
  const out: NycSaleRow[] = [];
  for (const r of rows) {
    const borough = String(r.borough ?? "").trim();
    const county = BOROUGH_TO_FIPS[borough];
    if (!county) continue;
    const block = Number(r.block);
    const lot = Number(r.lot);
    const price = parseNum(r.sale_price);
    if (!Number.isFinite(block) || !Number.isFinite(lot) || !price) continue;
    const rawDate = String(r.sale_date ?? "").slice(0, 10);
    if (!rawDate) continue;
    out.push({
      external_apn: toBBL(borough, block, lot),
      county_fips: county,
      address: r.address ? String(r.address).trim() : null,
      sold_at: rawDate,
      sale_price: price,
      living_sqft: parseNum(r.gross_square_feet),
      land_sqft: parseNum(r.land_square_feet),
      year_built: parseNum(r.year_built),
      building_class: r.building_class_category ? String(r.building_class_category).trim() : null,
      source_url: NYC_CITYWIDE_SALES_URL,
    });
  }
  return out;
}

export function nycBoroughs() {
  return Object.entries(BOROUGH_TO_FIPS).map(([code, fips]) => ({
    code, fips, name: BOROUGH_NAME[code]!, url: NYC_CITYWIDE_SALES_URL,
  }));
}

export function boroughFor(fips: string) {
  const entry = Object.entries(BOROUGH_TO_FIPS).find(([, f]) => f === fips);
  if (!entry) return null;
  return { code: entry[0], fips: entry[1], name: BOROUGH_NAME[entry[0]]!, url: NYC_CITYWIDE_SALES_URL };
}
