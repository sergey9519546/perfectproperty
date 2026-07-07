/**
 * REAL public data sources — no keys required.
 *
 * These are open ArcGIS REST / Socrata endpoints published by county
 * assessors and federal agencies. They are the actual URLs the machine
 * hits at ingest time. If a county changes their endpoint, edit here.
 */

export type SourceKind = "ARCGIS" | "SOCRATA" | "HTML" | "FEMA";

export interface CountySource {
  fips: string;
  state: string;
  name: string;
  center: [number, number]; // [lat, lng]
  parcels?: {
    kind: SourceKind;
    url: string;
    // ArcGIS field mapping
    field_apn?: string;
    field_address?: string;
    field_city?: string;
    field_zip?: string;
    field_year_built?: string;
    field_living_sqft?: string;
    field_lot_sqft?: string;
    field_beds?: string;
    field_baths?: string;
    field_owner?: string;
    field_assessed?: string;
    // spatial bounding box for the initial scan (lng/lat)
    bbox?: [number, number, number, number];
  };
  distress?: { kind: SourceKind; url: string; note: string };
  listings?: { kind: SourceKind; url: string; note: string };
}

// Verified public ArcGIS / open-data endpoints (as of publication).
// If any 404s, the adapter surfaces PARTIAL with the exact error.
export const COUNTY_SOURCES: CountySource[] = [
  {
    fips: "06037", state: "CA", name: "Los Angeles County",
    center: [34.0522, -118.2437],
    parcels: {
      kind: "ARCGIS",
      url: "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Parcel/MapServer/0",
      field_apn: "AIN",
      field_address: "SitusFullAddress",
      field_city: "SitusCity",
      field_zip: "SitusZipCode",
      field_year_built: "YearBuilt",
      field_living_sqft: "SQFTmain",
      field_lot_sqft: "Shape__Area",
      field_beds: "Bedrooms",
      field_baths: "Bathrooms",
      field_owner: "OwnerName",
      field_assessed: "TotalValue",
    },
    distress: {
      kind: "HTML", note: "LA County Treasurer publishes tax-defaulted properties",
      url: "https://ttc.lacounty.gov/tax-defaulted-property-auction/",
    },
  },
  {
    fips: "06073", state: "CA", name: "San Diego County",
    center: [32.7157, -117.1611],
    parcels: {
      kind: "ARCGIS",
      url: "https://gis-public.sandiegocounty.gov/arcgis/rest/services/Hosted/Parcels_Public/FeatureServer/0",
      field_apn: "APN",
      field_address: "SITUS_ADDRESS",
      field_city: "SITUS_COMMUNITY",
      field_zip: "SITUS_ZIP",
    },
  },
  {
    fips: "06075", state: "CA", name: "San Francisco",
    center: [37.7749, -122.4194],
    parcels: {
      kind: "SOCRATA",
      url: "https://data.sfgov.org/resource/acdm-wktn.json",
      field_apn: "mapblklot",
      field_address: "situs",
    },
  },
  {
    fips: "12086", state: "FL", name: "Miami-Dade County",
    center: [25.7617, -80.1918],
    parcels: {
      kind: "ARCGIS",
      url: "https://gisws.miamidade.gov/arcgis/rest/services/MD_PropertySearchApp/MapServer/0",
      field_apn: "FOLIO",
      field_address: "SITE_ADDRESS",
      field_city: "SITE_CITY",
      field_zip: "SITE_ZIP",
      field_year_built: "YEAR_BUILT",
      field_living_sqft: "BLDG_HEATED_AREA_SQFT",
      field_lot_sqft: "LOT_SIZE",
      field_beds: "BED",
      field_baths: "BATH",
      field_owner: "OWNER1",
      field_assessed: "ASSESSED_VALUE",
    },
  },
  {
    fips: "12011", state: "FL", name: "Broward County",
    center: [26.1224, -80.1373],
    parcels: {
      kind: "ARCGIS",
      url: "https://services.arcgis.com/pA2nEVnB6tluBGCu/arcgis/rest/services/Parcels/FeatureServer/0",
      field_apn: "FOLIO",
      field_address: "SITUS_STREET",
      field_city: "SITUS_CITY",
      field_zip: "SITUS_ZIP",
    },
  },
];

// FEMA National Flood Hazard Layer (public ArcGIS map service, layer 28 = flood zones)
export const FEMA_NFHL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";

// HUD Homes storefront — inventory of federally-owned homes for sale
export const HUD_HOMES = "https://www.hudhomestore.gov/Home/Index.aspx";

// US Census geocoder — free, no key
export const CENSUS_GEOCODER =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
