/**
 * REQ-024: predefined look-and-feel templates. A template is a stable id with
 * a display label; the upload API validates the id, stores it on the document
 * row, and the patient page maps it to theme colours. New templates are added
 * with one registerTemplate call here plus one entry in the frontend map
 * (frontend/src/app/templates.ts) — no schema or handler changes.
 */

export interface BrandingTemplate {
  id: string;
  label: string;
}

const TEMPLATES: Map<string, BrandingTemplate> = new Map();

export function registerTemplate(template: BrandingTemplate): void {
  if (TEMPLATES.has(template.id)) {
    throw new Error(`Branding template already registered: ${template.id}`);
  }
  TEMPLATES.set(template.id, template);
}

registerTemplate({ id: 'default', label: 'SecureLinks' });
registerTemplate({ id: 'restore-plc', label: 'Restore plc' });
registerTemplate({ id: 'york', label: 'York & Provide Community' });
registerTemplate({ id: 'nhs-radiology', label: 'NHS Radiology' });

export const DEFAULT_TEMPLATE_ID = 'default';

export function isRegisteredTemplate(id: string): boolean {
  return TEMPLATES.has(id);
}

export function listTemplateIds(): string[] {
  return [...TEMPLATES.keys()].sort();
}

/**
 * Resolve a requested template id to a registered template, falling back to
 * the default for blank or unknown ids (upload rejects unknown ids earlier;
 * this guard keeps stored/read paths safe).
 */
export function resolveTemplate(id: string | undefined): BrandingTemplate {
  const key = (id ?? '').trim();
  if (key.length === 0) return { id: DEFAULT_TEMPLATE_ID, label: 'SecureLinks' };
  return TEMPLATES.get(key) ?? { id: DEFAULT_TEMPLATE_ID, label: 'SecureLinks' };
}
