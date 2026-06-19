import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	extractionDependency: path.join(
		repoRoot,
		'static/data/indicators/extraction-dependency.world-bank.latest.json'
	),
	output: path.join(repoRoot, 'static/data/indicators/productive-capability.world-bank.latest.json')
};

const sourceId = 'world_bank_wdi_extraction';

const indicatorKeys = {
	manufactures_exports_merchandise_pct: {
		normalizer: 75,
		supportReason: 'high manufactures export share'
	},
	high_tech_exports_manufactured_pct: {
		normalizer: 25,
		supportReason: 'high high-tech export share'
	},
	medium_high_tech_exports_manufactured_pct: {
		normalizer: 60,
		supportReason: 'high medium/high-tech export share'
	}
};

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function round(value, places = 2) {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

function scoreFor(value, key) {
	if (!isFiniteNumber(value)) return null;
	return clamp(value / indicatorKeys[key].normalizer, 0, 1);
}

function copyUsableValues(values) {
	const output = {};

	for (const key of Object.keys(indicatorKeys)) {
		const sourceValue = values?.[key];
		if (!isFiniteNumber(sourceValue?.value) || !Number.isInteger(sourceValue?.year)) continue;

		output[key] = {
			value: sourceValue.value,
			year: sourceValue.year,
			indicator: sourceValue.indicator
		};
	}

	return output;
}

function computeScore(values) {
	const manufacturesScore = scoreFor(
		values.manufactures_exports_merchandise_pct?.value,
		'manufactures_exports_merchandise_pct'
	);
	const hightechScore = scoreFor(
		values.high_tech_exports_manufactured_pct?.value,
		'high_tech_exports_manufactured_pct'
	);
	const mediumHightechScore = scoreFor(
		values.medium_high_tech_exports_manufactured_pct?.value,
		'medium_high_tech_exports_manufactured_pct'
	);

	if (manufacturesScore !== null && hightechScore !== null && mediumHightechScore !== null) {
		return {
			score: round(
				100 * (0.4 * manufacturesScore + 0.35 * hightechScore + 0.25 * mediumHightechScore)
			),
			dataQuality: 'good'
		};
	}

	if (manufacturesScore !== null && hightechScore !== null) {
		return {
			score: round(100 * (0.55 * manufacturesScore + 0.45 * hightechScore)),
			dataQuality: 'partial'
		};
	}

	if (manufacturesScore !== null) {
		return {
			score: round(100 * manufacturesScore),
			dataQuality: 'partial'
		};
	}

	return {
		score: null,
		dataQuality: 'sparse'
	};
}

function supportReasons(values, score) {
	if (!isFiniteNumber(score) || score < 70) return [];

	const reasons = [];
	for (const [key, metadata] of Object.entries(indicatorKeys)) {
		const normalized = scoreFor(values[key]?.value, key);
		if (normalized !== null && normalized >= 0.8) reasons.push(metadata.supportReason);
	}

	return reasons;
}

function recordFromExtractionRecord(extractionRecord) {
	const values = copyUsableValues(extractionRecord.values);
	const { score, dataQuality } = computeScore(values);
	const hasManufacturesOrHightech =
		isFiniteNumber(values.manufactures_exports_merchandise_pct?.value) ||
		isFiniteNumber(values.high_tech_exports_manufactured_pct?.value);
	const positiveStructuralSupport =
		isFiniteNumber(score) && score >= 70 && dataQuality !== 'sparse' && hasManufacturesOrHightech;

	return {
		id: extractionRecord.id,
		latest_year:
			Object.values(values).length > 0
				? Math.max(...Object.values(values).map((value) => value.year))
				: extractionRecord.latest_year,
		values,
		productive_capability_score: score,
		positive_structural_support: positiveStructuralSupport,
		support_reasons: positiveStructuralSupport ? supportReasons(values, score) : [],
		data_quality: dataQuality,
		limitations: [
			'This proxy measures export structure, not value-chain control or value capture.'
		],
		sources: [sourceId]
	};
}

async function main() {
	const [registry, extractionDependency] = await Promise.all([
		readJson(paths.registry),
		readJson(paths.extractionDependency)
	]);
	const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
	const records = (extractionDependency.records ?? [])
		.filter((record) => typeof record?.id === 'string' && registryIds.has(record.id))
		.map(recordFromExtractionRecord)
		.sort((a, b) => a.id.localeCompare(b.id));

	const output = {
		dataset_id: 'productive_capability_world_bank_latest',
		source_id: sourceId,
		model_component: 'productive_capability_proxy',
		status: 'provisional_proxy',
		generated_at: new Date().toISOString(),
		records,
		notes: [
			'This is a provisional positive structural proxy.',
			'It should later be replaced or complemented by Atlas/BACI/Comtrade economic complexity and OECD TiVA value-capture data.',
			'High productive capability does not by itself prove core status.'
		]
	};

	await mkdir(path.dirname(paths.output), { recursive: true });
	await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);

	const top = records
		.filter((record) => isFiniteNumber(record.productive_capability_score))
		.sort((a, b) => b.productive_capability_score - a.productive_capability_score)
		.slice(0, 30)
		.map((record) => ({
			id: record.id,
			score: record.productive_capability_score,
			data_quality: record.data_quality,
			support: record.positive_structural_support
		}));

	console.log(`Wrote ${path.relative(repoRoot, paths.output)}`);
	console.log(`Records: ${records.length}`);
	console.log(
		`Positive structural support count: ${records.filter((record) => record.positive_structural_support).length}`
	);
	console.log('Top 30 productive capability scores:');
	console.log(JSON.stringify(top, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
