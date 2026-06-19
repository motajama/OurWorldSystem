import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	qualityOfLife: path.join(
		repoRoot,
		'static/data/indicators/quality-of-life.world-bank.latest.json'
	),
	worldSystemDemo: path.join(repoRoot, 'static/data/world-system.latest.json'),
	output: path.join(repoRoot, 'static/data/indicators/world-system.provisional.latest.json')
};

const validClasses = new Set([
	'core',
	'semi-periphery',
	'periphery',
	'uncertain',
	'disputed',
	'no_data'
]);

const notes = [
	'This is a provisional proxy model and not a final world-systems classification.',
	'It currently uses World Bank quality-of-life and income-related indicators only.',
	'Future versions should include value-chain position, ecological externalization, trade structure, extraction, financial centrality, and conflict/political indicators.'
];

const methodologyNote =
	'Experimental provisional world-system proxy. Existing demo world-system records are preserved as demo_curated. Other records are derived from World Bank WDI quality-of-life scores with a small normalized log-income adjustment. Thresholds are provisional: core >= 78, semi-periphery >= 55 and < 78, periphery < 55. This is not a final Wallersteinian or dependency-theory classification.';

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

function normalizeScoreToHundred(value) {
	if (!isFiniteNumber(value)) return null;
	return round(clamp(value <= 1 ? value * 100 : value, 0, 100), 2);
}

function normalizedLogIncome(income) {
	if (!isFiniteNumber(income) || income <= 0) return null;
	return clamp((Math.log(income) - Math.log(1000)) / (Math.log(75000) - Math.log(1000)), 0, 1);
}

function normalizeWorldSystemDemoData(input) {
	const records = Array.isArray(input?.map_units) ? input.map_units : [];
	return new Map(
		records
			.filter((record) => record && typeof record === 'object' && typeof record.id === 'string')
			.map((record) => [record.id, record])
	);
}

function classFromScore(score) {
	// Provisional bins for map coverage only. These are not final academic thresholds.
	if (!isFiniteNumber(score)) return 'no_data';
	if (score >= 78) return 'core';
	if (score >= 55) return 'semi-periphery';
	return 'periphery';
}

function classDistance(a, b) {
	const order = ['periphery', 'semi-periphery', 'core'];
	const aIndex = order.indexOf(a);
	const bIndex = order.indexOf(b);

	if (aIndex === -1 || bIndex === -1) return 0;
	return Math.abs(aIndex - bIndex);
}

function componentsFromQualityRecord(record) {
	return {
		quality_of_life_score: isFiniteNumber(record?.quality_of_life_score)
			? round(record.quality_of_life_score, 4)
			: null,
		gni_per_capita_ppp: isFiniteNumber(record?.values?.gni_per_capita_ppp?.value)
			? round(record.values.gni_per_capita_ppp.value, 2)
			: null,
		life_expectancy: isFiniteNumber(record?.values?.life_expectancy?.value)
			? round(record.values.life_expectancy.value, 3)
			: null,
		secondary_enrollment_gross: isFiniteNumber(record?.values?.secondary_enrollment_gross?.value)
			? round(record.values.secondary_enrollment_gross.value, 3)
			: null
	};
}

function emptyComponents() {
	return {
		quality_of_life_score: null,
		gni_per_capita_ppp: null,
		life_expectancy: null,
		secondary_enrollment_gross: null
	};
}

function demoRecordFor(registryRecord, demoUnit, qualityRecord) {
	const demoWorldSystem = demoUnit.world_system ?? {};
	const classValue = validClasses.has(demoWorldSystem.class) ? demoWorldSystem.class : 'uncertain';
	const score = normalizeScoreToHundred(demoWorldSystem.score);

	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score,
			confidence: demoWorldSystem.confidence === 'low' ? 'low' : 'medium',
			source: 'demo_curated',
			explanation: `${demoWorldSystem.explanation ?? 'Demo curated world-system class.'} This record is preserved from static/data/world-system.latest.json demo data and needs methodological review.`
		},
		components: qualityRecord ? componentsFromQualityRecord(qualityRecord) : emptyComponents(),
		review_status: 'needs_review'
	};
}

function noDataRecord(registryRecord, qualityRecord, classValue = 'no_data', explanation = null) {
	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score: null,
			confidence: 'low',
			source: 'derived_world_bank_quality_proxy',
			explanation:
				explanation ??
				'No sufficient World Bank quality-of-life or income data is available for this provisional proxy.'
		},
		components: qualityRecord ? componentsFromQualityRecord(qualityRecord) : emptyComponents(),
		review_status: 'needs_review'
	};
}

