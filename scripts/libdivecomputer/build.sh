#!/usr/bin/env bash
# Build libdivecomputer (LGPL-2.1) as a separate WebAssembly module for DecoTrail's
# "Download from dive computer" (Web Bluetooth). Output: js/vendor/libdivecomputer/.
#
# Needs Emscripten (brew install emscripten) and git. The upstream source is cloned at the
# pinned commit below, unmodified; glue.c is the only extra C file.
#
#   scripts/libdivecomputer/build.sh            # build
#   LDC_SRC=/path/to/libdivecomputer build.sh   # use an existing checkout (must be at the pinned commit)
set -euo pipefail

UPSTREAM=https://github.com/libdivecomputer/libdivecomputer.git
COMMIT=9e6c3c8328562b9b82abce7b476d86e79046d446   # master, 2026-09-11

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/js/vendor/libdivecomputer"
WORK="${TMPDIR:-/tmp}/decotrail-libdc-build"
SRC="${LDC_SRC:-$WORK/libdivecomputer}"

command -v emcc >/dev/null || { echo "emcc not found (brew install emscripten)" >&2; exit 1; }

if [ ! -d "$SRC/.git" ]; then
    mkdir -p "$WORK"
    git clone --quiet "$UPSTREAM" "$SRC"
fi
git -C "$SRC" fetch --quiet origin "$COMMIT" 2>/dev/null || true
git -C "$SRC" checkout --quiet "$COMMIT"
[ "$(git -C "$SRC" rev-parse HEAD)" = "$COMMIT" ] || { echo "libdivecomputer is not at $COMMIT" >&2; exit 1; }

GEN="$WORK/gen"
mkdir -p "$GEN/libdivecomputer"
# What autoconf would have produced for a POSIX-like target without USB/HID/BlueZ/IrDA.
cat > "$GEN/config.h" <<'EOF'
#define ENABLE_LOGGING 1
#define HAVE_UNISTD_H 1
#define HAVE_SYS_PARAM_H 1
#define HAVE_LOCALTIME_R 1
#define HAVE_GMTIME_R 1
#define HAVE_TIMEGM 1
#define HAVE_CLOCK_GETTIME 1
#define HAVE_STRUCT_TM_TM_GMTOFF 1
#define HAVE_VERSION_SUFFIX 1
EOF
printf '#define DC_VERSION_REVISION "%s"\n' "${COMMIT:0:12}" > "$GEN/revision.h"
sed -e 's/@DC_VERSION@/0.10.0-devel/' -e 's/@DC_VERSION_MAJOR@/0/' -e 's/@DC_VERSION_MINOR@/10/' -e 's/@DC_VERSION_MICRO@/0/' \
    "$SRC/include/libdivecomputer/version.h.in" > "$GEN/libdivecomputer/version.h"

# Every library source except the OS transports the browser cannot use; the linker drops
# everything the Mares Icon HD path does not reach.
SOURCES=()
for f in "$SRC"/src/*.c; do
    case "$(basename "$f")" in
        serial_win32.c|irda.c|bluetooth.c|usb.c|usbhid.c|usb_storage.c|serial_posix.c) ;;
        *) SOURCES+=("$f") ;;
    esac
done

mkdir -p "$OUT"
emcc -O2 -DHAVE_CONFIG_H -Wno-macro-redefined \
    -I"$GEN" -I"$SRC/include" -I"$SRC/src" \
    "${SOURCES[@]}" "$HERE/glue.c" \
    -o "$OUT/libdc.mjs" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLibdc \
    -sENVIRONMENT=web,node \
    -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=65536 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sEXPORTED_FUNCTIONS=_malloc,_free,_ldc_mares_download,_ldc_mares_parse,_ldc_set_fingerprint,_ldc_version \
    -sEXPORTED_RUNTIME_METHODS=HEAPU8,UTF8ToString,ccall \
    -Wno-unused-command-line-argument

cp "$SRC/COPYING" "$OUT/COPYING"
printf '%s\n' "$COMMIT" > "$OUT/UPSTREAM_COMMIT"
ls -l "$OUT"
