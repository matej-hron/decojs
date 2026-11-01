/**
 * Test doubles for the Mares download path:
 * - buildGeniusDive(): a synthetic dive in the Mares Genius object format (header + profile
 *   records), the bytes libdivecomputer hands over for one Quad 2 dive;
 * - FakeQuad2: a transport that answers like a Quad 2 over BLE (variable-length packets).
 * Written from DecoTheory's own format notes for testing; nothing here ships.
 */

const ACK = 0xaa;
const END = 0xea;
const XOR = 0xa5;

/** CRC-16/XMODEM (poly 0x1021, init 0), as used by the Genius profile records. */
function crc16(bytes) {
    let crc = 0;
    for (const b of bytes) {
        crc ^= b << 8;
        for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
}

function record(tag, size, fill) {
    const r = new Uint8Array(size);
    const v = new DataView(r.buffer);
    const code = [...tag].reduce((n, ch) => (n << 8) | ch.charCodeAt(0), 0) >>> 0;
    v.setUint32(0, code, false);
    fill?.(v);
    v.setUint16(size - 6, crc16(r.subarray(4, size - 6)), true);
    v.setUint32(size - 4, code, false);
    return r;
}

/**
 * @param {Object} o
 * @param {{year, month, day, hour, minute}} o.date
 * @param {Array<{o2: number, he?: number}>} o.gases - percent
 * @param {Array<{depth: number, temp?: number, gas?: number, ndl?: number, stopDepth?: number, stopTime?: number}>} o.samples - every 5 s
 * @param {'fresh'|'salt'|'en13319'} [o.water]
 * @param {number} [o.surfaceMin] - surface timeout setting (minutes)
 * @param {number} [o.atmosphericMbar]
 * @param {[number, number]} [o.gf] - GF low/high (header word 0x14, as a Quad 2 stores it)
 * @param {number} [o.number] - the computer's dive number (dive start record)
 * @returns {Uint8Array} header object followed by profile object
 */
export function buildGeniusDive({ date, gases, samples, water = 'salt', surfaceMin = 3, atmosphericMbar = 1013, gf = [70, 80], gfAlt = [85, 85], number = 7 }) {
    const header = new Uint8Array(0xb8 + 16);
    const h = new DataView(header.buffer);
    h.setUint16(0, 1, true); // object type 1
    header[2] = 0; // minor
    header[3] = 1; // major (v1.x header: 16 bytes more)
    const stamp = (date.hour & 0x1f) | ((date.minute & 0x3f) << 5) | ((date.day & 0x1f) << 11) | ((date.month & 0x0f) << 16) | ((date.year & 0xfff) << 20);
    h.setUint32(0x08, stamp >>> 0, true);
    const waterCode = { fresh: 0, salt: 1, en13319: 2 }[water];
    const mode = gases.some(g => g.he) ? 3 : gases.length > 1 ? 2 : gases[0].o2 === 21 ? 0 : 1;
    h.setUint32(0x0c, (mode | (waterCode << 5) | (surfaceMin << 13)) >>> 0, true);
    header[0x10] = 0; // log format: Genius
    h.setUint16(0x14, gf[0] | (gf[1] << 7), true);
    h.setUint16(0x18, gfAlt[0] | (gfAlt[1] << 7), true);
    h.setUint16(0x20, samples.length, true);
    h.setUint16(0x22, Math.round(Math.max(...samples.map(s => s.depth)) * 10), true);
    h.setUint16(0x24, Math.round(samples.reduce((a, s) => a + s.depth, 0) / samples.length * 10), true);
    const temps = samples.map(s => s.temp ?? 20);
    h.setInt16(0x26, Math.round(Math.max(...temps) * 10), true);
    h.setInt16(0x28, Math.round(Math.min(...temps) * 10), true);
    header[0x34] = 1; // metric
    h.setUint16(0x3e, atmosphericMbar, true);
    gases.forEach((g, i) => {
        const he = g.he ?? 0;
        const n2 = 100 - g.o2 - he;
        const params = g.o2 | (n2 << 7) | (he << 14) | ((i === 0 ? 2 : 1) << 21);
        h.setUint32(0x54 + i * 20, params >>> 0, true);
    });

    const parts = [Uint8Array.of(0, 0, 0, 1)]; // profile type 0, version 1.0
    parts.push(record('DSTR', 58, v => { v.setUint32(4, 0xffffffff, true); v.setUint32(8, number, true); }));
    for (const s of samples) {
        parts.push(record('DPRS', 34, v => {
            v.setUint16(4, Math.round(s.depth * 10), true);
            v.setUint16(8, Math.round((s.temp ?? 20) * 10), true);
            const stop = s.stopDepth > 0;
            v.setUint16(4 + 0x0a, stop ? (s.stopTime ?? 1) : (s.ndl ?? 99), true);
            const misc = ((s.gas ?? 0) << 6) | ((stop ? 1 : 0) << 18) | ((stop ? s.stopDepth : 0) << 19);
            v.setUint32(4 + 0x14, misc >>> 0, true);
        }));
    }
    parts.push(record('DEND', 162));
    const profileLength = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(header.length + profileLength);
    out.set(header);
    let o = header.length;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

/** The 4-byte fingerprint libdivecomputer reports for a Genius dive (header bytes 8…11), as hex. */
export function fingerprintOf(dive) {
    return Array.from(dive.subarray(8, 12), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A Quad 2 on the other end of a BLE link: answers version and object requests with
 * variable-length packets (one notification per answer), dives newest first.
 */
export class FakeQuad2 {
    /**
     * @param {{dives: Uint8Array[], serial?: string, maxPacket?: number, failAfterWrites?: number}} options
     *   dives newest first; serial six digits
     */
    constructor({ dives, serial = '123456', maxPacket = 244, failAfterWrites = Infinity }) {
        this.dives = dives;
        this.serial = serial;
        this.maxPacket = maxPacket;
        this.failAfterWrites = failAfterWrites;
        this.queue = [];
        this.pending = null; // command waiting for its payload
        this.object = null; // {bytes, offset} being sent in segments
        this.writes = 0;
        this.log = [];
    }

    _send(bytes) {
        this.queue.push(Uint8Array.from(bytes));
    }

    _objectBytes(index, sub) {
        if (index === 0x2000 && sub === 0x02) return Uint8Array.of(0x32, 0, 0, 0);
        if (index === 0x2000 && sub === 0x04) {
            const s = new Uint8Array(16);
            s.set([...`QUAD2-${this.serial}`.padEnd(16, ' ').slice(0, 16)].map(c => c.charCodeAt(0)));
            s.set([...this.serial].map(c => c.charCodeAt(0)), 10);
            return s;
        }
        if (index === 0x2008 && sub === 0x01) return Uint8Array.of(this.dives.length & 0xff, this.dives.length >> 8);
        const i = index - 0x3000;
        const dive = this.dives[i];
        if (!dive) return null;
        const headerSize = 0xb8 + 16;
        if (sub === 0x02) return dive.subarray(0, headerSize);
        if (sub === 0x03) return dive.subarray(headerSize);
        return null;
    }

    async write(bytes) {
        this.writes++;
        if (this.writes > this.failAfterWrites) {
            const error = new Error('GATT write failed');
            error.kind = 'disconnected';
            throw error;
        }
        if (this.pending === 0xbf) {
            this.pending = null;
            const index = bytes[1] | (bytes[2] << 8);
            const sub = bytes[3];
            const obj = this._objectBytes(index, sub);
            this.log.push(`obj ${index.toString(16)}/${sub}`);
            const rsp = new Uint8Array(16);
            rsp[1] = bytes[1];
            rsp[2] = bytes[2];
            rsp[3] = bytes[3];
            if (obj && obj.length <= 12) {
                rsp[0] = 0x42;
                rsp.set(obj, 4);
                this.object = null;
            } else {
                rsp[0] = 0x41;
                const len = obj?.length ?? 0;
                new DataView(rsp.buffer).setUint32(4, len, true);
                this.object = { bytes: obj ?? new Uint8Array(0), offset: 0, toggle: 0 };
            }
            this._send([...rsp, END]);
            return;
        }
        const cmd = bytes[0];
        if (bytes[1] !== (cmd ^ XOR)) throw new Error(`bad command ${bytes[0]} ${bytes[1]}`);
        if (cmd === 0xc2) {
            const version = new Uint8Array(140);
            version.set([...'Quad2'].map(c => c.charCodeAt(0)), 0x46);
            this._send([ACK, ...version, END]);
        } else if (cmd === 0xbf) {
            this.pending = cmd;
            this._send([ACK]);
        } else if (cmd === 0xac || cmd === 0xfe) {
            const o = this.object;
            const n = Math.min(this.maxPacket - 3, o.bytes.length - o.offset);
            const chunk = o.bytes.subarray(o.offset, o.offset + n);
            o.offset += n;
            this._send([ACK, (cmd === 0xac ? 0 : 1) << 4, ...chunk, END]);
        } else {
            throw new Error(`unexpected command ${cmd.toString(16)}`);
        }
    }

    async read(size) {
        if (!this.queue.length) {
            const error = new Error('timeout');
            error.kind = 'timeout';
            throw error;
        }
        const packet = this.queue.shift();
        if (packet.length <= size) return packet;
        this.queue.unshift(packet.subarray(size));
        return packet.subarray(0, size);
    }

    purge() {
        this.queue.length = 0;
    }
}
