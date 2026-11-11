import {epsilon, estimate, vec, sum, scale} from './util.js';

export const NONE = 0;
export const TANGENT = 1;
export const CROSSES_ONCE = 2;
export const CROSSES_TWICE = 3;
export const ENDPOINT_ON_CIRCLE = 4;
export const BOTH_ENDPOINTS_ON_CIRCLE = 5;

// Monomials: coefficient followed by indices into the five heads/tails.
const distanceTerms = [[1, 0, 0], [1, 1, 1], [-1, 4, 4]];
const projectionTerms = [[1, 0, 2], [1, 1, 3]];
const discriminantTerms = [
    [1, 4, 4, 0, 0], [1, 4, 4, 1, 1], [-1, 0, 0, 3, 3],
    [2, 0, 1, 2, 3], [-1, 1, 1, 2, 2]
];

// Error bounds (u = epsilon), assuming round-to-nearest, finite intermediates
// and no destructive underflow, as in the existing expansion predicates:
//
// Write each exact difference as h+t. |t| <= u/(1-u) |h|. Let P be the
// absolute monomial sum on heads. For the scalar quadratic expressions each
// monomial traverses at most 5 rounding factors (including differences and
// final additions); the quartic expression traverses at most 11. Coefficient
// 2 is an exact binary scaling. The computed P has the same operation paths.
// Thus scalar error, expressed relative to computed P, is bounded by
// gamma_5/(1-u)^5 or gamma_11/(1-u)^11, where gamma_n=n*u/(1-n*u).
// 16u and 32u respectively strictly exceed these bounds, including rounding
// of the bound calculation. These are expression-specific, not orient2d's
// constants. The direct monomial evaluation order below must be preserved.
//
// B: after evaluating the head polynomial exactly, omitted tails contribute
// at most ((1+eta)^d-1)P, eta=u/(1-u), d<=4. 16u*computedP safely bounds this.
// C: after adding every first-order tail term EXACTLY, omitted terms have
// magnitude <= ((1+eta)^d-1-d*eta)P < 7u^2 P; 64u^2*computedP bounds this
// including P's rounding. There are no omitted terms beyond degree four.
//
// An n-component expansion estimate has absolute error <= gamma_(n-1)*S,
// S=sum(abs(components)). 2*n*u*computedS safely bounds this for n<=1280,
// including rounding of S and the bound. The slack in both error components
// also covers their final rounded addition. Strict comparisons never certify
// an approximate zero. Nonfinite bounds always proceed to refinement.
const scalarQuadraticBound = 16 * epsilon;
const scalarQuarticBound = 32 * epsilon;
const headBound = 16 * epsilon;
const correctionBound = 64 * epsilon * epsilon;

// A degree-four monomial needs <=2^4=16 expansion components. Five monomials
// with all 2^4 head/tail choices need <=5*16*16=1280 components. Quadratics
// need fewer. Distinct ping-pong buffers keep sum/scale outputs from aliasing
// inputs; scratch is shared only across synchronous, nonrecursive predicates.
const heads = vec(5);
const tails = vec(5);
const termA = vec(16);
const termB = vec(16);
const accumulatedA = vec(1280);
const accumulatedB = vec(1280);
let accumulated = accumulatedA;
let spare = accumulatedB;
let accumulatedLength = 1;

function differenceTail(a, b, head) {
    const bvirt = a - head;
    return a - (head + bvirt) + (bvirt - b);
}

function addTerm(term, mask) {
    let product = termA;
    let scratch = termB;
    let length = 1;
    product[0] = term[0];
    for (let i = 1; i < term.length; i++) {
        const factor = (mask & (1 << (i - 1))) ? tails[term[i]] : heads[term[i]];
        if (factor === 0) return;
        length = scale(length, product, factor, scratch);
        const swap = product;
        product = scratch;
        scratch = swap;
    }
    accumulatedLength = sum(accumulatedLength, accumulated, length, product, spare);
    const swap = accumulated;
    accumulated = spare;
    spare = swap;
}

function estimateBound(inputBound) {
    let magnitude = 0;
    for (let i = 0; i < accumulatedLength; i++) magnitude += Math.abs(accumulated[i]);
    return inputBound + (2 * accumulatedLength * epsilon) * magnitude;
}

