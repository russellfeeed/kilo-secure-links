import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface HealthResult {
  documentReference: string;
  viewedStatus: boolean;
  failedCount: number;
  lifetimeFailures: number;
  locked: boolean;
  lockedUntil?: string;
  recentAudit: Array<{ type: string; timestamp: string; actor: string; detail?: string }>;
  note: string;
}

@Component({
  selector: 'sl-support-health',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>Delivery queue and integration health</h1>
    <p>SMS dispatch is owned upstream by Prism/Firetext; this view mirrors Prism-reported state from audit records.</p>
    <form (ngSubmit)="lookup()">
      <label>Document reference or ID <input name="documentId" [(ngModel)]="documentId" required /></label>
      <label>Customer ID <input name="customerId" [(ngModel)]="customerId" required /></label>
      <button type="submit">Look up</button>
    </form>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Looking up…</p>
    }
    @if (result()) {
      <section aria-live="polite">
        <h2>{{ result()?.documentReference }}</h2>
        <p>
          Viewed: {{ result()?.viewedStatus ? 'yes' : 'no' }} —
          failures since last success: {{ result()?.failedCount }} —
          total failures: {{ result()?.lifetimeFailures }} —
          locked: {{ result()?.locked ? 'yes' : 'no' }}
        </p>
        <ul>
          @for (entry of result()?.recentAudit ?? []; track entry.timestamp) {
            <li>{{ entry.timestamp }} — {{ entry.type }} — {{ entry.actor }}</li>
          }
        </ul>
        <p>{{ result()?.note }}</p>
      </section>
    }
  `,
  styles: [`
    :host { display: block; max-width: 36rem; margin: 0 auto; padding: 1rem; }
    .error { color: #b00020; font-weight: 600; }
  `],
})
export class SupportHealthComponent {
  documentId = '';
  customerId = '';
  result = signal<HealthResult | null>(null);
  error = signal('');
  loading = signal(false);

  async lookup(): Promise<void> {
    const value = this.documentId.trim();
    const customerId = this.customerId.trim();
    if (!value || !customerId) {
      this.error.set('Enter both Document reference (or ID) and Customer ID.');
      this.result.set(null);
      return;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const params = new URLSearchParams({ customerId });
    if (isUuid) {
      params.set('documentId', value);
    } else {
      params.set('reference', value);
    }
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      const res = await fetch(`/dev/support-health?${params.toString()}`, { headers: { accept: 'application/json' } });
      const data = (await res.json()) as HealthResult & { message?: string };
      if (res.ok) {
        this.result.set(data);
      } else {
        this.error.set(String(data.message ?? `Lookup failed (HTTP ${res.status}).`));
      }
    } catch {
      this.error.set('Could not reach the support health API. Try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
