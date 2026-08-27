/**
 * Pure form logic for the tenant-facing SumUp integration setup.
 *
 * Deliberately tenant-agnostic: nothing here knows about any specific
 * organisation, merchant code or secret name. The API key VALUE is never
 * handled in the frontend — only the NAME of the backend secret holding it.
 */

export type SumUpEnvironment = "test" | "live";

export const SUMUP_ENVIRONMENTS: SumUpEnvironment[] = ["test", "live"];

const MERCHANT_CODE_RE = /^[A-Z0-9]{4,20}$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{2,120}$/;
const LOOKS_LIKE_KEY_RE = /^sup_(sk|pk)/i;

export interface SumUpFormValues {
  merchantCode: string;
  secretName: string;
  environment: SumUpEnvironment;
}

export interface SumUpFormErrors {
  merchant?: string;
  secret?: string;
  environment?: string;
}

/** Per-environment saved pair, as returned by the `status` action. */
export interface SumUpEnvironmentEntry {
  merchant_code?: string;
  api_key_secret?: string;
}

export function isSumUpEnvironment(value: unknown): value is SumUpEnvironment {
  return value === "test" || value === "live";
}

export function normaliseEnvironment(value: unknown): SumUpEnvironment {
  // Absent/unknown means live — sandbox/test is explicit opt-in only.
  return value === "test" || value === "sandbox" ? "test" : "live";
}

export function validateSumUpForm(values: SumUpFormValues): SumUpFormErrors {
  const errors: SumUpFormErrors = {};
  const code = values.merchantCode.trim().toUpperCase();
  const secret = values.secretName.trim();

  if (!code) {
    errors.merchant = "Merchant Code is required.";
  } else if (!MERCHANT_CODE_RE.test(code)) {
    errors.merchant = "4–20 letters or digits, e.g. MBBMEYG7.";
  }

  if (!secret) {
    errors.secret = "Secret name is required.";
  } else if (LOOKS_LIKE_KEY_RE.test(secret)) {
    errors.secret = "That's the key itself — enter the secret's NAME instead.";
  } else if (!SECRET_NAME_RE.test(secret)) {
    errors.secret = "Uppercase letters, digits and underscores only, e.g. SUMUP_API_KEY_ACME_TEST.";
  }

  if (!isSumUpEnvironment(values.environment)) {
    errors.environment = "Choose Test or Live.";
  }

  return errors;
}

/**
 * Values to show when the user switches environment: the pair already saved for
 * that environment, or blanks so a test secret can never be silently reused as
 * a live one.
 */
export function valuesForEnvironment(
  environment: SumUpEnvironment,
  environments: Partial<Record<SumUpEnvironment, SumUpEnvironmentEntry>> | null | undefined,
): { merchantCode: string; secretName: string } {
  const entry = environments?.[environment];
  return {
    merchantCode: (entry?.merchant_code ?? "").toUpperCase(),
    secretName: entry?.api_key_secret ?? "",
  };
}

/** Warns when a secret name looks like it belongs to the other environment. */
export function environmentMismatchWarning(
  environment: SumUpEnvironment,
  secretName: string,
): string | null {
  const looksTest = /(^|_)(TEST|SANDBOX)(_|$)/i.test(secretName.trim());
  if (environment === "live" && looksTest) {
    return "This secret name looks like a test key. Live payments should use a separate live secret.";
  }
  if (environment === "test" && /(^|_)LIVE(_|$)/i.test(secretName.trim())) {
    return "This secret name looks like a live key. Use a separate test secret for sandbox payments.";
  }
  return null;
}
