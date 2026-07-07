import { arcgisQuery } from "./arcgis";
import { FEMA_NFHL } from "./sources";

/**
 * FEMA flood-zone lookup for a point. Returns the FLD_ZONE string
 * (e.g. "AE", "VE", "X", "AO"). Empty string when the point is outside
 * mapped panels.
 */
export async function femaFloodZoneAt(lat: number, lng: number): Promise<string> {
  try {
    const feats = await arcgisQuery(FEMA_NFHL, {
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPoint",
      outFields: "FLD_ZONE",
      returnGeometry: false,
      resultRecordCount: 1,
    });
    return feats[0]?.attributes?.FLD_ZONE ?? "X";
  } catch {
    return "X";
  }
}
