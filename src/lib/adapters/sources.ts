/**
 * REAL public data sources — no keys required.
 *
 * Every URL below has been verified to return live data. If a county
 * changes their endpoint, the adapter logs it in ingestion_runs as
 * PARTIAL / FAIL with the exact upstream error.
 */

export type SourceKind = "ARCGIS" | "SOCRATA" | "HTML" | "FEMA";

export interface CountySource {
  fips: string;
  state: string;
  name: string;
  center: [number, number];
  parcels?: {
    kind: SourceKind;
    url: string;
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
    // Socrata-only: how to build the address from row fields
    address_builder?: "sf" | "nyc";
  };
  distress?: {
    kind: SourceKind;
    url: string;
    event_type: string;
    note: string;
  };
}

export const COUNTY_SOURCES: CountySource[] = [
  {
    fips: "06037", state: "CA", name: "Los Angeles County",
    center: [34.0522, -118.2437],
    parcels: {
      kind: "ARCGIS",
      url: "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0",
      field_apn: "AIN",
      field_address: "SitusFullAddress",
      field_city: "SitusCity",
      field_zip: "SitusZIP",
    },
  },
  {
    fips: "06075", state: "CA", name: "San Francisco",
    center: [37.7749, -122.4194],
    parcels: {
      kind: "SOCRATA",
      url: "https://data.sfgov.org/resource/acdm-wktn.json",
      field_apn: "mapblklot",
      address_builder: "sf",
    },
  },
  {
    fips: "36061", state: "NY", name: "New York (PLUTO)",
    center: [40.7580, -73.9855],
    parcels: {
      kind: "SOCRATA",
      url: "https://data.cityofnewyork.us/resource/64uk-42ks.json",
      field_apn: "bbl",
      field_address: "address",
      field_zip: "zipcode",
      field_year_built: "yearbuilt",
      field_living_sqft: "bldgarea",
      field_lot_sqft: "lotarea",
      field_owner: "ownername",
      field_assessed: "assesstot",
      address_builder: "nyc",
    },
    distress: {
      kind: "SOCRATA",
      url: "https://data.cityofnewyork.us/resource/wvxf-dwi5.json",
      event_type: "CODE_VIOLATION",
      note: "NYC HPD open housing-code violations",
    },
  },
  {
    fips: "17031", state: "IL", name: "Chicago (Cook)",
    center: [41.8781, -87.6298],
    distress: {
      kind: "SOCRATA",
      url: "https://data.cityofchicago.org/resource/22u3-xenr.json",
      event_type: "CODE_VIOLATION",
      note: "Chicago Dept. of Buildings open violations",
    },
  },
];

export const FEMA_NFHL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28";

export const HUD_HOMES = "https://www.hudhomestore.gov/Home/Index.aspx";

export const CENSUS_GEOCODER =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
