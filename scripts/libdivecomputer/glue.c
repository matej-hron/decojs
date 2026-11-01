/*
 * Thin bridge between libdivecomputer (LGPL-2.1, built unmodified from the pinned
 * upstream commit, see build.sh) and DecoTrail's JavaScript.
 *
 * - Download: a custom I/O stream whose read/write/sleep go to JS (Web Bluetooth),
 *   suspended with Emscripten Asyncify while the browser waits for a notification.
 * - Parse: walks the libdivecomputer parser and hands every field and sample to JS.
 *
 * Only the Mares Icon HD family (Genius layout: Quad 2, Sirius, Genius …) is linked in.
 * This file is part of the separately built libdivecomputer module (js/vendor/libdivecomputer)
 * and is distributed under the same licence (LGPL-2.1-or-later).
 */

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <emscripten.h>

#include <libdivecomputer/context.h>
#include <libdivecomputer/custom.h>
#include <libdivecomputer/device.h>
#include <libdivecomputer/parser.h>
#include <libdivecomputer/version.h>

#include "mares_iconhd.h"

/* ---- JS side (provided by libdcMares.js through Module) ---- */

EM_ASYNC_JS(int, js_read, (unsigned char *buf, int size, int timeout), {
	return await Module.ble.read(buf, size, timeout);
});
EM_ASYNC_JS(int, js_write, (const unsigned char *buf, int size), {
	return await Module.ble.write(buf, size);
});
EM_ASYNC_JS(int, js_sleep, (int ms), {
	await new Promise(r => setTimeout(r, ms));
	return 0;
});
EM_JS(void, js_purge, (void), { Module.ble.purge(); });
EM_JS(int, js_cancelled, (void), { return Module.ble.cancelled() ? 1 : 0; });
EM_JS(void, js_log, (int level, const char *msg), { Module.onLog(level, UTF8ToString(msg)); });
EM_JS(void, js_progress, (unsigned int current, unsigned int maximum), { Module.onProgress(current, maximum); });
EM_JS(void, js_devinfo, (unsigned int model, unsigned int firmware, unsigned int serial), {
	Module.onDevinfo(model, firmware, serial);
});
EM_JS(void, js_vendor, (const unsigned char *data, unsigned int size), {
	Module.onVendor(HEAPU8.slice(data, data + size));
});
EM_JS(int, js_dive, (const unsigned char *data, unsigned int size, const unsigned char *fp, unsigned int fpsize), {
	return Module.onDive(HEAPU8.slice(data, data + size), HEAPU8.slice(fp, fp + fpsize)) ? 1 : 0;
});
EM_JS(void, js_field, (const char *name, double a, double b, double c, double d, double e), {
	Module.onField(UTF8ToString(name), a, b, c, d, e);
});
EM_JS(void, js_sample, (int type, double a, double b, double c, double d), {
	Module.onSample(type, a, b, c, d);
});

/* ---- Custom I/O stream ---- */

typedef struct { int timeout; } stream_state_t;

static dc_status_t s_set_timeout (void *ud, int timeout) { ((stream_state_t *) ud)->timeout = timeout; return DC_STATUS_SUCCESS; }

static dc_status_t s_read (void *ud, void *data, size_t size, size_t *actual)
{
	int n = js_read ((unsigned char *) data, (int) size, ((stream_state_t *) ud)->timeout);
	if (n < 0) { if (actual) *actual = 0; return (dc_status_t) n; }
	if (actual) *actual = (size_t) n;
	return DC_STATUS_SUCCESS;
}

static dc_status_t s_write (void *ud, const void *data, size_t size, size_t *actual)
{
	int rc = js_write ((const unsigned char *) data, (int) size);
	if (rc < 0) { if (actual) *actual = 0; return (dc_status_t) rc; }
	if (actual) *actual = size;
	return DC_STATUS_SUCCESS;
}

static dc_status_t s_purge (void *ud, dc_direction_t direction)
{
	if (direction & DC_DIRECTION_INPUT) js_purge ();
	return DC_STATUS_SUCCESS;
}

static dc_status_t s_sleep (void *ud, unsigned int ms) { js_sleep ((int) ms); return DC_STATUS_SUCCESS; }

static void logfunc (dc_context_t *ctx, dc_loglevel_t level, const char *file, unsigned int line, const char *function, const char *msg, void *ud)
{
	js_log ((int) level, msg);
}

