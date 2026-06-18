import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markOptionalIndicatorDatasetAvailable } from './optional-indicator-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const rawDir = path.join(repoRoot, 'data/raw/world-bank');
const processedDir = path.join(repoRoot, 'data/processed');
const staticOutputDir = path.join(repoRoot, 'static/data/indicators');
const staticOutputPath = path.join(staticOutputDir, 'quality-of-life.world-bank.latest.json');
const processedOutputPath = path.join(processedDir, 'quality-of-life.world-bank.latest.json');

const apiBase = 'https://api.worldbank.org/v2';
const indicators = {
	'SP.DYN.LE00.IN': {
		key: 'life_expectancy',
		label: 'Life expectancy at birth, total (years)',
		source: 'World Bank WDI'
	},
	'NY.GNP.PCAP.PP.CD': {
		key: 'gni_per_capita_ppp',
		label: 'GNI per capita, PPP (current international $)',
		source: 'World Bank WDI'
	},
	'SE.SEC.ENRR': {
		key: 'secondary_enrollment_gross',
		label: 'School enrollment, secondary (% gross)',
		source: 'World Bank WDI'
	},
	'SP.POP.TOTL': {
		key: 'population',
		label: 'Population, total',
		source: 'World Bank WDI'
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
	return typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null;
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

			if (normalized && !lookup.has(normalized)) {
				lookup.set(normalized, record.id);
			}
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

	await writeFile(path.join(rawDir, `${indicator}.json`), `${JSON.stringify(json, null, '\t')}\n`);

	return json[1];
}

function selectLatestByCountry(rows) {
	const latest = new Map();

	for (const row of rows) {
		const countryCode = normalizeCode(row?.countryiso3code);
		const year = Number(row?.date);
		const value = row?.value;

		if (!countryCode || !Number.isInteger(year) || typeof value !== 'number') {
			continue;
		}

		const existing = latest.get(countryCode);

		if (!existing || year > existing.year) {
			latest.set(countryCode, {
				countryCode,
				countryName: row?.country?.value ?? null,
				value,
				year
			});
		}
	}

	return latest;
}

function computeQualityOfLifeScore(values) {
	const life = values.life_expectancy?.value;
	const income = values.gni_per_capita_ppp?.value;
	const education = values.secondary_enrollment_gross?.value;

	if (typeof life !== 'number' || typeof income !== 'number' || income <= 0) {
		return null;
	}

	const lifeScore = clamp((life - 50) / (85 - 50), 0, 1);
	const incomeScore = clamp(
		(Math.log(income) - Math.log(1000)) / (Math.log(75000) - Math.log(1000)),
		0,
		1
	);
	const componentScores = [lifeScore, incomeScore];

	if (typeof education === 'number') {
		componentScores.push(clamp(education / 100, 0, 1));
	}

	return round(
		componentScores.reduce((sum, component) => sum + component, 0) / componentScores.length
	);
}

function classifyDataQuality(values) {
	const valueCount = Object.values(values).filter(Boolean).length;

	if (valueCount >= 3) return 'good';
	if (valueCount >= 2) return 'partial';
	return 'sparse';
}

async function main() {
	if (typeof fetch !== 'function') {
		throw new Error('This script requires a Node.js runtime with built-in fetch.');
	}

	await mkdir(rawDir, { recursive: true });
	await mkdir(processedDir, { recursive: true });
	await mkdir(staticOutputDir, { recursive: true });

	const registry = await readJson(registryPath);
	const registryLookup = buildRegistryLookup(registry);
	const retrievedAt = new Date().toISOString();
	const recordsById = new Map();
	const unmatched = new Map();
	const latestYears = {};

	for (const indicator of Object.keys(indicators)) {
		const rows = await fetchIndicator(indicator);
		const latestByCountry = selectLatestByCountry(rows);
		latestYears[indicator] =
			latestByCountry.size > 0
				? Math.max(...[...latestByCountry.values()].map((row) => row.year))
				: null;

		for (const row of latestByCountry.values()) {
			const registryId = registryLookup.get(row.countryCode);

			if (!registryId) {
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
					values: {},
					quality_of_life_score: null,
					data_quality: 'sparse',
					sources: ['world_bank_wdi']
				});
			}

			const record = recordsById.get(registryId);
			record.values[indicators[indicator].key] = {
				value: row.value,
				year: row.year,
				indicator
			};
		}
	}

	for (const record of recordsById.values()) {
		record.quality_of_life_score = computeQualityOfLifeScore(record.values);
		record.data_quality = classifyDataQuality(record.values);
	}

	const output = {
		dataset_id: 'quality_of_life_world_bank_latest',
		source_id: 'world_bank_wdi',
		retrieved_at: retrievedAt,
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
		latest_years: latestYears,
		notes: [
			'quality_of_life_score is project-specific and must not be described as HDI.',
			'Missing World Bank indicator values remain absent and are displayed as no_data.'
		]
	};

	const serialized = `${JSON.stringify(output, null, '\t')}\n`;
	await writeFile(staticOutputPath, serialized);
	await writeFile(processedOutputPath, serialized);
	await markOptionalIndicatorDatasetAvailable(repoRoot, path.basename(staticOutputPath));

	console.log('World Bank WDI quality-of-life dataset written.');
	console.log(`Matched registry records: ${output.records.length}`);
	console.log(`Unmatched source countries: ${output.unmatched_source_countries.length}`);
	console.log(`Static output: ${path.relative(repoRoot, staticOutputPath)}`);
}

await main();