function derivedRecordFor(registryRecord, qualityRecord) {
	if (!qualityRecord) {
		if (registryRecord.map_unit_type === 'disputed') {
			return noDataRecord(
				registryRecord,
				null,
				'disputed',
				'Disputed map unit without stable comparable World Bank data in the current proxy model.'
			);
		}

		return noDataRecord(registryRecord, null);
	}

	const qualityScore = isFiniteNumber(qualityRecord.quality_of_life_score)
		? clamp(qualityRecord.quality_of_life_score, 0, 1)
		: null;
	const income = qualityRecord.values?.gni_per_capita_ppp?.value;
	const incomeSignal = normalizedLogIncome(income);

	if (qualityScore === null && incomeSignal === null) {
		if (registryRecord.map_unit_type === 'disputed') {
			return noDataRecord(
				registryRecord,
				qualityRecord,
				'disputed',
				'Disputed map unit without stable comparable World Bank quality-of-life or income data in the current proxy model.'
			);
		}

		return noDataRecord(registryRecord, qualityRecord);
	}

	let score;
	let explanation;

	if (qualityScore !== null && incomeSignal !== null) {
		score = round((qualityScore * 0.85 + incomeSignal * 0.15) * 100, 2);
		explanation =
			'Derived provisional class from World Bank WDI quality-of-life score with a small normalized log-income adjustment. Needs review against trade, value-chain, extraction, ecological, financial, geopolitical, and conflict indicators.';
	} else if (qualityScore !== null) {
		score = round(qualityScore * 100, 2);
		explanation =
			'Derived provisional class from World Bank WDI quality-of-life score only because income data is missing. Needs review.';
	} else {
		score = round(incomeSignal * 100, 2);
		explanation =
			'Derived provisional class from World Bank WDI income data only because quality-of-life score is missing. Treat as especially limited and needs review.';
	}

	const qualityClass = qualityScore === null ? null : classFromScore(qualityScore * 100);
	const incomeClass = incomeSignal === null ? null : classFromScore(incomeSignal * 100);
	const derivedClass =
		qualityClass && incomeClass && classDistance(qualityClass, incomeClass) >= 2
			? 'uncertain'
			: classFromScore(score);

	return {
		id: registryRecord.id,
		world_system: {
			class: derivedClass,
			score,
			confidence:
				qualityScore !== null && incomeSignal !== null && derivedClass !== 'uncertain'
					? 'medium'
					: 'low',
			source: 'derived_world_bank_quality_proxy',
			explanation:
				derivedClass === 'uncertain'
					? `${explanation} Quality-of-life and income signals fall in contradictory provisional bins, so the class is uncertain.`
					: explanation
		},
		components: componentsFromQualityRecord(qualityRecord),
		review_status: 'needs_review'
	};
}

async function main() {
	const [registry, qualityOfLife, worldSystemDemo] = await Promise.all([
		readJson(paths.registry),
		readJson(paths.qualityOfLife),
		readJson(paths.worldSystemDemo)
	]);
	const demoById = normalizeWorldSystemDemoData(worldSystemDemo);
	const qualityById = new Map((qualityOfLife.records ?? []).map((record) => [record.id, record]));

	const records = registry.map((registryRecord) => {
		const demoUnit = demoById.get(registryRecord.id);
		const qualityRecord = qualityById.get(registryRecord.id);

		return demoUnit
			? demoRecordFor(registryRecord, demoUnit, qualityRecord)
			: derivedRecordFor(registryRecord, qualityRecord);
	});

	const output = {
		dataset_id: 'world_system_provisional_latest',
		source_ids: ['world_bank_wdi', 'mock_demo_data'],
		model_status: 'provisional',
		generated_at: new Date().toISOString(),
		methodology_note: methodologyNote,
		records,
		notes
	};

	await mkdir(path.dirname(paths.output), { recursive: true });
	await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);

	const distribution = records.reduce((counts, record) => {
		const classValue = record.world_system.class;
		counts[classValue] = (counts[classValue] ?? 0) + 1;
		return counts;
	}, {});

	console.log(`Wrote ${path.relative(repoRoot, paths.output)}`);
	console.log(`Records: ${records.length}`);
	console.log(`Class distribution: ${JSON.stringify(distribution, null, 2)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
