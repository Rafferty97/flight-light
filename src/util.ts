import { LongLat, Vec2, Vec3 } from "./types";

export function vadd(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vadd3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vsub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function vdot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function vdot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vlen(a: Vec2): number {
  return Math.sqrt(vdot(a, a));
}

export function vlen3(a: Vec3): number {
  return Math.sqrt(vdot3(a, a));
}

export function vmul(a: Vec2, s: number): Vec2 {
  return [s * a[0], s * a[1]];
}

export function vmul3(a: Vec3, s: number): Vec3 {
  return [s * a[0], s * a[1], s * a[2]];
}

export function vnorm(a: Vec2): Vec2 {
  return vmul(a, 1 / vlen(a));
}

export function vnorm3(a: Vec3): Vec3 {
  return vmul3(a, 1 / vlen3(a));
}

export function vrot90(a: Vec2): Vec2 {
  return [a[1], -a[0]];
}

export function hav(theta: number): number {
  return 0.5 * (1.0 - Math.cos(theta));
}

export function calcAngle(a: LongLat, b: LongLat): number {
  let havTheta = hav(a[1] - b[1]) + Math.cos(a[1]) * Math.cos(b[1]) * hav(a[0] - b[0]);
  havTheta = Math.min(Math.max(havTheta, 0.0), 1.0);
  return 2.0 * Math.asin(Math.sqrt(havTheta));
}

export function normaliseCoords(coords: LongLat): LongLat {
  return [
    coords[0] - 2 * Math.PI * Math.round(coords[0] / (2 * Math.PI)),
    Math.min(Math.max(coords[1], -Math.PI), Math.PI),
  ];
}

export function formatCoords(coords: LongLat, delim = " ") {
  const inner = (angle: number, neg: string, pos: string) => {
    const degrees = Math.abs(angle * (180 / Math.PI));
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

function toCart(a: LongLat): Vec3 {
  return [Math.cos(a[0]) * Math.cos(a[1]), Math.sin(a[0]) * Math.cos(a[1]), Math.sin(a[1])];
}

function fromCart(a: Vec3): LongLat {
  const [x, y, z] = a;
  const long = Math.atan2(y, x);
  const lat = Math.asin(z / Math.sqrt(x * x + y * y + z * z));
  return [long, lat];
}

export function midCoord(a: LongLat, b: LongLat): LongLat {
  const x = Math.cos(a[0]) * Math.cos(a[1]) + Math.cos(b[0]) * Math.cos(b[1]);
  const y = Math.sin(a[0]) * Math.cos(a[1]) + Math.sin(b[0]) * Math.cos(b[1]);
  const z = Math.sin(a[1]) + Math.sin(b[1]);
  return [Math.atan2(y, x), Math.asin(z / Math.sqrt(x * x + y * y + z * z))];
}

export function geodesic(a: LongLat, b: LongLat, step: number): LongLat[] {
  const dot = Math.cos(step);

  let last = toCart(a);
  let lastPoint = fromCart(last);
  let next: Vec3 | undefined = toCart(b);

  const out = [lastPoint];
  const stack: Vec3[] = [];

  while (next) {
    const delta = vdot3(next, last);
    if (delta > dot || out.length + stack.length > 1000) {
      const point = fromCart(next);
      point[0] -= 2 * Math.PI * Math.round((point[0] - lastPoint[0]) / (2 * Math.PI));
      out.push(point);
      last = next;
      lastPoint = point;
      next = stack.pop();
    } else {
      const mid = vnorm3(vadd3(last, next));
      stack.push(next);
      next = mid;
    }
  }

  return out;
}

export function verticesFromCoords(points: LongLat[]): Vec2[] {
  return points.map((p) => [p[0] / Math.PI, p[1] / Math.PI]);
}

export function createLine(points: Vec2[], radius: number): Float32Array {
  // Line
  const xs = points.flatMap((point, index) => {
    const prev = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];
    const o = vrot90(vmul(vnorm(vsub(next, prev)), radius));
    return [point[0] - o[0], point[1] - o[1], point[0] + o[0], point[1] + o[1]];
  });

  // End caps
  xs.unshift(...startCap(points[0], points[1], radius, 3));
  xs.push(...endCap(points[points.length - 1], points[points.length - 2], radius, 3));

  return new Float32Array(xs);
}

function startCap(c: Vec2, p: Vec2, r: number, n: number): number[] {
  const xs: number[] = [];
  const theta = Math.PI / (2 * n + 1);
  const angle = Math.atan2(p[0] - c[0], c[1] - p[1]);
  for (let i = n; i >= 0; i--) {
    xs.push(c[0] + r * Math.cos(angle + i * theta));
    xs.push(c[1] + r * Math.sin(angle + i * theta));
    xs.push(c[0] + r * Math.cos(angle + Math.PI - i * theta));
    xs.push(c[1] + r * Math.sin(angle + Math.PI - i * theta));
  }
  return xs;
}

function endCap(c: Vec2, p: Vec2, r: number, n: number): number[] {
  const xs: number[] = [];
  const theta = Math.PI / (2 * n + 1);
  const angle = Math.atan2(p[0] - c[0], c[1] - p[1]);
  for (let i = 1; i <= n; i++) {
    xs.push(c[0] + r * Math.cos(angle + Math.PI - i * theta));
    xs.push(c[1] + r * Math.sin(angle + Math.PI - i * theta));
    xs.push(c[0] + r * Math.cos(angle + i * theta));
    xs.push(c[1] + r * Math.sin(angle + i * theta));
  }
  return xs;
}