static void eventfunc (dc_device_t *device, dc_event_type_t event, const void *data, void *ud)
{
	if (event == DC_EVENT_PROGRESS) {
		const dc_event_progress_t *p = data;
		js_progress (p->current, p->maximum);
	} else if (event == DC_EVENT_DEVINFO) {
		const dc_event_devinfo_t *d = data;
		js_devinfo (d->model, d->firmware, d->serial);
	} else if (event == DC_EVENT_VENDOR) {
		const dc_event_vendor_t *v = data;
		js_vendor (v->data, v->size);
	}
}

static int cancelfunc (void *ud) { return js_cancelled (); }

static int divefunc (const unsigned char *data, unsigned int size, const unsigned char *fp, unsigned int fpsize, void *ud)
{
	return js_dive (data, size, fp, fpsize);
}

static dc_device_t *g_device = NULL;

/** Called from JS inside onDevinfo: compare against the last dive already downloaded. */
EMSCRIPTEN_KEEPALIVE int ldc_set_fingerprint (const unsigned char *fp, unsigned int size)
{
	if (!g_device) return DC_STATUS_INVALIDARGS;
	return dc_device_set_fingerprint (g_device, fp, size);
}

EMSCRIPTEN_KEEPALIVE const char *ldc_version (void) { return dc_version (NULL); }

/**
 * Download dives from a Mares Icon HD family computer over the JS BLE stream.
 * @param model libdivecomputer model number (0x32 = Quad 2)
 * @param loglevel DC_LOGLEVEL_* (0 none … 5 all)
 * @returns dc_status_t
 */
EMSCRIPTEN_KEEPALIVE int ldc_mares_download (unsigned int model, int loglevel)
{
	dc_context_t *context = NULL;
	dc_iostream_t *iostream = NULL;
	dc_status_t rc;
	stream_state_t state = { 3000 };

	static const dc_custom_cbs_t cbs = {
		s_set_timeout, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
		s_read, s_write, NULL, NULL, s_purge, s_sleep, NULL,
	};

	rc = dc_context_new (&context);
	if (rc != DC_STATUS_SUCCESS) return rc;
	dc_context_set_loglevel (context, (dc_loglevel_t) loglevel);
	dc_context_set_logfunc (context, logfunc, NULL);

	rc = dc_custom_open (&iostream, context, DC_TRANSPORT_BLE, &cbs, &state);
	if (rc != DC_STATUS_SUCCESS) goto out_context;

	rc = mares_iconhd_device_open (&g_device, context, iostream, model);
	if (rc != DC_STATUS_SUCCESS) goto out_iostream;

	dc_device_set_events (g_device, DC_EVENT_PROGRESS | DC_EVENT_DEVINFO | DC_EVENT_VENDOR, eventfunc, NULL);
	dc_device_set_cancel (g_device, cancelfunc, NULL);

	rc = dc_device_foreach (g_device, divefunc, NULL);

	dc_device_close (g_device);
	g_device = NULL;
out_iostream:
	dc_iostream_close (iostream);
out_context:
	dc_context_free (context);
	return rc;
}

/* ---- Parser ---- */

static void samplefunc (dc_sample_type_t type, const dc_sample_value_t *v, void *ud)
{
	switch (type) {
	case DC_SAMPLE_TIME: js_sample (type, v->time, 0, 0, 0); break;
	case DC_SAMPLE_DEPTH: js_sample (type, v->depth, 0, 0, 0); break;
	case DC_SAMPLE_TEMPERATURE: js_sample (type, v->temperature, 0, 0, 0); break;
	case DC_SAMPLE_PRESSURE: js_sample (type, v->pressure.tank, v->pressure.value, 0, 0); break;
	case DC_SAMPLE_EVENT: js_sample (type, v->event.type, v->event.time, v->event.flags, v->event.value); break;
	case DC_SAMPLE_DECO: js_sample (type, v->deco.type, v->deco.time, v->deco.depth, v->deco.tts); break;
	case DC_SAMPLE_GASMIX: js_sample (type, v->gasmix, 0, 0, 0); break;
	case DC_SAMPLE_PPO2: js_sample (type, v->ppo2.sensor, v->ppo2.value, 0, 0); break;
	case DC_SAMPLE_CNS: js_sample (type, v->cns, 0, 0, 0); break;
	case DC_SAMPLE_SETPOINT: js_sample (type, v->setpoint, 0, 0, 0); break;
	case DC_SAMPLE_RBT: js_sample (type, v->rbt, 0, 0, 0); break;
	default: break;
	}
}

#define NAN_ (0.0 / 0.0)

/**
 * Parse one dive and report it through Module.onField / Module.onSample.
 * @returns dc_status_t of the sample walk (fields that are unsupported are simply not reported)
 */
