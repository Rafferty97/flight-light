declare module 'geobuf' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function decode(pbf: any): any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function encode(geojson: any, pbf: any): any
}

declare module 'pbf' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Pbf: any
  export = Pbf
}

declare module 'browser-geo-tz' {
  export function find(lat: number, lon: number): Promise<string[]>
  export function toOffset(timeZone: string): number
  export function init(
    geoDataSource?: string | ((start: number, end: number) => Promise<ArrayBuffer>),
    tzDataSource?: string | (() => Promise<unknown>)
  ): { find: (lat: number, lon: number) => Promise<string[]> }
}
