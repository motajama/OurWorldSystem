import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	rawDir: path.join(repoRoot, 'data/raw/atlas-economic-complexity'),
	output: path.join(repoRoot, 'static/data/indicators/productive-complexity.latest.json')
};

const sourceId = 'atlas_economic_complexity';
const notes = [
	'This component is a proxy for productive complexity and does not determine world-system position by itself.',
	'Missing source rows and unmatched country codes are reported rather than coerced into map-unit records.'
];

const columnAliases = {
	countryCode: ['country_id', 'iso3', 'country_code', 'location_code'],
	year: ['year'],
	eci: ['eci', 'complexity_index', 'economic_complexity_index'],
	exportValue: ['export_value'],
	diversity: ['diversity', 'export_diversity'],
	productCode: ['product_id', 'product_code', 'hs_product_code', 'hs92']
};

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function relativePath(filePath) {
	return path.relative(repoRoot, filePath);
}

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeCode(value) {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim().toUpperCase();
	if (!normalized || normalized === '-99') return null;
	return normalized;
}

function normalizeHeader(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/^\uFEFF/, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function parseNumber(value) {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim().replace(/,/g, '');
	if (!normalized || ['na', 'n/a', 'null', 'none', '..'].includes(normalized.toLowerCase())) {
		return null;
	}
	const number = Number(normalized);
	return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
	const number = parseNumber(value);
	return Number.isInteger(number) ? number : null;
}

function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];

		if (inQuotes) {
			if (char === '"' && next === '"') {
				field += '"';
				index += 1;
			} else if (char === '"') {
				inQuotes = false;
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
		} else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (char !== '\r') {
			field += char;
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const [headerRow, ...dataRows] = rows.filter((candidate) =>
		candidate.some((cell) => String(cell).trim().length > 0)
	);
	if (!headerRow) return { headers: [], records: [] };

	const headers = headerRow.map(normalizeHeader);
	const records = dataRows.map((dataRow) =>
		Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? '']))
	);

	return { headers, records };
}

function firstMatchingColumn(headers, aliases) {
	return aliases.find((alias) => headers.includes(alias)) ?? null;
}

function buildRegistryIndex(registry) {
	const byCode = new Map();

	for (const record of registry) {
		if (!isObject(record) || typeof record.id !== 'string') continue;
		const naturalEarth = isObject(record.natural_earth) ? record.natural_earth : {};
		const externalIds = isObject(record.external_ids) ? record.external_ids : {};
		const candidates = [
			externalIds.iso3,
			record.id,
			...(Array.isArray(naturalEarth.iso_a3) ? naturalEarth.iso_a3 : []),
			...(Array.isArray(naturalEarth.adm0_a3) ? naturalEarth.adm0_a3 : [])
		];

		for (const candidate of candidates) {
			const code = normalizeCode(candidate);
			if (code && !byCode.has(code)) byCode.set(code, record.id);
		}
	}

	return byCode;
}

function latestRecordKey(id, year) {
	return `${id}::${year}`;
}

function addValue(values, key, value, year, sourceColumn, sourceFile) {
	if (value === null) return;
	values[key] = {
		value,
		year,
		source_column: sourceColumn,
		source_file: sourceFile
	};
}

function percentileRanks(records, valueForRecord) {
	const values = records
		.map((record) => ({ id: record.id, value: valueForRecord(record) }))
		.filter((item) => typeof item.value === 'number' && Number.isFinite(item.value))
		.sort((a, b) => a.value - b.value);

	if (values.length === 0) return new Map();
	if (values.length === 1) return new Map([[values[0].id, 100]]);
	if (values[0].value === values[values.length - 1].value) {
		return new Map(values.map((item) => [item.id, 50]));
	}

	const ranks = new Map();
	let index = 0;
	while (index < values.length) {
		let end = index;
		while (end + 1 < values.length && values[end + 1].value === values[index].value) end += 1;
		const percentile = ((index + end) / 2 / (values.length - 1)) * 100;
		for (let rankIndex = index; rankIndex <= end; rankIndex += 1) {
			ranks.set(values[rankIndex].id, Number(percentile.toFixed(4)));
		}
		index = end + 1;
	}

	return ranks;
}

function dataQualityFor(values, score) {
	if (score === null) return 'sparse';
	if (values.economic_complexity_index && values.export_diversity) return 'good';
	return 'partial';
}

