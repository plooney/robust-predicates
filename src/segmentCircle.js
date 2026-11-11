import { sum, scale } from './util.js';

export const NONE = 0;
export const TANGENT = 1;
export const CROSSES_ONCE = 2;
export const CROSSES_TWICE = 3;
export const ENDPOINT_ON_CIRCLE = 4;

// Step to the adjacent representable double without introducing an epsilon.
const bits = new DataView(new ArrayBuffer(8));
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === 0) return Number.MIN_VALUE;
	bits.setFloat64(0, x);
	let hi = bits.getUint32(0);
	let lo = bits.getUint32(4);
	if (x > 0) {
		if (lo === 0xffffffff) hi++;
		lo = (lo + 1) >>> 0;
	} else {
		if (lo === 0) hi--;
		lo = (lo - 1) >>> 0;
	}
	bits.setUint32(0, hi);
	bits.setUint32(4, lo);
	return bits.getFloat64(0);
}
const nextDown = x => -nextUp(-x);

// Each operation rounds its lower endpoint down and upper endpoint up by one
// double. IEEE round-to-nearest is within these bounds, so by induction every
// interval encloses the expression on the original, exact input doubles.
const interval = {
	value: x => [x, x],
	add: (a, b) => [nextDown(a[0] + b[0]), nextUp(a[1] + b[1])],
	sub: (a, b) => [nextDown(a[0] - b[1]), nextUp(a[1] - b[0])],
	mul(a, b) {
		const products = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
		return [nextDown(Math.min(...products)), nextUp(Math.max(...products))];
	},
	sign: a => (a[0] > 0 ? 1 : a[1] < 0 ? -1 : undefined)
};

function expansionSum(a, b) {
	const out = new Float64Array(a.length + b.length);
	return out.subarray(0, sum(a.length, a, b.length, b, out));
}

// Repeated exact scaling and summation gives an expansion product. In
// particular, subtraction happens here on the original scalar inputs, retaining
// their rounding tails rather than expanding already-rounded coordinates.
const exact = {
	value: x => [x],
	add: expansionSum,
	sub: (a, b) => expansionSum(a, b.map(x => -x)),
	mul(a, b) {
		let result = [0];
		for (const component of b) {
			const out = new Float64Array(a.length * 2);
			const length = scale(a.length, a, component, out);
			result = expansionSum(result, out.subarray(0, length));
		}
		return result;
	},
	sign: a => Math.sign(a[a.length - 1])
};

function classify(ax, ay, bx, by, cx, cy, radius, arithmetic) {
	const { value, add, sub, mul, sign } = arithmetic;
	const dot = (x, y, u, v) => add(mul(x, u), mul(y, v));
	const fx = sub(value(ax), value(cx));
	const fy = sub(value(ay), value(cy));
	const gx = sub(value(bx), value(cx));
	const gy = sub(value(by), value(cy));
	const r2 = mul(value(radius), value(radius));
	const start = sign(sub(dot(fx, fy, fx, fy), r2));
	const end = sign(sub(dot(gx, gy, gx, gy), r2));
	if (start === 0 || end === 0) return ENDPOINT_ON_CIRCLE;
	if (start === undefined || end === undefined) return undefined;
	if (ax === bx && ay === by) return NONE;
	if (start !== end) return CROSSES_ONCE;
	if (start < 0) return NONE;

	const dx = sub(value(bx), value(ax));
	const dy = sub(value(by), value(ay));
	// The closest point must be strictly inside the segment before a tangent
	// supporting line or two supporting-line crossings can count.
	const atStart = sign(dot(fx, fy, dx, dy));
	const atEnd = sign(dot(gx, gy, dx, dy));
	if (atStart === undefined || atEnd === undefined) return undefined;
	if (atStart >= 0 || atEnd <= 0) return NONE;

	const cross = sub(mul(dx, fy), mul(dy, fx));
	const discriminant = sign(sub(mul(r2, dot(dx, dy, dx, dy)), mul(cross, cross)));
	if (discriminant === undefined) return undefined;
	return discriminant < 0 ? NONE : discriminant === 0 ? TANGENT : CROSSES_TWICE;
}

// Like the existing expansion predicates, assumes finite inputs and no
// intermediate overflow or destructive underflow in the exact fallback.
export function segmentCircle(ax, ay, bx, by, cx, cy, radius) {
	if (radius < 0) throw new RangeError('Circle radius must be nonnegative');
	const result = classify(ax, ay, bx, by, cx, cy, radius, interval);
	return result === undefined ? classify(ax, ay, bx, by, cx, cy, radius, exact) : result;
}
