import type { Card } from '../models/card';

/** Confidence in [0,1]; higher = stronger match. */
export type Confidence = number;

/** A single ranked guess at the scanned card. */
export interface RecognitionCandidate {
  card: Card;
  confidence: Confidence;
}

/** Raw signals a recognizer read before matching; optional + backend-specific. */
export interface RecognitionSource {
  collectorNumber?: string;
  name?: string;
}

/** Output of a recognition attempt — produced by both the C1 matcher and the D1 recognizer. */
export interface RecognitionResult {
  candidates: RecognitionCandidate[]; // best-first; empty when no match
  source?: RecognitionSource;
}
