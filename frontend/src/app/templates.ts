/**
 * REQ-024: frontend branding registry. Mirrors the backend registry
 * (backend/src/templates.ts) — every id there can appear in the
 * /document-template response; unknown ids fall back to `default`.
 * Each template overrides Material CSS custom properties on the page wrapper.
 */
export interface BrandingTheme {
  id: string;
  label: string;
  /** Primary/accent hex values applied via --sl-brand-* CSS custom properties. */
  primary: string;
  accent: string;
  /** Inverted text colour for elements filled with the primary colour. */
  onPrimary: string;
}

export const TEMPLATES: Record<string, BrandingTheme> = {
  default: { id: 'default', label: 'SecureLinks', primary: '#005eb8', accent: '#00703c', onPrimary: '#ffffff' },
  'restore-plc': { id: 'restore-plc', label: 'Restore plc', primary: '#6a1b9a', accent: '#00838f', onPrimary: '#ffffff' },
  york: { id: 'york', label: 'York & Provide Community', primary: '#0b7285', accent: '#e8590c', onPrimary: '#ffffff' },
  'nhs-radiology': { id: 'nhs-radiology', label: 'NHS Radiology', primary: '#003087', accent: '#00703c', onPrimary: '#ffffff' },
};

export const TEMPLATE_IDS: string[] = Object.keys(TEMPLATES).sort();

export function resolveBranding(id: string | undefined | null): BrandingTheme {
  return TEMPLATES[(id ?? '').trim()] ?? TEMPLATES['default'];
}
