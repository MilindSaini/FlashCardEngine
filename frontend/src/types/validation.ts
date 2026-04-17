const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_EMAIL_LENGTH = 320;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_DECK_TITLE_LENGTH = 255;
export const MAX_SEARCH_QUERY_LENGTH = 160;
export const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeDeckTitle(value: string) {
  return normalizeWhitespace(value).slice(0, MAX_DECK_TITLE_LENGTH);
}

export function normalizeSearchQuery(value: string) {
  return value.replace(/\s+/g, " ").trimStart().slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export function isValidUuid(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  return UUID_PATTERN.test(value.trim());
}

export function validateEmail(value: string) {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return "Email is required.";
  }
  if (normalized.length > MAX_EMAIL_LENGTH) {
    return "Email is too long.";
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    return "Please enter a valid email address.";
  }
  return null;
}

export function validatePassword(value: string, mode: "login" | "signup") {
  if (!value || !value.trim()) {
    return "Password is required.";
  }

  if (mode === "signup") {
    if (value.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (value.length > MAX_PASSWORD_LENGTH) {
      return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
    }
  }

  return null;
}

export function validateDeckTitle(value: string) {
  const normalized = normalizeDeckTitle(value);
  if (!normalized) {
    return "Deck title cannot be empty.";
  }
  if (normalized.length > MAX_DECK_TITLE_LENGTH) {
    return `Deck title cannot exceed ${MAX_DECK_TITLE_LENGTH} characters.`;
  }
  return null;
}

export function validateSearchQuery(value: string) {
  const normalized = normalizeSearchQuery(value).trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length < 2) {
    return "Type at least 2 characters to search.";
  }
  if (normalized.length > MAX_SEARCH_QUERY_LENGTH) {
    return `Search query must be at most ${MAX_SEARCH_QUERY_LENGTH} characters.`;
  }
  return null;
}

export function validatePdfFile(file: File) {
  if (!file) {
    return "Please choose a PDF file.";
  }

  const isPdfMime = file.type === "application/pdf";
  const isPdfName = file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfMime && !isPdfName) {
    return "Only PDF files are allowed.";
  }

  if (file.size <= 0) {
    return "Selected file appears to be empty.";
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return "PDF is too large. Maximum size is 20 MB.";
  }

  return null;
}

export function validateReviewGrade(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return "Grade must be between 1 and 5.";
  }
  return null;
}

export function validateNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    return `${label} must be a non-negative integer.`;
  }
  return null;
}
