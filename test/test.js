
import fs from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import robustOrientation from 'robust-orientation';
import nextafter from 'nextafter';

import {
    orient2d, orient2dfast,
    orient3d, orient3dfast,
    incircle, incirclefast,
    insphere, inspherefast,
    segmentCircle, NONE, TANGENT, CROSSES_ONCE, CROSSES_TWICE, ENDPOINT_ON_CIRCLE
} from '../index.js';

test('segmentCircle', () => {
    assert.equal(segmentCircle(0, 2, 2, 2, 1, 0, 1), NONE);
    assert.equal(segmentCircle(-2, 1, 2, 1, 0, 0, 1), TANGENT);
    assert.equal(segmentCircle(0, 0, 2, 0, 0, 0, 1), CROSSES_ONCE);
    assert.equal(segmentCircle(-2, 0, 2, 0, 0, 0, 1), CROSSES_TWICE);
    assert.equal(segmentCircle(0, 0, 1, 0, 0, 0, 1), ENDPOINT_ON_CIRCLE);
});

// Convert doubles to integers in common units of 2^-1074. This oracle uses
// integer quadratic coefficients, independently of the production expansions.
function circleOracle(ax, ay, bx, by, cx, cy, radius) {
    const buffer = new DataView(new ArrayBuffer(8));
    function integer(x) {
        buffer.setFloat64(0, x);
        const word = buffer.getBigUint64(0);
        const exponent = Number((word >> 52n) & 2047n);
        const fraction = word & ((1n << 52n) - 1n);
        const magnitude = exponent === 0 ? fraction : ((1n << 52n) | fraction) << BigInt(exponent - 1);
        return x < 0 ? -magnitude : magnitude;
    }
    [ax, ay, bx, by, cx, cy, radius] = [ax, ay, bx, by, cx, cy, radius].map(integer);
    const dx = bx - ax;
    const dy = by - ay;
    const fx = ax - cx;
    const fy = ay - cy;
    const a = dx * dx + dy * dy;
    const b = 2n * (dx * fx + dy * fy);
    const c = fx * fx + fy * fy - radius * radius;
    const end = a + b + c;
    if (c === 0n || end === 0n) return ENDPOINT_ON_CIRCLE;
    if (a === 0n) return NONE;
    if ((c < 0n) !== (end < 0n)) return CROSSES_ONCE;
    if (c < 0n || b >= 0n || -b >= 2n * a) return NONE;
    const discriminant = b * b - 4n * a * c;
    return discriminant < 0n ? NONE : discriminant === 0n ? TANGENT : CROSSES_TWICE;
}

test('segmentCircle boundaries and degeneracies', () => {
    const cases = [
        [[2, 1, 3, 1, 0, 0, 1], NONE], // tangent to supporting line only
        [[-0.5, 0, 0.5, 0, 0, 0, 1], NONE],
        [[0, 0, 0, 0, 0, 0, 1], NONE],
        [[2, 0, 2, 0, 0, 0, 1], NONE],
        [[1, 0, 1, 0, 0, 0, 1], ENDPOINT_ON_CIRCLE],
        [[-1, 0, 1, 0, 0, 0, 1], ENDPOINT_ON_CIRCLE],
        [[1, 0, 2, 0, 0, 0, 1], ENDPOINT_ON_CIRCLE],
        [[0, 0, 1, 2 ** -27, 0, 0, 1], CROSSES_ONCE], // rounded distance is 1
        [[-2, nextafter(1, 0), 2, nextafter(1, 0), 0, 0, 1], CROSSES_TWICE],
        [[-2, nextafter(1, 2), 2, nextafter(1, 2), 0, 0, 1], NONE],
        [[-1, 0, 1, 0, 0, 0, 0], TANGENT],
        [[0, 0, 1, 0, 0, 0, 0], ENDPOINT_ON_CIRCLE],
        [[0, 1, 1, 1, 0, 0, 0], NONE]
    ];
    for (const [args, expected] of cases) {
        assert.equal(circleOracle(...args), expected);
        assert.equal(segmentCircle(...args), expected, args.join(','));
        const [ax, ay, bx, by, cx, cy, radius] = args;
        assert.equal(segmentCircle(bx, by, ax, ay, cx, cy, radius), expected);
        assert.equal(segmentCircle(-ax, -ay, -bx, -by, -cx, -cy, radius), expected);
        for (const exponent of [-100, -20, 20, 100]) {
            assert.equal(segmentCircle(...args.map(x => x * 2 ** exponent)), expected);
        }
    }
    assert.throws(() => segmentCircle(0, 0, 1, 0, 0, 0, -1), RangeError);
    assert.equal(segmentCircle(0, 0, 1, 0, 0, 0, -0), ENDPOINT_ON_CIRCLE);
});

