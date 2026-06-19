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
	source?:
		| 'derived_world_bank_quality_proxy'
		| 'derived_conservative_structural_proxy'
		| 'derived_productive_capability_proxy'
		| 'legacy_demo_seed'
		| 'legacy_demo_seed_reinterpreted'
		| 'curated_reviewed'
		| string;
	model_status?: 'provisional' | 'provisional_conservative_proxy' | string;
	explanation: string;
	structural_supports?: string[];
	positive_structural_supports?: string[];
	negative_or_filter_supports?: string[];
	classification_reason?: string;
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
	extraction_dependency_score?: number | null;
	extraction_autonomy_score?: number | null;
	extraction_values?: Partial<Record<ExtractionDependencyValueKey, SourcedIndicatorValue>>;
	extraction_latest_year?: number | null;
	extraction_data_quality?: 'good' | 'partial' | 'sparse' | null;
	extraction_source_country_code?: string | null;
	productive_capability_score?: number | null;
	productive_capability_values?: Partial<
		Record<ProductiveCapabilityValueKey, SourcedIndicatorValue>
	>;
	productive_capability_latest_year?: number | null;
	productive_capability_data_quality?: 'good' | 'partial' | 'sparse' | null;
	productive_capability_positive_structural_support?: boolean | null;
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
	recognition_status?: RecognitionStatus;
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
	NAME_SORT?: string;
	BRK_NAME?: string;
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

export type ExtractionDependencyValueKey =
	| 'natural_resource_rents_gdp_pct'
	| 'fuel_exports_merchandise_pct'
	| 'ores_metals_exports_merchandise_pct'
	| 'agricultural_raw_exports_merchandise_pct'
	| 'food_exports_merchandise_pct'
	| 'manufactures_exports_merchandise_pct'
	| 'high_tech_exports_manufactured_pct'
	| 'medium_high_tech_exports_manufactured_pct';

export interface WorldBankExtractionRecord {
	id: MapUnitId;
	source_country_code: string;
	latest_year: number;
	values: Partial<Record<ExtractionDependencyValueKey, SourcedIndicatorValue>>;
	extraction_dependency_score: number | null;
	extraction_autonomy_score: number | null;
	data_quality: 'good' | 'partial' | 'sparse';
	sources: string[];
}

export interface WorldBankExtractionDataset {
	dataset_id: 'extraction_dependency_world_bank_latest';
	source_id: 'world_bank_wdi_extraction';
	model_component: 'extraction_dependency';
	generated_at: string;
	records: WorldBankExtractionRecord[];
	unmatched_source_countries: {
		source_country_code: string;
		source_country_name?: string | null;
	}[];
	ignored_aggregate_regions?: {
		source_country_code: string;
		source_country_name?: string | null;
	}[];
	latest_years?: Record<string, number | null>;
	notes: string[];
}

export type ProductiveCapabilityValueKey =
	| 'manufactures_exports_merchandise_pct'
	| 'high_tech_exports_manufactured_pct'
	| 'medium_high_tech_exports_manufactured_pct';

export interface WorldBankProductiveCapabilityRecord {
	id: MapUnitId;
	latest_year: number | null;
	values: Partial<Record<ProductiveCapabilityValueKey, SourcedIndicatorValue>>;
	productive_capability_score: number | null;
	positive_structural_support: boolean;
	support_reasons: string[];
	data_quality: 'good' | 'partial' | 'sparse';
	limitations: string[];
	sources: string[];
}

export interface WorldBankProductiveCapabilityDataset {
	dataset_id: 'productive_capability_world_bank_latest';
	source_id: 'world_bank_wdi_extraction';
	model_component: 'productive_capability_proxy';
	status: 'provisional_proxy';
	generated_at: string;
	records: WorldBankProductiveCapabilityRecord[];
	notes: string[];
}

export interface ProvisionalWorldSystemRecord {
	id: MapUnitId;
	world_system: {
		class: WorldSystemClass;
		score: number | null;
		confidence: 'low' | 'medium' | 'high';
		source:
			| 'derived_world_bank_quality_proxy'
			| 'derived_conservative_structural_proxy'
			| 'derived_productive_capability_proxy'
			| 'legacy_demo_seed'
			| 'legacy_demo_seed_reinterpreted'
			| 'curated_reviewed';
		explanation: string;
		rationale?: string | null;
		reviewed_by?: string | null;
		reviewed_at?: string | null;
	};
	components: {
		quality_of_life_score: number | null;
		gni_per_capita_ppp: number | null;
		life_expectancy: number | null;
		secondary_enrollment_gross: number | null;
		extraction_dependency_score?: number | null;
		extraction_autonomy_score?: number | null;
		value_capture_score?: number | null;
		productive_complexity_score?: number | null;
		productive_capability_score?: number | null;
		productive_capability_data_quality?: 'good' | 'partial' | 'sparse' | null;
		geopolitical_financial_power_score?: number | null;
		structural_supports?: string[];
		positive_structural_supports?: string[];
		negative_or_filter_supports?: string[];
		previous_proxy_class?: WorldSystemClass;
		downgraded_from_previous_proxy_core?: boolean;
		classification_reason?: string;
	};
	review_status: 'needs_review' | string;
	classification_status?: 'provisional_model' | 'demo_only' | 'curated_reviewed' | string;
}

export interface ProvisionalWorldSystemDataset {
	dataset_id: 'world_system_provisional_latest';
	source_ids: string[];
	model_status: 'provisional' | 'provisional_conservative_proxy' | string;
	generated_at: string;
	methodology_note: string;
	records: ProvisionalWorldSystemRecord[];
	diagnostics?: {
		total_records: number;
		previous_proxy_core_count: number;
		class_distribution: Partial<Record<WorldSystemClass, number>>;
		downgraded_from_previous_proxy_core_count: number;
		core_candidates: Array<Record<string, unknown>>;
		downgraded_high_quality: Array<Record<string, unknown>>;
	};
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
