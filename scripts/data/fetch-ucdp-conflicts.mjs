import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { markOptionalIndicatorDatasetAvailable } from './optional-indicator-index.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const rawDir = path.join(repoRoot, 'data/raw/ucdp');
const outputDir = path.join(repoRoot, 'static/data/indicators');
const outputPath = path.join(outputDir, 'conflict.ucdp.latest.json');

const version = '26.1';
const datasets = {
	countryYear: {
		id: 'ucdp_country_year',
		env: 'UCDP_COUNTRY_YEAR_URL',
		fileBase: 'ucdp-organized-violence-country-year-26.1',
		// The UCDP download center exposes CSV downloads as ZIP files. Keep this URL
		// configurable because UCDP occasionally changes file naming while preserving
		// dataset pages and versioned codebooks.
		url:
			process.env.UCDP_COUNTRY_YEAR_URL ??
			'https://ucdp.uu.se/downloads/organizedviolencecy/organizedviolencecy-261-csv.zip'
	},
	prio: {
		id: 'ucdp_prio_armed_conflict',
		env: 'UCDP_PRIO_ARMED_CONFLICT_URL',
		fileBase: 'ucdp-prio-armed-conflict-26.1',
		url:
			process.env.UCDP_PRIO_ARMED_CONFLICT_URL ??
			'https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261-csv.zip'
	},
	ged: {
		id: 'ucdp_ged_global',
		env: 'UCDP_GED_GLOBAL_URL',
		fileBase: 'ucdp-ged-global-26.1',
		url: process.env.UCDP_GED_GLOBAL_URL ?? 'https://ucdp.uu.se/downloads/ged/ged261-csv.zip'
	}
};

const manualAliases = new Map([
	['democratic republic of congo', 'COD'],
	['democratic republic of the congo', 'COD'],
	['dr congo', 'COD'],
	['dr congo (zaire)', 'COD'],
	['zaire', 'COD'],
	['russia (soviet union)', 'RUS'],
	['soviet union', 'RUS'],
	['turkey', 'TUR'],
	['turkiye', 'TUR'],
	['türkiye', 'TUR'],
	['iran', 'IRN'],
	['iran (persia)', 'IRN'],
	['israel', 'ISR'],
	['palestine', 'PSE'],
	['palestine (west bank and gaza)', 'PSE'],
	['korea, republic of', 'KOR'],
	['south korea', 'KOR'],
	['korea, south', 'KOR'],
	['korea, democratic people\'s republic of', 'PRK'],
	['north korea', 'PRK'],
	['korea, north', 'PRK'],
	['united states of america', 'USA'],
	['united states', 'USA'],
	['uk', 'GBR'],
	['united kingdom', 'GBR'],
	['great britain', 'GBR']
]);

function normalizeCode(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toUpperCase();
	return normalized && normalized !== '-99' ? normalized : null;
}

function normalizeName(value) {
	if (typeof value !== 'string') return null;
	const normalized = value
		.trim()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ');

	return normalized.length > 0 && normalized !== '-99' ? normalized : null;
}

function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];

		if (char === '"') {
			if (inQuotes && next === '"') {
				field += '"';
				index += 1;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			row.push(field);
			field = '';
		} else if ((char === '\n' || char === '\r') && !inQuotes) {
			if (char === '\r' && next === '\n') index += 1;
			row.push(field);
			if (row.some((value) => value.length > 0)) rows.push(row);
			row = [];
			field = '';
		} else {
			field += char;
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		if (row.some((value) => value.length > 0)) rows.push(row);
	}

	if (rows.length === 0) return { headers: [], records: [] };

	const headers = rows[0].map((header, index) =>
		index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim()
	);
	const records = rows.slice(1).map((values) =>
		Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']))
	);

	return { headers, records };
}

function parseNumber(value) {
	if (value === null || value === undefined || value === '' || value === 'NA') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
	const number = parseNumber(value);
	return Number.isInteger(number) ? number : null;
}

function parseBoolean01(value) {
	if (value === null || value === undefined || value === '') return null;
	if (value === true || value === false) return value;
	const normalized = String(value).trim().toLowerCase();
	if (['1', 'true', 'yes'].includes(normalized)) return true;
	if (['0', 'false', 'no'].includes(normalized)) return false;
	return null;
}

