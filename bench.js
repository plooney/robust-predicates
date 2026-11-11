
import * as fs from 'fs';
import robustOrientation from 'robust-orientation';
import robustInSphere from 'robust-in-sphere';

import {orient2d, orient3d, incircle, insphere, segmentCircle} from './index.js';

// Run just these workloads with: npm run bench -- --segment-circle
{
    let seed = 123456789;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    const ordinary = Array.from({length: 256}, () => {
        const args = Array.from({length: 7}, () => (random() - 0.5) * 16);
        args[6] = Math.abs(args[6]);
        return args;
    });
    const nearTangent = Array.from({length: 256}, (_, i) => [7, 1, -1, 7, 0, 0, 5 + (i % 3 - 1) * 2 ** -50]);
    const boundary = [
        [-1, 0, 1, 0, 0, 0, 1], [1, 0, 0, 1, 0, 0, 1],
        [-2, 1, 2, 1, 0, 0, 1], [0, 0, 1, 0, 0, 0, 1]
    ];
    for (const [name, inputs] of [['ordinary', ordinary], ['near tangent', nearTangent], ['boundary', boundary]]) {
        const run = () => {
            let checksum = 0;
            for (let i = 0; i < 100000; i++) {
                const a = inputs[i % inputs.length];
                checksum += segmentCircle(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
            }
            return checksum;
        };
        run(); // warm up before timing
        const times = [];
        let checksum = 0;
        for (let repeat = 0; repeat < 5; repeat++) {
            const start = performance.now();
            checksum += run();
            times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        console.log(`100000 x segmentCircle ${name}: ${times[2].toFixed(2)} ms (median of 5, checksum ${checksum})`);
    }
}
if (process.argv.includes('--segment-circle')) process.exit(0);

{
    const r = 0.95;
    const q = 18;
    const p = 16.8;
    const w = Math.pow(2, -44);
    const size = 2000;

    const id = `${size * size} x orient2d near-collinear (robust-predicates)`;
    console.time(id);
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const x = r + w * i / size;
            const y = r + w * j / size;
            orient2d(x, y, q, q, p, p);
        }
    }
    console.timeEnd(id);

    const id2 = `${size * size} x orient2d near-collinear (robust-orientation)`;
    console.time(id2);
    const a = [0, 0];
    const b = [q, q];
    const c = [p, p];
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            a[0] = r + w * i / size;
            a[1] = r + w * j / size;
            robustOrientation[3](a, b, c);
        }
    }
    console.timeEnd(id2);
}

{
    const lines = fs.readFileSync(new URL('test/fixtures/orient3d.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    const coords = new Float64Array(lines.length * 12);
    const points = [];
    let i = 0;
    for (const line of lines) {
        const [, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz] = line.split(' ').map(Number);
        coords[i++] = ax;
        coords[i++] = ay;
        coords[i++] = az;
        coords[i++] = bx;
        coords[i++] = by;
        coords[i++] = bz;
        coords[i++] = cx;
        coords[i++] = cy;
        coords[i++] = cz;
        coords[i++] = dx;
        coords[i++] = dy;
        coords[i++] = dz;
        points.push([ax, ay, az], [bx, by, bz], [cx, cy, cz], [dx, dy, dz]);
    }
    const N = 10000;
    const id = `${N * lines.length} x orient3d (robust-predicates)`;
    console.time(id);
    for (let k = 0; k < N; k++) {
        for (let i = 0; i < coords.length; i += 12) orient3d(
            coords[i + 0], coords[i + 1], coords[i + 2],
            coords[i + 3], coords[i + 4], coords[i + 5],
            coords[i + 6], coords[i + 7], coords[i + 8],
            coords[i + 9], coords[i + 10], coords[i + 11]
        );
    }
    console.timeEnd(id);

    const id2 = `${N * lines.length} x orient3d (robust-orientation)`;
    console.time(id2);
    for (let k = 0; k < N; k++) {
        for (let i = 0; i < points.length; i += 4) robustOrientation[4](
            points[i + 0],
            points[i + 1],
            points[i + 2],
            points[i + 3]
        );
    }
    console.timeEnd(id2);
}

{
    const lines = fs.readFileSync(new URL('test/fixtures/incircle.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    const coords = new Float64Array(lines.length * 8);
    const points = [];
    let i = 0;
    for (const line of lines) {
        const [, ax, ay, bx, by, cx, cy, dx, dy] = line.split(' ').map(Number);
        coords[i++] = ax;
        coords[i++] = ay;
        coords[i++] = bx;
        coords[i++] = by;
        coords[i++] = cx;
        coords[i++] = cy;
        coords[i++] = dx;
        coords[i++] = dy;
        points.push([ax, ay], [bx, by], [cx, cy], [dx, dy]);
    }
    const N = 100;
    const id = `${N * lines.length} x incircle (robust-predicates)`;
    console.time(id);
    for (let k = 0; k < N; k++) {
        for (let i = 0; i < coords.length; i += 8) incircle(
            coords[i + 0], coords[i + 1],
            coords[i + 2], coords[i + 3],
            coords[i + 4], coords[i + 5],
            coords[i + 6], coords[i + 7]
        );
    }
    console.timeEnd(id);

    const id2 = `${N * lines.length} x incircle (robust-orientation)`;
    console.time(id2);
    for (let k = 0; k < N; k++) {
        for (let i = 0; i < points.length; i += 4) robustInSphere[4](
            points[i + 0],
            points[i + 1],
            points[i + 2],
            points[i + 3]
        );
    }
    console.timeEnd(id2);
}

{
    const lines = fs.readFileSync(new URL('test/fixtures/insphere.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
    const coords = new Float64Array(lines.length * 15);
    const points = [];
    let i = 0;
    for (const line of lines) {
        const [, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez] = line.split(' ').map(Number);
        coords[i++] = ax;
        coords[i++] = ay;
        coords[i++] = az;
        coords[i++] = bx;
        coords[i++] = by;
        coords[i++] = bz;
        coords[i++] = cx;
        coords[i++] = cy;
        coords[i++] = cz;
        coords[i++] = dx;
        coords[i++] = dy;
        coords[i++] = dz;
        coords[i++] = ex;
        coords[i++] = ey;
        coords[i++] = ez;
        points.push([ax, ay, az], [bx, by, bz], [cx, cy, cz], [dx, dy, dz], [ex, ey, ez]);
    }
    const N = 10;
    const id = `${N * lines.length} x insphere (robust-predicates)`;
    console.time(id);
    for (let k = 0; k < N; k++) {
        for (let i = 0; i < coords.length; i += 15) insphere(
            coords[i + 0], coords[i + 1], coords[i + 2],
            coords[i + 3], coords[i + 4], coords[i + 5],
            coords[i + 6], coords[i + 7], coords[i + 8],
            coords[i + 9], coords[i + 10], coords[i + 11],
            coords[i + 12], coords[i + 13], coords[i + 14]
        );
    }
    console.timeEnd(id);

    const id2 = `${N * lines.length} x insphere (robust-in-sphere)`;
    console.time(id2);
    for (let k = 0; k < N; k++) {
        for (let i = 0; i < points.length; i += 5) robustInSphere[5](
            points[i + 0],
            points[i + 1],
            points[i + 2],
            points[i + 3],
            points[i + 4]
        );
    }
    console.timeEnd(id2);
}
