import { LongLat } from "./types";

export interface Airport {
  code: string;
  coords: LongLat;
}

export async function loadAirports(): Promise<Airport[]> {
  const raw = await (await fetch("/airports.txt")).text();
  const out: Airport[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.trim().split(":");
    out.push({
      code: parts[1],
      coords: [
        parseFloat(parts[15]) * (Math.PI / 180), //
        parseFloat(parts[14]) * (Math.PI / 180),
      ],
    });
  }
  return out;
}
