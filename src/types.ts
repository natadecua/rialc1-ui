export interface TreeFeature {
  tree_id: number;
  predicted_species: string;
  ground_truth: string;
  status: 'Correct' | 'Incorrect' | 'Training';
}

export interface TreeGeoJSON {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: TreeFeature;
  }[];
}

export interface FilterState {
  correct: boolean;
  incorrect: boolean;
  training: boolean;
}

export interface PointCloudMetadata {
  version: string;
  name: string;
  description: string;
  points: number;
  boundingBox: {
    lx: number;
    ly: number;
    lz: number;
    ux: number;
    uy: number;
    uz: number;
  };
  pointAttributes: string[];
  spacing: number;
  scale: number[];
}