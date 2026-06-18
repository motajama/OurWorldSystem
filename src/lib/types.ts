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
	notes: string;
}

export interface IndicatorAssessment {
	source: string;
	score: number | null;
	category: string | null;
	year: number;
}

export interface QualityOfLifeAssessment {
	hdi: number | null;
	ihdi: number | null;
	life_expectancy: number | null;
	education_index: number | null;
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
