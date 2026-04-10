export type ProductType = 'Flower' | 'Trim' | 'Popcorn';

export function isBaggedType(type: ProductType): boolean {
  return type === 'Trim' || type === 'Popcorn';
}

export interface StrainConfig {
  id: string;
  strain: string;
  type: ProductType;
  totalUnits: number;
  claimedLbs: number | null;    // for Flower (lbs)
  claimedGrams: number | null;  // for Trim/Popcorn (grams)
  partialCount: number;
  partialSizeGrams: number;
}

export interface WeightReading {
  id: string;
  unitNumber: number;
  weightGrams: number;
  timestamp: Date;
  strain: string;
  isPartial: boolean;
  partialSizeGrams?: number;
}

export interface StrainSession {
  config: StrainConfig;
  readings: WeightReading[];
  completed: boolean;
}

export interface StrainSummary {
  strain: string;
  type: ProductType;
  units: number;
  fullUnits: number;
  partials: number;
  totalGrams: number;
  totalLbs: number;
  claimedLbs: number | null;
  claimedGrams: number | null;
  differenceGrams: number | null;
  status: 'VERIFIED' | 'VARIANCE' | null;
}

export type AppPhase = 'connect' | 'modeSelect' | 'setup' | 'weighing' | 'summary' | 'scannerGuide' | 'wetSetup' | 'wetWeighing' | 'wetSummary';

export type WorkflowMode = 'dry' | 'wet';

export interface ScaleReading {
  weight: number;
  unit: string;
  stable: boolean;
  mode: 'G' | 'N' | 'T';
}

export interface HarvestStrainConfig {
  id: string;
  strain: string;
  plantCount: number;
}

export interface HarvestBatchConfig {
  id: string;
  batchName: string;
  strains: HarvestStrainConfig[];
  date: Date;
}

export interface WetWeightReading {
  id: string;
  tagId: string;
  strain: string;
  weightGrams: number;
  timestamp: Date;
  plantNumber: number;
}

export interface HarvestSession {
  config: HarvestBatchConfig;
  readings: WetWeightReading[];
  completed: boolean;
}

export interface HarvestSummary {
  strain: string;
  plantCount: number;
  plantsWeighed: number;
  totalGrams: number;
  totalLbs: number;
  avgPerPlant: number;
}

export const GRAMS_PER_LB = 453.592;
export const VERIFICATION_TOLERANCE_GRAMS = 5;
