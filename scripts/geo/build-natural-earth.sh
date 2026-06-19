#!/usr/bin/env bash
set -euo pipefail

RAW_DIR="data/raw/natural-earth"
GEO_DIR="static/geo"

COUNTRIES_URL="https://naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip"
DISPUTED_URL="https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_breakaway_disputed_areas.zip"

COUNTRIES_ZIP="${RAW_DIR}/ne_110m_admin_0_countries.zip"
DISPUTED_ZIP="${RAW_DIR}/ne_50m_admin_0_breakaway_disputed_areas.zip"

COUNTRIES_SHP="${RAW_DIR}/ne_110m_admin_0_countries.shp"
DISPUTED_SHP="${RAW_DIR}/ne_50m_admin_0_breakaway_disputed_areas.shp"

require_tool() {
	local tool="$1"

	if ! command -v "${tool}" >/dev/null 2>&1; then
		echo "Missing required tool: ${tool}" >&2
		exit 1
	fi
}

download_if_missing() {
	local url="$1"
	local destination="$2"
	local required="$3"

	if [ -f "${destination}" ]; then
		echo "Using existing ${destination}"
		return
	fi

	echo "Downloading ${url}"
	if ! curl --fail --location --show-error --output "${destination}" "${url}"; then
		if [ "${required}" = "required" ]; then
			if [ -f "${GEO_DIR}/world.topojson" ]; then
				echo "Required Natural Earth download failed; using existing ${GEO_DIR}/world.topojson" >&2
				rm -f "${destination}"
				return
			fi

			echo "Failed to download required Natural Earth dataset: ${url}" >&2
			exit 1
		fi

		echo "Optional Natural Earth dataset unavailable: ${url}" >&2
		rm -f "${destination}"
	fi
}

unzip_if_needed() {
	local archive="$1"
	local expected_shp="$2"

	if [ -f "${expected_shp}" ]; then
		echo "Using existing ${expected_shp}"
		return
	fi

	if [ ! -f "${archive}" ]; then
		return
	fi

	echo "Unzipping ${archive}"
	unzip -o -q "${archive}" -d "${RAW_DIR}"
}

require_tool curl
require_tool unzip
require_tool npx

mkdir -p "${RAW_DIR}" "${GEO_DIR}"

download_if_missing "${COUNTRIES_URL}" "${COUNTRIES_ZIP}" "required"
download_if_missing "${DISPUTED_URL}" "${DISPUTED_ZIP}" "optional"

unzip_if_needed "${COUNTRIES_ZIP}" "${COUNTRIES_SHP}"
unzip_if_needed "${DISPUTED_ZIP}" "${DISPUTED_SHP}"

if [ -f "${COUNTRIES_SHP}" ]; then
	echo "Building ${GEO_DIR}/world.topojson"
	npx mapshaper "${COUNTRIES_SHP}" \
		-filter-fields ADM0_A3,ISO_A3,NAME,NAME_LONG,NAME_SORT,BRK_NAME,SOV_A3,TYPE,ADMIN,FCLASS_ISO,FCLASS_US,FCLASS_FR,FCLASS_RU,FCLASS_CN \
		-simplify 15% keep-shapes \
		-clean \
		-o format=topojson force "${GEO_DIR}/world.topojson"
elif [ -f "${GEO_DIR}/world.topojson" ]; then
	echo "Skipping base geometry rebuild; using existing ${GEO_DIR}/world.topojson"
else
	echo "Missing required shapefile after unzip: ${COUNTRIES_SHP}" >&2
	exit 1
fi

if [ -f "${DISPUTED_SHP}" ]; then
	echo "Building ${GEO_DIR}/disputed.topojson"
	npx mapshaper "${DISPUTED_SHP}" \
		-filter-fields ADM0_A3,ISO_A3,NAME,NAME_LONG,NAME_SORT,BRK_NAME,SOV_A3,TYPE,ADMIN,FCLASS_ISO,FCLASS_US,FCLASS_FR,FCLASS_RU,FCLASS_CN \
		-simplify 12% keep-shapes \
		-clean \
		-o format=topojson force "${GEO_DIR}/disputed.topojson"
else
	echo "Skipping disputed overlay; optional shapefile not present."
fi

echo "Natural Earth TopoJSON build complete."
