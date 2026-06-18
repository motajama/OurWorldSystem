export type MapUnitId = string;

export type MapUnitType = 'UN member' | 'territory' | 'disputed' | 'special' | 'no_data';

export type RecognitionStatus =
	| 'un_member'
	| 'non_un_member'
	| 'disputed'
	| 'territory'
	| 'special'
	| 'unknown';

export interface NaturalEarthAlias {
	adm0_a3: string[];
	iso_a3: string[];
	sov_a3: string[];
	name_aliases: string[];
}

export interface ExternalIds {
	iso3: string | null;
	iso2: string | null;
	un_m49: string | null;
	world_bank: string | null;
	oecd: string | null;
}

export interface MapUnitRegistryRecord {
	id: MapUnitId;
	display_name: string;
	short_name: string;
	map_unit_type: MapUnitType;
	recognition_status: RecognitionStatus;
	sovereignty_note: string | null;
	natural_earth: NaturalEarthAlias;
	external_ids: ExternalIds;
	data_notes: string[];
	last_reviewed: string;
}

export type WorldSystemClass =
	| 'core'
	| 'semi-periphery'
	| 'periphery'
	| 'uncertain'
	| 'no_data'
	| 'disputed';

export type MapLayerId =
	| 'world_system'
	| 'conflict'
	| 'press_freedom'
	| 'political_freedom'
	| 'quality_of_life'
	| 'exploitation'
	| 'ecology';

export type MapLayerKind = 'categorical' | 'sequential' | 'diverging' | 'boolean';

export interface MapLayerDefinition {
	id: MapLayerId;
	label: string;
	shortLabel: string;
	description: string;
	kind: MapLayerKind;
	noDataLabel: string;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface SourceRecord {
	id: string;
	name?: string;
	title?: string;
	purpose?: string;
	publisher: string;
	url: string | null;
	license?: string | null;
	terms?: string | null;
	retrieval_notes?: string;
	notes: string;
}

export interface WorldSystemAssessment {
	class: WorldSystemClass;
	score: number | null;
	confidence: Confidence;
	explanation: string;
}

export interface ConflictAssessment {
	war_on_territory: boolean | null;
	involved_in_conflict: boolean | null;
	active_conflicts: string[];
	fatalities_best_estimate: number | null;
	child_casualties_verified: number | null;
	latest_year?: number | null;
	source?: string | null;
	notes: string;
}

export interface IndicatorAssessment {
	source: string;
	score: number | null;
	category: string | null;
	year: number;
}

export interface SourcedIndicatorValue {
	value: number;
	year: number;
	indicator: string;
	source?: string;
}

export interface QualityOfLifeAssessment {
	hdi: number | null;
	ihdi: number | null;
	life_expectancy: number | SourcedIndicatorValue | null;
	education_index: number | null;
	gni_per_capita_ppp?: SourcedIndicatorValue | null;
	secondary_enrollment_gross?: SourcedIndicatorValue | null;
	population?: SourcedIndicatorValue | null;
	quality_of_life_score?: number | null;
	source?: string | null;
}

export interface EcologyAssessment {
	epi_score: number | null;
	material_footprint_per_capita: number | null;
	co2_per_capita: number | null;
	ewaste_generated_kg_per_capita: number | null;
}

export interface ExploitationPosition {
	extraction_risk?: string | number | null;
	resource_export_dependency: number | null;
	foreign_value_added_share: number | null;
	domestic_value_capture: number | null;
	ewaste_import_risk: string | number | null;
	notes: string | null;
}

export interface MapUnit {
	id: MapUnitId;
	name: string;
	map_unit_type: MapUnitType;
	sovereignty_note: string | null;
	world_system: WorldSystemAssessment;
	conflict: ConflictAssessment;
	press_freedom: IndicatorAssessment;
	political_freedom: IndicatorAssessment;
	quality_of_life: QualityOfLifeAssessment;
	ecology: EcologyAssessment;
	exploitation_position: ExploitationPosition;
	sources: string[];
	last_updated: string;
}

export type MapUnitRecord = MapUnit;

export interface GeoFeatureProperties {
	ADM0_A3?: string;
	ISO_A3?: string;
	NAME?: string;
	NAME_LONG?: string;
	SOV_A3?: string;
	TYPE?: string;
	ADMIN?: string;
	FCLASS_ISO?: string;
	FCLASS_US?: string;
	FCLASS_FR?: string;
	FCLASS_RU?: string;
	FCLASS_CN?: string;
	[key: string]: string | number | null | undefined;
}

export interface DataEnvelope {
	meta: {
		title: string;
		description: string;
		mock: boolean;
		version: string;
		generated_at: string;
	};
	map_units: MapUnit[];
}

export interface WorldBankQualityOfLifeRecord {
	id: MapUnitId;
	source_country_code: string;
	values: {
		life_expectancy?: SourcedIndicatorValue;
		gni_per_capita_ppp?: SourcedIndicatorValue;
		secondary_enrollment_gross?: SourcedIndicatorValue;
		population?: SourcedIndicatorValue;
	};
	quality_of_life_score: number | null;
	data_quality: 'partial' | 'good' | 'sparse';
	sources: string[];
}

export interface WorldBankQualityOfLifeDataset {
	dataset_id: 'quality_of_life_world_bank_latest';
	source_id: 'world_bank_wdi';
	retrieved_at: string;
	records: WorldBankQualityOfLifeRecord[];
	unmatched_source_countries: {
		source_country_code: string;
		source_country_name?: string | null;
	}[];
	latest_years?: Record<string, number | null>;
	notes: string[];
}

export interface UcdpConflictRecord {
	id: MapUnitId;
	territory: {
		has_organized_violence: boolean | null;
		latest_year: number;
		fatalities_best_estimate: number | null;
		fatalities_low: number | null;
		fatalities_high: number | null;
		event_count: number | null;
		source: 'ucdp_country_year';
	} | null;
	state_involvement: {
		involved_in_state_based_conflict: boolean | null;
		latest_year: number | null;
		conflict_count: number;
		conflicts: Array<{
			conflict_id: string;
			name: string;
			year: number;
			type: string;
			intensity_level: string;
			cumulative_intensity: string;
		}>;
		source: 'ucdp_prio_armed_conflict';
	};
	conflict_summary: ConflictAssessment;
	data_quality: 'partial' | 'good' | 'sparse';
	sources: string[];
}

export interface UcdpConflictDataset {
	dataset_id: 'conflict_ucdp_latest';
	source_ids: ['ucdp_country_year', 'ucdp_prio_armed_conflict'];
	retrieved_at: string;
	version: string;
	latest_year: number;
	records: UcdpConflictRecord[];
	unmatched_source_rows: Array<Record<string, string | number | null>>;
	notes: string[];
}