function splitList(value) {
	if (typeof value !== 'string' || value.trim().length === 0) return [];
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
		.filter((item) => !['no_dyad', 'no actor', 'na'].includes(item.toLowerCase()));
}

function requireHeaders(headers, required, label) {
	const missing = required.filter((header) => !headers.includes(header));

	if (missing.length > 0) {
		throw new Error(`${label} is missing required CSV headers: ${missing.join(', ')}`);
	}
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function buildRegistryLookup(registry) {
	const byCode = new Map();
	const byName = new Map();

	for (const record of registry) {
		for (const code of [record.id, record.external_ids?.iso3, record.external_ids?.world_bank]) {
			const normalized = normalizeCode(code);
			if (normalized && !byCode.has(normalized)) byCode.set(normalized, record.id);
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...(record.natural_earth?.name_aliases ?? [])
		]) {
			const normalized = normalizeName(alias);
			if (normalized && !byName.has(normalized)) byName.set(normalized, record.id);
		}
	}

	for (const [alias, id] of manualAliases.entries()) {
		if (!byName.has(alias)) byName.set(alias, id);
	}

	return { byCode, byName };
}

function resolveRegistryId(value, lookup) {
	const code = normalizeCode(value);
	if (code && lookup.byCode.has(code)) return lookup.byCode.get(code);

	const name = normalizeName(value);
	if (name && lookup.byName.has(name)) return lookup.byName.get(name);

	return null;
}

async function downloadDataset(dataset) {
	const response = await fetch(dataset.url);

	if (!response.ok) {
		throw new Error(
			`UCDP download failed for ${dataset.id}: ${response.status} ${response.statusText}. ` +
				`If UCDP changed the URL, set ${dataset.env}.`
		);
	}

	const bytes = Buffer.from(await response.arrayBuffer());
	const isZip =
		dataset.url.toLowerCase().endsWith('.zip') ||
		response.headers.get('content-type')?.toLowerCase().includes('zip');
	const rawPath = path.join(rawDir, `${dataset.fileBase}${isZip ? '.zip' : '.csv'}`);
	await writeFile(rawPath, bytes);

	if (!isZip) {
		const csvText = bytes.toString('utf8');
		await writeFile(path.join(rawDir, `${dataset.fileBase}.csv`), csvText);
		return { rawPath, csvPath: rawPath, csvText };
	}

	let listOutput;
	try {
		({ stdout: listOutput } = await execFileAsync('unzip', ['-Z1', rawPath]));
	} catch (error) {
		throw new Error(`Unable to inspect ${rawPath}. Install the unzip command or provide a direct CSV URL.`);
	}

	const csvEntry = listOutput
		.split('\n')
		.map((entry) => entry.trim())
		.find((entry) => entry.toLowerCase().endsWith('.csv'));

	if (!csvEntry) {
		throw new Error(`No CSV file found inside ${rawPath}.`);
	}

	const { stdout } = await execFileAsync('unzip', ['-p', rawPath, csvEntry], {
		maxBuffer: 1024 * 1024 * 200
	});
	const csvPath = path.join(rawDir, `${dataset.fileBase}.csv`);
	await writeFile(csvPath, stdout);

	return { rawPath, csvPath, csvText: stdout };
}

function buildTerritoryRecords(rows, lookup, unmatched) {
	const latestById = new Map();
	const latestYear = Math.max(...rows.map((row) => parseInteger(row.year_cy)).filter(Number.isInteger));

	for (const row of rows) {
		const year = parseInteger(row.year_cy);
		const registryId = resolveRegistryId(row.country_cy, lookup);

		if (!registryId) {
			if (year === latestYear) {
				unmatched.push({
					source: 'ucdp_country_year',
					year,
					source_country: row.country_cy,
					source_country_id: row.country_id_cy,
					reason: 'No registry id matched by source country name or aliases.'
				});
			}
			continue;
		}

		const existing = latestById.get(registryId);
		if (!existing || year > existing.year) {
			latestById.set(registryId, { ...row, registryId, year });
		}
	}

	return { latestById, latestYear };
}

