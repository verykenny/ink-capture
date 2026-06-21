/**
 * Off-catalog ("manual") card support — the creation input and its validation.
 *
 * There is deliberately NO `CustomCard` model: a manually-added card maps
 * straight to the existing `Card` (see SqliteCustomCardRepository), with its
 * provenance carried implicitly by a `manual:<rowid>` id prefix. This module is
 * only the untrusted *input* the manual-add form produces — `name` is the single
 * required field — plus the validation that guards it, mirroring
 * collectionEntryValidation so the form layer treats both alike.
 *
 * @format
 */

import type { Finish } from './attributes';

/**
 * Untrusted creation input for an off-catalog card. Only `name` is required;
 * when the optional fields are absent the persisted row maps to a `Card` with
 * empty setCode/collectorNumber/rarity. `availableFinishes` defaults to the full
 * closed set at the persistence layer.
 */
export interface CustomCardInput {
  name: string;
  version?: string;
  setCode?: string;
  collectorNumber?: string;
  rarity?: string;
  availableFinishes?: readonly Finish[];
  imageUrl?: string;
}

/** Stable issue code for the manual-add form / i18n. */
export type CustomCardIssueCode = 'name.empty';

export interface CustomCardIssue {
  readonly code: CustomCardIssueCode;
  readonly message: string;
}

/**
 * Collect ALL problems with an untrusted custom-card input (empty = valid).
 * Only `name` is validated (non-empty after trim); non-mutating (no trimming of
 * the input itself). Optional fields are free-form and never validated here.
 */
export const validateCustomCard = (
  input: CustomCardInput,
): CustomCardIssue[] => {
  const issues: CustomCardIssue[] = [];

  if (input.name.trim().length === 0) {
    issues.push({
      code: 'name.empty',
      message: 'name must be a non-empty card name.',
    });
  }

  return issues;
};

/**
 * Throw if the input is invalid (issues attached as `.issues`); otherwise a
 * no-op — the repository's happy-path gate before minting a `manual:<rowid>`.
 */
export function assertValidCustomCard(input: CustomCardInput): void {
  const issues = validateCustomCard(input);
  if (issues.length > 0) {
    throw Object.assign(
      new Error(
        `Invalid custom card: ${issues.map(issue => issue.code).join(', ')}.`,
      ),
      { issues },
    );
  }
}