function adapt(terms, x, y, u, v, radius, x0, x1, y0, y1, u0, u1, v0, v1, permanent) {
    heads[0] = x;
    heads[1] = y;
    heads[2] = u;
    heads[3] = v;
    heads[4] = radius;
    accumulatedLength = 1;
    accumulated[0] = 0;
    for (const term of terms) addTerm(term, 0);
    let det = estimate(accumulatedLength, accumulated);
    let bound = estimateBound(headBound * permanent);
    if (Number.isFinite(bound) && Math.abs(det) > bound) return Math.sign(det); // stage B

    tails[0] = differenceTail(x0, x1, x);
    tails[1] = differenceTail(y0, y1, y);
    tails[2] = differenceTail(u0, u1, u);
    tails[3] = differenceTail(v0, v1, v);
    tails[4] = 0;
    if (tails[0] === 0 && tails[1] === 0 && tails[2] === 0 && tails[3] === 0) {
        return Math.sign(accumulated[accumulatedLength - 1]); // stage Z
    }

    for (const term of terms) {
        for (let i = 0; i < term.length - 1; i++) addTerm(term, 1 << i);
    }
    det = estimate(accumulatedLength, accumulated);
    bound = estimateBound(correctionBound * permanent);
    if (Number.isFinite(bound) && Math.abs(det) > bound) return Math.sign(det); // stage C

    for (const term of terms) {
        for (let mask = 1; mask < (1 << (term.length - 1)); mask++) {
            if ((mask & (mask - 1)) !== 0) addTerm(term, mask);
        }
    }
    return Math.sign(accumulated[accumulatedLength - 1]); // stage D
}

function distanceSign(ax, ay, cx, cy, radius) {
    const x = ax - cx;
    const y = ay - cy;
    const xx = x * x;
    const yy = y * y;
    const rr = radius * radius;
    const det = (xx + yy) - rr;
    const permanent = (xx + yy) + rr;
    const bound = scalarQuadraticBound * permanent;
    if (Number.isFinite(bound) && Math.abs(det) > bound) return Math.sign(det); // stage A
    return adapt(distanceTerms, x, y, 0, 0, radius, ax, cx, ay, cy, 0, 0, 0, 0, permanent);
}

function projectionSign(px, py, ax, ay, bx, by, cx, cy) {
    const x = px - cx;
    const y = py - cy;
    const u = bx - ax;
    const v = by - ay;
    const xu = x * u;
    const yv = y * v;
    const det = xu + yv;
    const permanent = Math.abs(xu) + Math.abs(yv);
    const bound = scalarQuadraticBound * permanent;
    if (Number.isFinite(bound) && Math.abs(det) > bound) return Math.sign(det); // stage A
    return adapt(projectionTerms, x, y, u, v, 0, px, cx, py, cy, bx, ax, by, ay, permanent);
}

function discriminantSign(ax, ay, bx, by, cx, cy, radius) {
    const x = bx - ax;
    const y = by - ay;
    const u = ax - cx;
    const v = ay - cy;
    const rr = radius * radius;
    const xx = x * x;
    const yy = y * y;
    const a = rr * xx;
    const b = rr * yy;
    const c = (xx * v) * v;
    const d = (((2 * x) * y) * u) * v;
    const e = (yy * u) * u;
    const det = (((a + b) - c) + d) - e;
    const permanent = (((a + b) + Math.abs(c)) + Math.abs(d)) + Math.abs(e);
    const bound = scalarQuarticBound * permanent;
    if (Number.isFinite(bound) && Math.abs(det) > bound) return Math.sign(det); // stage A
    return adapt(discriminantTerms, x, y, u, v, radius, bx, ax, by, ay, ax, cx, ay, cy, permanent);
}

// Assumes finite inputs and no intermediate overflow/destructive underflow.
export function segmentCircle(ax, ay, bx, by, cx, cy, radius) {
    if (radius < 0) throw new RangeError('Circle radius must be nonnegative');
    const start = distanceSign(ax, ay, cx, cy, radius);
    const end = distanceSign(bx, by, cx, cy, radius);
    if (start === 0 && end === 0 && (ax !== bx || ay !== by)) return BOTH_ENDPOINTS_ON_CIRCLE;
    if (start === 0 || end === 0) return ENDPOINT_ON_CIRCLE;
    if (ax === bx && ay === by) return NONE;
    if (start !== end) return CROSSES_ONCE;
    if (start < 0) return NONE;
    if (projectionSign(ax, ay, ax, ay, bx, by, cx, cy) >= 0) return NONE;
    if (projectionSign(bx, by, ax, ay, bx, by, cx, cy) <= 0) return NONE;
    const discriminant = discriminantSign(ax, ay, bx, by, cx, cy, radius);
    return discriminant < 0 ? NONE : discriminant === 0 ? TANGENT : CROSSES_TWICE;
}
