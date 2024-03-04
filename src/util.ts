import { LongLat } from "./types";

export function formatCoords(coords: LongLat, delim = " ") {
  const inner = (angle: number, neg: string, pos: string) => {
    const degrees = Math.abs((angle * 180) / Math.PI);
    const d = Math.floor(degrees).toFixed(0);
    const m = Math.floor((60 * degrees) % 60)
      .toFixed(0)
      .padStart(2, "0");
    const s = Math.floor((3600 * degrees) % 60)
      .toFixed(0)
      .padStart(2, "0");
    return `${d}° ${m}' ${s}" ${angle >= 0 ? pos : neg}`;
  };

  return [inner(coords[1], "S", "N"), inner(coords[0], "W", "E")].join(delim);
}
