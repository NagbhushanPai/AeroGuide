/**
 * Draws the aircraft glyph as a signed-distance-field-friendly white silhouette, so one image
 * can be tinted per aircraft (altitude colour) by MapLibre's `icon-color`.
 */
const PLANE_PATH =
  "M12 1.5c.9 0 1.4 1 1.4 2.2v5.4l8.1 4.8v2.1l-8.1-2.4v4.8l2.3 1.8v1.7L12 21.1l-3.7.8v-1.7l2.3-1.8v-4.8l-8.1 2.4v-2.1l8.1-4.8V3.7c0-1.2.5-2.2 1.4-2.2z";

export const AIRCRAFT_ICON_ID = "aircraft";

export function createAircraftIcon(size = 48): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = "#ffffff";
  ctx.fill(new Path2D(PLANE_PATH));
  return ctx.getImageData(0, 0, size, size);
}
