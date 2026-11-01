/**
 * Serial-over-BLE transport for dive computers, on Web Bluetooth.
 *
 * Dive computers speak a byte protocol over a vendor GATT service with one
 * "notify" characteristic (computer → phone) and one "write" characteristic
 * (phone → computer). Bluetooth never standardised a serial service, so each
 * vendor has its own UUIDs; the list below is the set known to work with
 * libdivecomputer (from Subsurface's core/qt-ble.cpp). Web Bluetooth only lets a
 * page talk to services named in `optionalServices`, so every candidate is listed.
 *
 * Notifications are queued as packets: read() hands out one packet at a time (or
 * the first `size` bytes of it, keeping the rest for the next read).
 */

/** Vendor serial services, preferred first. */
export const SERIAL_SERVICES = Object.freeze([
    '544e326b-5b72-c6b0-1c46-41c1bc448118', // Mares BlueLink Pro (Genius, Sirius, Quad 2 …)
    '0000fefb-0000-1000-8000-00805f9b34fb', // Telit/Stollmann
    '2456e1b9-26e2-8f83-e744-f34f01e9d701', // u-blox
    '98ae7120-e62e-11e3-badd-0002a5d5c51b', // Suunto
    'cb3c4555-d670-4670-bc20-b61dbc851e9a', // Pelagic
    'ca7b0001-f785-4c38-b599-c7c5fbadb034', // Pelagic
    'fdcdeaaa-295d-470e-bf15-04217b7aa0a0', // Scubapro
    'fe25c237-0ece-443c-b0aa-e02033e7029d', // Shearwater
    '1aa44039-1667-4b29-87cc-dfecaaf31d97', // Shearwater
    '0000fcef-0000-1000-8000-00805f9b34fb', // Divesoft
    '6e400001-b5a3-f393-e0a9-e50e24dc10b8', // Cressi
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
    '00000001-8c3b-4f2c-a59e-8c08224f3253', // Halcyon
    '84968ffe-d26d-478a-b953-5010bcf58bca', // Seac
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip
]);

/** Why a Bluetooth step failed, in words the page can translate. */
export class BleError extends Error {
    /**
     * @param {'unsupported'|'off'|'cancelled'|'notFound'|'connect'|'noSerial'|'timeout'|'disconnected'|'io'} kind
     * @param {string} message
     */
    constructor(kind, message) {
        super(message);
        this.name = 'BleError';
        this.kind = kind;
    }
}

/**
 * Whether this browser can use Web Bluetooth at all (Chrome/Edge on Android, desktop; not iOS, not Firefox).
 * @returns {boolean}
 */
export function bluetoothSupported(nav = globalThis.navigator) {
    return Boolean(nav?.bluetooth?.requestDevice) && globalThis.isSecureContext !== false;
}

/**
 * Ask the user to pick a dive computer (browser chooser). Must run from a click.
 * @param {{namePrefixes: string[]}} options
 * @returns {Promise<Object>} BluetoothDevice
 */
export async function requestDevice({ namePrefixes }, nav = globalThis.navigator) {
    if (!bluetoothSupported(nav)) throw new BleError('unsupported', 'Web Bluetooth is not available in this browser');
    if (nav.bluetooth.getAvailability && !(await nav.bluetooth.getAvailability().catch(() => true))) {
        throw new BleError('off', 'Bluetooth is off or there is no adapter');
    }
    try {
        return await nav.bluetooth.requestDevice({
            filters: namePrefixes.map(namePrefix => ({ namePrefix })),
            optionalServices: [...SERIAL_SERVICES],
        });
    } catch (error) {
        if (error?.name === 'NotFoundError') {
            // Chrome reports both "user closed the chooser" and "adapter off" as NotFoundError.
            throw new BleError(/adapter|bluetooth.*(off|not available)/i.test(error.message) ? 'off' : 'cancelled', error.message);
        }
        if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') throw new BleError('unsupported', error.message);
        throw new BleError('io', error?.message ?? String(error));
    }
}

export class BleSerial {
    /** @param {Object} device - BluetoothDevice */
    constructor(device) {
        this.device = device;
        this.queue = [];
        this.waiter = null;
        this.disconnected = false;
        this._onNotify = event => this._push(new Uint8Array(event.target.value.buffer.slice(0)));
        this._onDisconnect = () => {
            this.disconnected = true;
            this._wake();
        };
    }

    /** Connect, find the serial service and start notifications. */
    async open() {
        this.device.addEventListener('gattserverdisconnected', this._onDisconnect);
        let server;
        try {
            server = await this.device.gatt.connect();
        } catch (error) {
            throw new BleError('connect', error?.message ?? String(error));
        }
        const services = await server.getPrimaryServices().catch(() => []);
        const ranked = [...services].sort((a, b) => rank(a.uuid) - rank(b.uuid));
        for (const service of ranked) {
            if (rank(service.uuid) === Infinity) continue;
            const chars = await service.getCharacteristics().catch(() => []);
            const rx = chars.find(c => c.properties.notify || c.properties.indicate);
            const tx = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
            if (rx && tx) {
                this.service = service;
                this.rx = rx;
                this.tx = tx;
                break;
            }
        }
        if (!this.rx) throw new BleError('noSerial', 'No serial service found on this device');
        this.rx.addEventListener('characteristicvaluechanged', this._onNotify);
        try {
            await this.rx.startNotifications();
        } catch (error) {
            throw new BleError('connect', error?.message ?? String(error));
        }
        this.disconnected = false;
        return this;
    }

    _push(packet) {
        this.queue.push(packet);
        this._wake();
    }

    _wake() {
        const w = this.waiter;
        this.waiter = null;
        w?.();
    }

    /**
     * Next received packet, or its first `size` bytes (the rest stays queued).
     * @param {number} size
     * @param {number} timeoutMs - < 0 waits forever
     * @returns {Promise<Uint8Array>}
     */
    async read(size, timeoutMs) {
        while (!this.queue.length) {
            if (this.disconnected) throw new BleError('disconnected', 'The dive computer disconnected');
            await new Promise((resolve, reject) => {
                const timer = timeoutMs >= 0 ? setTimeout(() => {
                    this.waiter = null;
                    reject(new BleError('timeout', `No data for ${timeoutMs} ms`));
                }, timeoutMs) : null;
                this.waiter = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
        }
        const packet = this.queue.shift();
        if (packet.length <= size) return packet;
        this.queue.unshift(packet.subarray(size));
        return packet.subarray(0, size);
    }

    /** @param {Uint8Array} bytes */
    async write(bytes) {
        if (this.disconnected) throw new BleError('disconnected', 'The dive computer disconnected');
        try {
            if (this.tx.properties.writeWithoutResponse && this.tx.writeValueWithoutResponse) await this.tx.writeValueWithoutResponse(bytes);
            else if (this.tx.writeValueWithResponse) await this.tx.writeValueWithResponse(bytes);
            else await this.tx.writeValue(bytes);
        } catch (error) {
            throw new BleError(this.disconnected ? 'disconnected' : 'io', error?.message ?? String(error));
        }
    }

    /** Drop everything received but not read yet. */
    purge() {
        this.queue.length = 0;
    }

    close() {
        this.rx?.removeEventListener('characteristicvaluechanged', this._onNotify);
        this.device.removeEventListener('gattserverdisconnected', this._onDisconnect);
        try {
            if (this.device.gatt?.connected) this.device.gatt.disconnect();
        } catch {
            // already gone
        }
    }
}

function rank(uuid) {
    const i = SERIAL_SERVICES.indexOf(String(uuid).toLowerCase());
    return i < 0 ? Infinity : i;
}
