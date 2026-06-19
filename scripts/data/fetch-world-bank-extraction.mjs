import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	rawDir: path.join(repoRoot, 'data/raw/world-bank/extraction'),
	output: path.join(
		repoRoot,
		'static/data/indicators/extraction-dependency.world-bank.latest.json'
	)
};

const apiBase = 'https://api.worldbank.org/v2';
const sourceId = 'world_bank_wdi_extraction';

const indicators = {
	'NY.GDP.TOTL.RT.ZS': {
		key: 'natural_resource_rents_gdp_pct',
		label: 'Total natural resources rents (% of GDP)',
		source: 'World Bank WDI',
		scoreKind: 'dependency',
		weight: 0.3,
		normalizer: 30
	},
	'TX.VAL.FUEL.ZS.UN': {
		key: 'fuel_exports_merchandise_pct',
		label: 'Fuel exports (% of merchandise exports)',
		source: 'World Bank WDI',
		scoreKind: 'dependency',
		weight: 0.25,
		normalizer: 80
	},
	'TX.VAL.MMTL.ZS.UN': {
		key: 'ores_metals_exports_merchandise_pct',
		label: 'Ores and metals exports (% of merchandise exports)',
		source: 'World Bank WDI',
		scoreKind: 'dependency',
		weight: 0.2,
		normalizer: 60
	},
	'TX.VAL.AGRI.ZS.UN': {
		key: 'agricultural_raw_exports_merchandise_pct',
		label: 'Agricultural raw materials exports (% of merchandise exports)',
		source: 'World Bank WDI',
		scoreKind: 'dependency',
		weight: 0.15,
		normalizer: 30
	},
	'TX.VAL.FOOD.ZS.UN': {
		key: 'food_exports_merchandise_pct',
		label: 'Food exports (% of merchandise exports)',
		source: 'World Bank WDI',
		scoreKind: 'dependency',
		weight: 0.1,
		normalizer: 60
	},
	'TX.VAL.MANF.ZS.UN': {
		key: 'manufactures_exports_merchandise_pct',
		label: 'Manufactures exports (% of merchandise exports)',
		source: 'World Bank WDI',
		scoreKind: 'autonomy',
		weight: 1,
		normalizer: 90
	},
	'TX.VAL.TECH.MF.ZS': {
		key: 'high_tech_exports_manufactured_pct',
		label: 'High-technology exports (% of manufactured exports)',
		source: 'World Bank WDI',
		scoreKind: 'autonomy',
		weight: 1,
		normalizer: 40
	},
	'TX.MNF.TECH.ZS.UN': {
		key: 'medium_high_tech_exports_manufactured_pct',
		label: 'Medium and high-tech exports (% manufactured exports)',
		source: 'World Bank WDI',
		scoreKind: 'autonomy',
		weight: 1,
		normalizer: 70
	}
};

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function round(value, places = 4) {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function normalizeCode(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toUpperCase();
	if (!normalized || normalized === '-99') return null;
	return normalized;
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function buildRegistryLookup(registry) {
	const lookup = new Map();

	for (const record of registry) {
		for (const code of [record?.external_ids?.world_bank, record?.external_ids?.iso3, record?.id]) {
			const normalized = normalizeCode(code);
			if (normalized && !lookup.has(normalized)) lookup.set(normalized, record.id);
		}
	}

	return lookup;
}

async function fetchIndicator(indicator) {
	const url = `${apiBase}/country/all/indicator/${indicator}?format=json&per_page=20000`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`World Bank API request failed for ${indicator}: ${response.status}`);
	}

	const json = await response.json();
	if (!Array.isArray(json) || !Array.isArray(json[1])) {
		throw new Error(`Unexpected World Bank API response shape for ${indicator}.`);
	}

	await writeFile(path.join(paths.rawDir, `${indicator}.json`), `${JSON.stringify(json, null, '\t')}\n`);
	return json[1];
}

async function fetchWorldBankAggregates() {
	const url = `${apiBase}/country/all?format=json&per_page=400`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`World Bank country metadata request failed: ${response.status}`);
	}

	const json = await response.json();
	if (!Array.isArray(json) || !Array.isArray(json[1])) {
		throw new Error('Unexpected World Bank country metadata response shape.');
	}

	await writeFile(path.join(paths.rawDir, 'countries.json'), `${JSON.stringify(json, null, '\t')}\n`);

	return new Set(
		json[1]
			.filter((country) => country?.region?.value === 'Aggregates')
			.map((country) => normalizeCode(country?.id))
			.filter(Boolean)
	);
}

function selectLatestByCountry(rows) {
	const latest = new Map();

	for (const row of rows) {
		const countryCode = normalizeCode(row?.countryiso3code);
		const fallbackCode = normalizeCode(row?.country?.id);
		const matchCode = countryCode ?? fallbackCode;
		const year = Number(row?.date);
		const value = row?.value;

		if (!matchCode || !Number.isInteger(year) || typeof value !== 'number' || !Number.isFinite(value)) {
			continue;
		}

		const existing = latest.get(matchCode);
		if (!existing || year > existing.year) {
			latest.set(matchCode, {
				countryCode: matchCode,
				countryName: row?.country?.value ?? null,
				value,
				year
			});
		}
	}

	return latest;
}

function weightedMean(entries) {
	const available = entries.filter((entry) => typeof entry.score === 'number');
	const weightSum = available.reduce((sum, entry) => sum + entry.weight, 0);
	if (weightSum <= 0) return null;
	return available.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / weightSum;
}

