import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const indexRelativePath = 'static/data/indicators/index.json';

async function readOptionalIndicatorIndex(indexPath) {
	try {
		const text = await readFile(indexPath, 'utf8');
		const index = JSON.parse(text);

		if (!Array.isArray(index.optional_datasets)) {
			return { optional_datasets: [] };
		}

		return {
			optional_datasets: index.optional_datasets.filter(
				(fileName) => typeof fileName === 'string' && fileName.trim().length > 0
			)
		};
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return { optional_datasets: [] };
		}

		throw error;
	}
}

export async function markOptionalIndicatorDatasetAvailable(repoRoot, fileName) {
	const indexPath = path.join(repoRoot, indexRelativePath);
	const index = await readOptionalIndicatorIndex(indexPath);
	const optionalDatasets = new Set(index.optional_datasets);

	optionalDatasets.add(fileName);

	await mkdir(path.dirname(indexPath), { recursive: true });
	await writeFile(
		indexPath,
		`${JSON.stringify({ optional_datasets: [...optionalDatasets].sort() }, null, '\t')}\n`
	);
}