test('segmentCircle exact oracle', () => {
    let seed = 123456789;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    for (let i = 0; i < 1500; i++) {
        const factor = 2 ** (Math.floor(random() * 201) - 100);
        const args = Array.from({length: 7}, () => (random() - 0.5) * factor);
        args[6] = Math.abs(args[6]);
        assert.equal(segmentCircle(...args), circleOracle(...args), args.join(','));
    }
    // Oblique tangents with exact integer geometry; perturb endpoints or radius
    // by one ULP, and translate to exercise coordinate subtraction tails.
    for (const offset of [0, 0.125, 2 ** 30]) {
        for (const radius of [nextafter(5, 0), 5, nextafter(5, Infinity)]) {
            for (const x of [nextafter(7, 0), 7, nextafter(7, Infinity)]) {
                const args = [x + offset, 1 + offset, -1 + offset, 7 + offset, offset, offset, radius];
                assert.equal(segmentCircle(...args), circleOracle(...args), args.join(','));
            }
        }
    }
});

test('orient2d', () => {
    assert.ok(orient2d(0, 0, 1, 1, 0, 1) < 0, 'clockwise');
    assert.ok(orient2d(0, 0, 0, 1, 1, 1) > 0, 'counterclockwise');
    assert.ok(orient2d(0, 0, 0.5, 0.5, 1, 1) === 0, 'collinear');

    const r = 0.95;
    const q = 18;
    const p = 16.8;
    const w = Math.pow(2, -43);

    for (let i = 0; i < 128; i++) {
        for (let j = 0; j < 128; j++) {
            const x = r + w * i / 128;
            const y = r + w * j / 128;

            const o = orient2d(x, y, q, q, p, p);
            const o2 = robustOrientation[3]([x, y], [q, q], [p, p]);

            assert.ok(Math.sign(o) === Math.sign(o2), `${x},${y}, ${q},${q}, ${p},${p}: ${o} vs ${o2}`);
        }
    }
    // 512x512 near-collinear

    const lines = fs.readFileSync(new URL('./fixtures/orient2d.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    for (const line of lines) {
        const [, ax, ay, bx, by, cx, cy, sign] = line.split(' ').map(Number);
        const result = orient2d(ax, ay, bx, by, cx, cy);
        assert.ok(Math.sign(result) === -sign, `${line}: ${result} vs ${-sign}`);
    }
    // 1000 hard fixtures
});

test('orient2dfast', () => {
    assert.ok(orient2dfast(0, 0, 1, 1, 0, 1) < 0, 'counterclockwise');
    assert.ok(orient2dfast(0, 0, 0, 1, 1, 1) > 0, 'clockwise');
    assert.ok(orient2dfast(0, 0, 0.5, 0.5, 1, 1) === 0, 'collinear');
});

test('incircle', () => {
    assert.ok(incircle(0, -1, 0, 1, 1, 0, -0.5, 0) < 0, 'inside');
    assert.ok(incircle(0, -1, 1, 0, 0, 1, -1, 0) === 0, 'on circle');
    assert.ok(incircle(0, -1, 0, 1, 1, 0, -1.5, 0) > 0, 'outside');

    const a = nextafter(-1, 0);
    const b = nextafter(-1, -2);

    assert.ok(incircle(1, 0, -1, 0, 0, 1, 0, a) < 0, 'near inside');
    assert.ok(incircle(1, 0, -1, 0, 0, 1, 0, b) > 0, 'near outside');

    let x = 1e-64;
    for (let i = 0; i < 128; i++) {
        assert.ok(incircle(0, x, -x, -x, x, -x, 0, 0) > 0, `incircle test ${x}, outside`);
        assert.ok(incircle(0, x, -x, -x, x, -x, 0, 2 * x) < 0, `incircle test ${x}, inside`);
        assert.ok(incircle(0, x, -x, -x, x, -x, 0, x) === 0, `incircle test ${x}, cocircular`);
        x *= 10;
    }
    // 384 incircle tests

    const lines = fs.readFileSync(new URL('./fixtures/incircle.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    for (const line of lines) {
        const [, ax, ay, bx, by, cx, cy, dx, dy, sign] = line.split(' ').map(Number);
        const result = incircle(ax, ay, bx, by, cx, cy, dx, dy);
        assert.ok(Math.sign(result) === sign, `${line}: ${result} vs ${sign}`);
    }
    // 1000 hard fixtures
});

test('incirclefast', () => {
    assert.ok(incirclefast(0, -1, 0, 1, 1, 0, -0.5, 0) < 0, 'inside');
    assert.ok(incirclefast(0, -1, 0, 1, 1, 0, -1, 0) === 0, 'on circle');
    assert.ok(incirclefast(0, -1, 0, 1, 1, 0, -1.5, 0) > 0, 'outside');
});

test('orient3d', () => {
    assert.ok(orient3d(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, 1
    ) > 0, 'above');

    assert.ok(orient3d(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, -1
    ) < 0, 'below');

    assert.ok(orient3d(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, 0
    ) === 0, 'coplanar');

    const a = nextafter(0, 1);
    const b = nextafter(0, -1);

    assert.ok(orient3d(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, a
    ) > 0, 'near above');

    assert.ok(orient3d(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, b
    ) < 0, 'near below');

    const lines = fs.readFileSync(new URL('./fixtures/orient3d.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    for (const line of lines) {
        const [, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, sign] = line.split(' ').map(Number);
        const result = orient3d(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
        assert.ok(Math.sign(result) === sign, `${line}: ${result} vs ${sign}`);
        assert.ok(Math.sign(result) === Math.sign(orient3d(dx, dy, dz, bx, by, bz, ax, ay, az, cx, cy, cz)), 'symmetry');
    }
    // 1000 hard fixtures

    const tol = 5.0e-14;

    for (let i = 0; i < 1000; i++) {
        const ax = 0.5 + tol * Math.random();
        const ay = 0.5 + tol * Math.random();
        const az = 0.5 + tol * Math.random();
        const b = 12, c = 24, d = 48;
        assert.ok(orient3d(b, b, b, c, c, c, d, d, d, ax, ay, az) === 0, 'degenerate');
        assert.ok(orient3d(c, c, c, d, d, d, ax, ay, az, b, b, b) === 0, 'degenerate');
    }
    // 1000 degenerate cases
});

test('orient3dfast', () => {
    assert.ok(orient3dfast(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, 1
    ) > 0, 'above');

    assert.ok(orient3dfast(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, -1
    ) < 0, 'below');

    assert.ok(orient3dfast(
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        0, 0, 0
    ) === 0, 'coplanar');
});

test('insphere', () => {
    assert.ok(insphere(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, 0
    ) < 0, 'inside');

    assert.ok(insphere(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, 2
    ) > 0, 'outside');

    assert.ok(insphere(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, -1
    ) === 0, 'cospherical');

    const a = nextafter(-1, 0);
    const b = nextafter(-1, -2);

    assert.ok(insphere(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, a
    ) < 0, 'near inside');

    assert.ok(insphere(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, b
    ) > 0, 'near outside');

    const lines = fs.readFileSync(new URL('./fixtures/insphere.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    for (const line of lines) {
        const [, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez, sign] = line.split(' ').map(Number);
        const result = insphere(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez);
        assert.ok(Math.sign(result) === -sign, `${line}: ${result} vs ${-sign}`);
    }
    // 1000 hard fixtures
});

test('inspherefast', () => {
    assert.ok(inspherefast(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, 0
    ) < 0, 'inside');

    assert.ok(inspherefast(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, 2
    ) > 0, 'outside');

    assert.ok(inspherefast(
        1, 0, 0,
        0, -1, 0,
        0, 1, 0,
        0, 0, 1,
        0, 0, -1
    ) === 0, 'cospherical');
});
