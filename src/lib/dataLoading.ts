import { dev } from '$app/environment';

function describeResponse(url: string, response: Response) {
	return `${response.status} ${response.statusText || 'HTTP error'} while fetching ${url}`;
}

function logOptionalDatasetMissing(url: string) {
	if (dev) {
		console.info(`[OurWorldSystem:data] Optional dataset not found: ${url}`);
	}
}

export async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(describeResponse(url, response));
	}

	try {
		return (await response.json()) as T;
	} catch (error) {
		throw new Error(
			`Invalid JSON in ${url}: ${error instanceof Error ? error.message : 'unknown parse error'}`
		);
	}
}

export async function fetchOptionalJson<T>(
	url: string,
	options: { available?: boolean } = {}
): Promise<T | null> {
	if (options.available === false) {
		logOptionalDatasetMissing(url);
		return null;
	}

	const response = await fetch(url);

	if (response.status === 404) {
		logOptionalDatasetMissing(url);
		return null;
	}

	if (!response.ok) {
		throw new Error(describeResponse(url, response));
	}

	try {
		return (await response.json()) as T;
	} catch (error) {
		throw new Error(
			`Invalid JSON in optional dataset ${url}: ${
				error instanceof Error ? error.message : 'unknown parse error'
			}`
		);
	}
}