function aggregateTerritory(row) {
	const activeFlags = ['sb_exist_cy', 'ns_exist_cy', 'os_exist_cy']
		.map((field) => parseBoolean01(row[field]))
		.filter((value) => value !== null);
	const best = parseNumber(row.cumulative_total_deaths_in_orgvio_best_cy);
	const low = parseNumber(row.cumulative_total_deaths_in_orgvio_low_cy);
	const high = parseNumber(row.cumulative_total_deaths_in_orgvio_high_cy);
	const hasOrganizedViolence =
		activeFlags.length > 0 ? activeFlags.some(Boolean) : best !== null ? best > 0 : null;

	return {
		has_organized_violence: hasOrganizedViolence,
		latest_year: row.year,
		fatalities_best_estimate: best,
		fatalities_low: low,
		fatalities_high: high,
		event_count: null,
		source: 'ucdp_country_year'
	};
}

function decodeConflictType(value) {
	return (
		{
			1: 'extrasystemic',
			2: 'interstate',
			3: 'intrastate',
			4: 'internationalized_intrastate'
		}[String(value)] ?? String(value || '')
	);
}

function decodeIntensity(value) {
	return (
		{
			1: 'minor',
			2: 'war'
		}[String(value)] ?? String(value || '')
	);
}

function participantNames(row) {
	return [
		...splitList(row.side_a),
		...splitList(row.side_a_2nd),
		...splitList(row.side_b_2nd),
		// In interstate rows, side_b is a state actor. In intrastate rows it is usually a
		// non-state actor, so name matching will normally fail and no state claim is made.
		...splitList(row.side_b)
	];
}

function buildStateInvolvement(rows, lookup, unmatched) {
	const latestYear = Math.max(...rows.map((row) => parseInteger(row.year)).filter(Number.isInteger));
	const activeRows = rows.filter((row) => parseInteger(row.year) === latestYear);
	const involvementById = new Map();
	const unmatchedParticipantNames = new Set();

	for (const row of activeRows) {
		const mappedIds = new Set();
		for (const name of participantNames(row)) {
			const registryId = resolveRegistryId(name, lookup);
			if (registryId) {
				mappedIds.add(registryId);
			} else if (!/government|rebel|insurgent|militia|forces|front|army/i.test(name)) {
				unmatchedParticipantNames.add(name);
			}
		}

		for (const registryId of mappedIds) {
			if (!involvementById.has(registryId)) {
				involvementById.set(registryId, []);
			}
			involvementById.get(registryId).push({
				conflict_id: row.conflict_id,
				name: row.location || row.territory_name || row.side_a || `Conflict ${row.conflict_id}`,
				year: latestYear,
				type: decodeConflictType(row.type_of_conflict),
				intensity_level: decodeIntensity(row.intensity_level),
				cumulative_intensity:
					parseBoolean01(row.cumulative_intensity) === true ? 'war_history' : 'below_war_threshold'
			});
		}
	}

	for (const name of [...unmatchedParticipantNames].sort()) {
		unmatched.push({
			source: 'ucdp_prio_armed_conflict',
			year: latestYear,
			source_country: name,
			reason: 'Participant-like name in latest UCDP/PRIO rows did not match registry aliases.'
		});
	}

	return { involvementById, latestYear };
}

function classifyQuality(hasTerritory, hasState) {
	if (hasTerritory && hasState) return 'good';
	if (hasTerritory || hasState) return 'partial';
	return 'sparse';
}

