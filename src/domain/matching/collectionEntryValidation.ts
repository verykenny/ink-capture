import {
  CONDITIONS,
  FINISHES,
  isCondition,
  isFinish,
} from '../models/attributes';
import type { NewCollectionEntry } from '../models/collectionEntry';

/**
 * The untrusted shape validation actually guards: JSON / SQLite rows / form
 * input. Derived from NewCollectionEntry to stay aligned, but widens
 * finish/condition to `string` so out-of-union values are representable (and
 * therefore testable) at the boundary.
 */
export type LooseNewCollectionEntry = Omit<
  NewCollectionEntry,
  'finish' | 'condition'
> & {
  finish: string;
  condition: string;
};

/** Stable issue codes for C2 field-mapping / i18n. */
export type CollectionEntryIssueCode =
  | 'cardId.empty'
  | 'quantity.notPositiveInteger'
  | 'finish.unknown'
  | 'condition.unknown';

export interface CollectionEntryIssue {
  readonly code: CollectionEntryIssueCode;
  readonly message: string;
}

/**
 * Collect ALL problems with an untrusted entry (empty = valid). Non-mutating
 * (no trimming) and `notes` is intentionally not validated (free-form,
 * optional). Issues accumulate in a stable order so callers can rely on it.
 *
 * Out of scope (lives at the B2/C2 seam): cardId *format* and the cross-field
 * invariant finish ∈ Card.availableFinishes (no Card↔Entry join here).
 */
export const validateNewCollectionEntry = (
  input: LooseNewCollectionEntry,
): CollectionEntryIssue[] => {
  const issues: CollectionEntryIssue[] = [];

  if (input.cardId.trim().length === 0) {
    issues.push({
      code: 'cardId.empty',
      message: 'cardId must be a non-empty identifier.',
    });
  }

  if (!(Number.isInteger(input.quantity) && input.quantity > 0)) {
    issues.push({
      code: 'quantity.notPositiveInteger',
      message: 'quantity must be a positive integer.',
    });
  }

  if (!isFinish(input.finish)) {
    issues.push({
      code: 'finish.unknown',
      message: `finish must be one of: ${FINISHES.join(', ')}.`,
    });
  }

  if (!isCondition(input.condition)) {
    issues.push({
      code: 'condition.unknown',
      message: `condition must be one of: ${CONDITIONS.join(', ')}.`,
    });
  }

  return issues;
};

/**
 * Throw if the entry is invalid (issues attached as `.issues`); otherwise narrow
 * the loose input to a strict NewCollectionEntry for B3's happy path.
 */
export function assertValidNewCollectionEntry(
  input: LooseNewCollectionEntry,
): asserts input is NewCollectionEntry {
  const issues = validateNewCollectionEntry(input);
  if (issues.length > 0) {
    throw Object.assign(
      new Error(
        `Invalid collection entry: ${issues
          .map(issue => issue.code)
          .join(', ')}.`,
      ),
      { issues },
    );
  }
}
