import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface HealthResult {
  documentReference: string;
  viewedStatus: boolean;
  failedCount: number;
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
      <label>Document ID <input name="documentId" [(ngModel)]="documentId" required /></label>
      <label>Customer ID <input name="customerId" [(ngModel)]="customerId" required /></label>
      <button type="submit">Look up</button>
    </form>
    @if (result()) {
      <section aria-live="polite">
        <h2>{{ result()?.documentReference }}</h2>
        <p>Viewed: {{ result()?.viewedStatus ? 'yes' : 'no' }} — failures: {{ result()?.failedCount }} — locked: {{ result()?.locked ? 'yes' : 'no' }}</p>
        <ul>
          @for (entry of result()?.recentAudit ?? []; track entry.timestamp) {
            <li>{{ entry.timestamp }} — {{ entry.type }} — {{ entry.actor }}</li>
          }
        </ul>
        <p>{{ result()?.note }}</p>
      </section>
    }
  `,
})
export class SupportHealthComponent {
  documentId = '';
  customerId = '';
  result = signal<HealthResult | null>(null);

  async lookup(): Promise<void> {
    const params = new URLSearchParams({ documentId: this.documentId, customerId: this.customerId });
    const res = await fetch(`/support/health?${params.toString()}`, { headers: { accept: 'application/json' } });
    if (res.ok) {
      this.result.set((await res.json()) as HealthResult);
    } else {
      this.result.set(null);
    }
  }
}