async function main() {
	if (typeof fetch !== 'function') {
		throw new Error('This script requires a Node.js runtime with built-in fetch.');
	}

	await mkdir(rawDir, { recursive: true });
	await mkdir(outputDir, { recursive: true });

	const registry = await readJson(registryPath);
	const lookup = buildRegistryLookup(registry);
	const retrievedAt = new Date().toISOString();
	const unmatched = [];

	const [countryDownload, prioDownload] = await Promise.all([
		downloadDataset(datasets.countryYear),
		downloadDataset(datasets.prio)
	]);
	const countryCsv = parseCsv(countryDownload.csvText);
	const prioCsv = parseCsv(prioDownload.csvText);

	console.log(`UCDP country-year CSV headers: ${countryCsv.headers.join(', ')}`);
	console.log(`UCDP/PRIO armed-conflict CSV headers: ${prioCsv.headers.join(', ')}`);

	requireHeaders(countryCsv.headers, ['country_cy', 'year_cy'], 'UCDP country-year dataset');
	if (
		!countryCsv.headers.includes('cumulative_total_deaths_in_orgvio_best_cy') &&
		!countryCsv.headers.some((header) => ['sb_exist_cy', 'ns_exist_cy', 'os_exist_cy'].includes(header))
	) {
		throw new Error(
			'UCDP country-year dataset is missing both organized-violence fatality and active-marker columns.'
		);
	}
	requireHeaders(
		prioCsv.headers,
		['conflict_id', 'location', 'side_a', 'side_b', 'year', 'intensity_level', 'type_of_conflict'],
		'UCDP/PRIO armed-conflict dataset'
	);

	const territory = buildTerritoryRecords(countryCsv.records, lookup, unmatched);
	const state = buildStateInvolvement(prioCsv.records, lookup, unmatched);
	const allIds = new Set([...territory.latestById.keys(), ...state.involvementById.keys()]);
	const records = [];

	for (const id of [...allIds].sort()) {
		const territoryRow = territory.latestById.get(id);
		const territoryRecord = territoryRow ? aggregateTerritory(territoryRow) : null;
		const conflicts = state.involvementById.get(id) ?? [];
		const stateRecord = {
			involved_in_state_based_conflict: conflicts.length > 0,
			latest_year: state.latestYear,
			conflict_count: conflicts.length,
			conflicts,
			source: 'ucdp_prio_armed_conflict'
		};
		const territoryFlag = territoryRecord?.has_organized_violence ?? null;
		const stateFlag = conflicts.length > 0;

		records.push({
			id,
			territory: territoryRecord,
			state_involvement: stateRecord,
			conflict_summary: {
				war_on_territory: territoryFlag,
				involved_in_conflict: stateFlag,
				active_conflicts: conflicts.map((conflict) => conflict.name),
				fatalities_best_estimate: territoryRecord?.fatalities_best_estimate ?? null,
				child_casualties_verified: null,
				notes: 'UCDP does not provide adult/child casualty breakdowns in this processed layer.'
			},
			data_quality: classifyQuality(Boolean(territoryRecord), conflicts.length > 0),
			sources: [
				...(territoryRecord ? ['ucdp_country_year'] : []),
				...(conflicts.length > 0 ? ['ucdp_prio_armed_conflict'] : [])
			]
		});
	}

	const output = {
		dataset_id: 'conflict_ucdp_latest',
		source_ids: ['ucdp_country_year', 'ucdp_prio_armed_conflict'],
		retrieved_at: retrievedAt,
		version,
		latest_year: Math.max(territory.latestYear, state.latestYear),
		records,
		unmatched_source_rows: unmatched,
		raw_files: [
			path.relative(repoRoot, countryDownload.rawPath),
			path.relative(repoRoot, countryDownload.csvPath),
			path.relative(repoRoot, prioDownload.rawPath),
			path.relative(repoRoot, prioDownload.csvPath)
		],
		headers: {
			ucdp_country_year: countryCsv.headers,
			ucdp_prio_armed_conflict: prioCsv.headers
		},
		notes: [
			'UCDP organized violence data should not be interpreted as complete civilian casualty counts.',
			'War or organized violence on territory is not a statement of state responsibility.',
			'Child casualties are not estimated in this layer.'
		]
	};

	await writeFile(outputPath, `${JSON.stringify(output, null, '\t')}\n`);
	await markOptionalIndicatorDatasetAvailable(repoRoot, path.basename(outputPath));
	console.log('UCDP conflict indicator dataset written.');
	console.log(`Latest year: ${output.latest_year}`);
	console.log(`Matched records: ${output.records.length}`);
	console.log(`Unmatched source rows: ${output.unmatched_source_rows.length}`);
	console.log(`Static output: ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
