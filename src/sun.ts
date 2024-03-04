import { DateTime } from "luxon";
import { LongLat } from "./types";

const DEG = Math.PI / 180;
export const EPOCH = DateTime.utc(2000, 1, 1, 12, 0, 0, 0);

export function calcSun(time: DateTime): LongLat {
  const n = time.diff(EPOCH).as("days");

  // Mean longitude and mean anomoly
  const L = ((280.46 + 0.9856474 * n) % 360) * DEG;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;

  // Ecliptic longitude
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2.0 * g)) * DEG;

  // Obliquity of the eliptic
  const eta = (23.439 - 0.0000004 * n) * DEG;

  // Equatorial coordinates
  const alpha = Math.atan2(Math.cos(eta) * Math.sin(lambda), Math.cos(lambda));
  const sigma = Math.asin(Math.sin(eta) * Math.sin(lambda));

  // Greenwhich hour angle
  const gha = -2 * Math.PI * (n % 1) + (alpha - L);

  return [boundAngle(gha), sigma];
}

function boundAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