function computeScores(record) {
	const dependencyEntries = [];
	const autonomyEntries = [];

	for (const metadata of Object.values(indicators)) {
		const value = record.values[metadata.key]?.value;
		if (typeof value !== 'number' || !Number.isFinite(value)) continue;

		const entry = {
			score: clamp(value / metadata.normalizer, 0, 1),
			weight: metadata.weight
		};

		if (metadata.scoreKind === 'dependency') dependencyEntries.push(entry);
		if (metadata.scoreKind === 'autonomy') autonomyEntries.push(entry);
	}

	const dependencyMean = weightedMean(dependencyEntries);
	const autonomyMean = weightedMean(autonomyEntries);

	if (dependencyMean === null) {
		record.extraction_dependency_score = null;
		record.extraction_autonomy_score = null;
	} else {
		record.extraction_dependency_score = round(dependencyMean * 100, 2);
		record.extraction_autonomy_score =
			autonomyMean === null
				? round((1 - dependencyMean) * 100, 2)
				: round((0.65 * (1 - dependencyMean) + 0.35 * autonomyMean) * 100, 2);
	}

	const dependencyCount = dependencyEntries.length;
	const autonomyCount = autonomyEntries.length;
	if (dependencyCount >= 3 && autonomyCount >= 1) {
		record.data_quality = 'good';
	} else if (dependencyCount >= 2 || (dependencyCount >= 1 && autonomyCount >= 1)) {
		record.data_quality = 'partial';
	} else {
		record.data_quality = 'sparse';
	}
}

async function main() {
	if (typeof fetch !== 'function') {
		throw new Error('This script requires a Node.js runtime with built-in fetch.');
	}

	await mkdir(paths.rawDir, { recursive: true });
	await mkdir(path.dirname(paths.output), { recursive: true });

	const registry = await readJson(paths.registry);
	const registryLookup = buildRegistryLookup(registry);
	let aggregateCodes = new Set();
	const sourceFetchFailures = [];
	try {
		aggregateCodes = await fetchWorldBankAggregates();
	} catch (error) {
		sourceFetchFailures.push({
			indicator: 'WORLD_BANK_COUNTRY_METADATA',
			message: error instanceof Error ? error.message : 'Unknown fetch error'
		});
	}
	const recordsById = new Map();
	const unmatched = new Map();
	const ignoredAggregates = new Map();
	const latestYears = {};
	const failedIndicators = [...sourceFetchFailures];

	for (const [indicator, metadata] of Object.entries(indicators)) {
		let rows = [];
		try {
			rows = await fetchIndicator(indicator);
		} catch (error) {
			failedIndicators.push({
				indicator,
				message: error instanceof Error ? error.message : 'Unknown fetch error'
			});
			latestYears[indicator] = null;
			continue;
		}

		const latestByCountry = selectLatestByCountry(rows);
		latestYears[indicator] =
			latestByCountry.size > 0
				? Math.max(...[...latestByCountry.values()].map((row) => row.year))
				: null;

		for (const row of latestByCountry.values()) {
			const registryId = registryLookup.get(row.countryCode);

			if (!registryId) {
				if (aggregateCodes.has(row.countryCode)) {
					ignoredAggregates.set(row.countryCode, {
						source_country_code: row.countryCode,
						source_country_name: row.countryName
					});
					continue;
				}

				unmatched.set(row.countryCode, {
					source_country_code: row.countryCode,
					source_country_name: row.countryName
				});
				continue;
			}

			if (!recordsById.has(registryId)) {
				recordsById.set(registryId, {
					id: registryId,
					source_country_code: row.countryCode,
					latest_year: row.year,
					values: {},
					extraction_dependency_score: null,
					extraction_autonomy_score: null,
					data_quality: 'sparse',
					sources: [sourceId]
				});
			}

			const record = recordsById.get(registryId);
			record.source_country_code = record.source_country_code ?? row.countryCode;
			record.latest_year = Math.max(record.latest_year ?? row.year, row.year);
			record.values[metadata.key] = {
				value: row.value,
				year: row.year,
				indicator
			};
		}
	}

	for (const record of recordsById.values()) {
		computeScores(record);
	}

	const output = {
		dataset_id: 'extraction_dependency_world_bank_latest',
		source_id: sourceId,
		model_component: 'extraction_dependency',
		generated_at: new Date().toISOString(),
		indicators: Object.fromEntries(
			Object.entries(indicators).map(([indicator, metadata]) => [
				indicator,
				{ label: metadata.label, source: metadata.source }
			])
		),
		records: [...recordsById.values()].sort((a, b) => a.id.localeCompare(b.id)),
		unmatched_source_countries: [...unmatched.values()].sort((a, b) =>
			a.source_country_code.localeCompare(b.source_country_code)
		),
		ignored_aggregate_regions: [...ignoredAggregates.values()].sort((a, b) =>
			a.source_country_code.localeCompare(b.source_country_code)
		),
		latest_years: latestYears,
		failed_indicators: failedIndicators,
		notes: [
			'Higher extraction_dependency_score means stronger dependence on resource rents or low-processing export profile.',
			'Higher extraction_autonomy_score means lower extraction dependence and more diversified/manufacturing/high-tech export profile.',
			'This component is not a final world-system classification.',
			'Commodity export dependence requires later refinement with BACI or Comtrade product-level data.'
		]
	};

	await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);

	console.log(`Wrote ${path.relative(repoRoot, paths.output)}`);
	console.log(`Records: ${output.records.length}`);
	console.log(`Unmatched source countries: ${output.unmatched_source_countries.length}`);
	console.log(`Ignored aggregate regions: ${output.ignored_aggregate_regions.length}`);
	if (failedIndicators.length > 0) {
		console.log(`Failed indicators: ${failedIndicators.map((item) => item.indicator).join(', ')}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