EMSCRIPTEN_KEEPALIVE int ldc_mares_parse (const unsigned char *data, unsigned int size, unsigned int model)
{
	dc_context_t *context = NULL;
	dc_parser_t *parser = NULL;
	dc_status_t rc = dc_context_new (&context);
	if (rc != DC_STATUS_SUCCESS) return rc;
	dc_context_set_loglevel (context, DC_LOGLEVEL_WARNING);
	dc_context_set_logfunc (context, logfunc, NULL);

	rc = mares_iconhd_parser_create (&parser, context, data, size, model);
	if (rc != DC_STATUS_SUCCESS) goto out;

	dc_datetime_t dt = {0};
	if (dc_parser_get_datetime (parser, &dt) == DC_STATUS_SUCCESS)
		js_field ("datetime", dt.year, dt.month, dt.day, dt.hour * 3600 + dt.minute * 60 + dt.second, dt.timezone);

	unsigned int u = 0;
	double d = 0;
	if (dc_parser_get_field (parser, DC_FIELD_DIVETIME, 0, &u) == DC_STATUS_SUCCESS) js_field ("divetime", u, 0, 0, 0, 0);
	if (dc_parser_get_field (parser, DC_FIELD_MAXDEPTH, 0, &d) == DC_STATUS_SUCCESS) js_field ("maxdepth", d, 0, 0, 0, 0);
	if (dc_parser_get_field (parser, DC_FIELD_AVGDEPTH, 0, &d) == DC_STATUS_SUCCESS) js_field ("avgdepth", d, 0, 0, 0, 0);
	if (dc_parser_get_field (parser, DC_FIELD_ATMOSPHERIC, 0, &d) == DC_STATUS_SUCCESS) js_field ("atmospheric", d, 0, 0, 0, 0);
	if (dc_parser_get_field (parser, DC_FIELD_TEMPERATURE_SURFACE, 0, &d) == DC_STATUS_SUCCESS) js_field ("tempSurface", d, 0, 0, 0, 0);
	if (dc_parser_get_field (parser, DC_FIELD_TEMPERATURE_MINIMUM, 0, &d) == DC_STATUS_SUCCESS) js_field ("tempMin", d, 0, 0, 0, 0);
	if (dc_parser_get_field (parser, DC_FIELD_TEMPERATURE_MAXIMUM, 0, &d) == DC_STATUS_SUCCESS) js_field ("tempMax", d, 0, 0, 0, 0);

	dc_divemode_t mode;
	if (dc_parser_get_field (parser, DC_FIELD_DIVEMODE, 0, &mode) == DC_STATUS_SUCCESS) js_field ("divemode", mode, 0, 0, 0, 0);

	dc_salinity_t water = {0};
	if (dc_parser_get_field (parser, DC_FIELD_SALINITY, 0, &water) == DC_STATUS_SUCCESS) js_field ("salinity", water.type, water.density, 0, 0, 0);

	dc_decomodel_t deco = {0};
	if (dc_parser_get_field (parser, DC_FIELD_DECOMODEL, 0, &deco) == DC_STATUS_SUCCESS)
		js_field ("decomodel", deco.type, deco.conservatism, deco.params.gf.low, deco.params.gf.high, 0);

	unsigned int ngas = 0;
	if (dc_parser_get_field (parser, DC_FIELD_GASMIX_COUNT, 0, &ngas) == DC_STATUS_SUCCESS) {
		for (unsigned int i = 0; i < ngas; ++i) {
			dc_gasmix_t g = {0};
			if (dc_parser_get_field (parser, DC_FIELD_GASMIX, i, &g) == DC_STATUS_SUCCESS)
				js_field ("gasmix", i, g.oxygen, g.helium, g.nitrogen, g.usage);
		}
	}
	unsigned int ntank = 0;
	if (dc_parser_get_field (parser, DC_FIELD_TANK_COUNT, 0, &ntank) == DC_STATUS_SUCCESS) {
		for (unsigned int i = 0; i < ntank; ++i) {
			dc_tank_t t = {0};
			if (dc_parser_get_field (parser, DC_FIELD_TANK, i, &t) == DC_STATUS_SUCCESS) {
				js_field ("tank", i, t.volume, t.workpressure, t.beginpressure, t.endpressure);
				js_field ("tankGas", i, t.gasmix == DC_GASMIX_UNKNOWN ? -1.0 : (double) t.gasmix, t.type, 0, 0);
			}
		}
	}

	rc = dc_parser_samples_foreach (parser, samplefunc, NULL);

out:
	if (parser) dc_parser_destroy (parser);
	dc_context_free (context);
	return rc;
}
