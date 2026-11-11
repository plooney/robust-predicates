export as namespace predicates;

export const NONE: 0;
export const TANGENT: 1;
export const CROSSES_ONCE: 2;
export const CROSSES_TWICE: 3;
export const ENDPOINT_ON_CIRCLE: 4;
export const BOTH_ENDPOINTS_ON_CIRCLE: 5;
/** Classifies circumference intersections. Endpoint contact takes precedence; negative radius throws RangeError. */
export function segmentCircle(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    radius: number): 0 | 1 | 2 | 3 | 4 | 5;

export function orient2d(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number): number;

export function orient2dfast(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number): number;

export function incircle(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    dx: number, dy: number): number;

export function incirclefast(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    dx: number, dy: number): number;

export function orient3d(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number): number;

export function orient3dfast(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number): number;

export function insphere(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    ex: number, ey: number, ez: number): number;

export function inspherefast(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    ex: number, ey: number, ez: number): number;