function roundedScore(value) {
	return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

async function csvFiles() {
	if (!(await exists(paths.rawDir))) return [];
	const entries = await readdir(paths.rawDir, { withFileTypes: true });
	const files = entries
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
		.map((entry) => entry.name);

	const preferred = ['country_complexity.csv', 'country_product_exports.csv', 'product_complexity.csv'];
	return files.sort((a, b) => {
		const aIndex = preferred.indexOf(a);
		const bIndex = preferred.indexOf(b);
		if (aIndex !== -1 || bIndex !== -1) {
			if (aIndex === -1) return 1;
			if (bIndex === -1) return -1;
			return aIndex - bIndex;
		}
		return a.localeCompare(b);
	});
}

function emptyOutput(status, generatedAt, extraNotes = []) {
	return {
		dataset_id: 'productive_complexity_latest',
		source_id: sourceId,
		model_component: 'productive_complexity',
		status,
		generated_at: generatedAt,
		records: [],
		unmatched_source_rows: [],
		notes: [...notes, ...extraNotes]
	};
}

async function main() {
	const generatedAt = new Date().toISOString();
	const files = await csvFiles();

	if (files.length === 0) {
		const output = emptyOutput('no_source_file', generatedAt, [
			'No CSV files were found in data/raw/atlas-economic-complexity/.'
		]);
		await mkdir(path.dirname(paths.output), { recursive: true });
		await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);
		console.log(`No Atlas CSV files found. Wrote placeholder ${relativePath(paths.output)}`);
		console.log('Records: 0');
		return;
	}

	const registry = await readJson(paths.registry);
	if (!Array.isArray(registry)) {
		throw new Error(`${relativePath(paths.registry)} root must be an array.`);
	}
	const registryIndex = buildRegistryIndex(registry);
	const byCountryYear = new Map();
	const unmatchedSourceRows = [];
	const processedFiles = [];
	const skippedFiles = [];

	for (const fileName of files) {
		const filePath = path.join(paths.rawDir, fileName);
		const { headers, records } = parseCsv(await readFile(filePath, 'utf8'));
		const countryColumn = firstMatchingColumn(headers, columnAliases.countryCode);
		const yearColumn = firstMatchingColumn(headers, columnAliases.year);
		const eciColumn = firstMatchingColumn(headers, columnAliases.eci);
		const diversityColumn = firstMatchingColumn(headers, columnAliases.diversity);
		const exportValueColumn = firstMatchingColumn(headers, columnAliases.exportValue);
		const productColumn = firstMatchingColumn(headers, columnAliases.productCode);

		if (!countryColumn || !yearColumn || (!eciColumn && !diversityColumn && !exportValueColumn)) {
			skippedFiles.push({
				file: fileName,
				reason: 'Required country, year, and indicator columns were not detected.'
			});
			continue;
		}

		processedFiles.push(fileName);
		for (const sourceRow of records) {
			const sourceCountryCode = normalizeCode(sourceRow[countryColumn]);
			const year = parseInteger(sourceRow[yearColumn]);
			if (!sourceCountryCode || year === null) continue;

			const id = registryIndex.get(sourceCountryCode);
			if (!id) {
				unmatchedSourceRows.push({
					source_file: fileName,
					source_country_code: sourceCountryCode,
					latest_year: year,
					reason: 'No matching registry id.'
				});
				continue;
			}

			const key = latestRecordKey(id, year);
			const entry = byCountryYear.get(key) ?? {
				id,
				source_country_code: sourceCountryCode,
				latest_year: year,
				values: {},
				productCodesWithExports: new Set()
			};

			addValue(
				entry.values,
				'economic_complexity_index',
				parseNumber(sourceRow[eciColumn]),
				year,
				eciColumn,
				fileName
			);
			addValue(
				entry.values,
				'export_diversity',
				parseNumber(sourceRow[diversityColumn]),
				year,
				diversityColumn,
				fileName
			);
			addValue(
				entry.values,
				'export_value',
				parseNumber(sourceRow[exportValueColumn]),
				year,
				exportValueColumn,
				fileName
			);

			const exportValue = parseNumber(sourceRow[exportValueColumn]);
			const productCode = productColumn ? normalizeCode(sourceRow[productColumn]) : null;
			if (!entry.values.export_diversity && exportValue !== null && exportValue > 0 && productCode) {
				entry.productCodesWithExports.add(productCode);
			}

			byCountryYear.set(key, entry);
		}
	}

	const latestById = new Map();
	for (const entry of byCountryYear.values()) {
		if (!entry.values.export_diversity && entry.productCodesWithExports.size > 0) {
			entry.values.export_diversity = {
				value: entry.productCodesWithExports.size,
				year: entry.latest_year,
				source_column: 'export_value',
				source_file: 'derived_from_country_product_exports'
			};
		}
		delete entry.productCodesWithExports;

		const existing = latestById.get(entry.id);
		if (!existing || entry.latest_year > existing.latest_year) latestById.set(entry.id, entry);
	}

	const records = [...latestById.values()]
		.filter((record) => Object.keys(record.values).length > 0)
		.sort((a, b) => a.id.localeCompare(b.id));

	const eciRanks = percentileRanks(records, (record) => record.values.economic_complexity_index?.value);
	const diversityRanks = percentileRanks(records, (record) => record.values.export_diversity?.value);

	for (const record of records) {
		const eciRank = eciRanks.get(record.id);
		const diversityRank = diversityRanks.get(record.id);
		let score = null;

		if (eciRank !== undefined && diversityRank !== undefined) {
			score = 0.75 * eciRank + 0.25 * diversityRank;
		} else if (eciRank !== undefined) {
			score = eciRank;
		} else if (diversityRank !== undefined) {
			score = diversityRank;
		}

		record.productive_complexity_score = roundedScore(score);
		record.score_method = 'percentile_rank_of_available_indicators';
		record.data_quality = dataQualityFor(record.values, score);
		record.sources = [sourceId];
	}

	const output = {
		dataset_id: 'productive_complexity_latest',
		source_id: sourceId,
		model_component: 'productive_complexity',
		status: 'data_loaded',
		generated_at: generatedAt,
		records,
		unmatched_source_rows: unmatchedSourceRows,
		notes: [
			...notes,
			`Processed Atlas CSV files: ${processedFiles.join(', ') || 'none'}.`,
			...(skippedFiles.length > 0
				? [`Skipped CSV files: ${skippedFiles.map((file) => `${file.file} (${file.reason})`).join('; ')}.`]
				: [])
		]
	};

	await mkdir(path.dirname(paths.output), { recursive: true });
	await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);

	console.log(`Wrote ${relativePath(paths.output)}`);
	console.log(`Source files found: ${files.length}`);
	console.log(`Processed files: ${processedFiles.join(', ') || 'none'}`);
	console.log(`Records: ${records.length}`);
	console.log(`Unmatched source rows: ${unmatchedSourceRows.length}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
