import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';

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
  imports: [
    FormsModule,
    FlexLayoutModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="sl-page" fxLayout="row" fxLayoutAlign="center start">
      <div fxFlex="100" fxFlex.gt-sm="80" fxLayout="column" fxLayoutGap="1rem">
        <mat-card>
          <mat-card-header>
            <div mat-card-avatar class="avatar" aria-hidden="true">
              <mat-icon>monitor_heart</mat-icon>
            </div>
            <mat-card-title>Delivery queue and integration health</mat-card-title>
            <mat-card-subtitle>
              SMS dispatch is owned upstream by Prism/Firetext; this view mirrors Prism-reported
              state from audit records.
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <form (ngSubmit)="lookup()" fxLayout="row wrap" fxLayoutGap="0.75rem">
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Document reference or ID</mat-label>
                <input matInput name="documentId" [(ngModel)]="documentId" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Customer ID</mat-label>
                <input matInput name="customerId" [(ngModel)]="customerId" required />
              </mat-form-field>
              <div fxFlex="100" fxLayout="row" fxLayoutAlign="start center">
                <button mat-flat-button color="primary" type="submit">
                  <mat-icon aria-hidden="true">search</mat-icon> Look up
                </button>
              </div>
            </form>

            @if (error()) {
              <p class="sl-alert" role="alert">{{ error() }}</p>
            }
            @if (loading()) {
              <p role="status">Looking up…</p>
              <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
            }
          </mat-card-content>
        </mat-card>

        @if (result(); as r) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <div mat-card-avatar class="avatar ok" aria-hidden="true">
                <mat-icon>description</mat-icon>
              </div>
              <mat-card-title>{{ r.documentReference }}</mat-card-title>
              <mat-card-subtitle aria-live="polite">{{ r.note }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content fxLayout="column" fxLayoutGap="0.75rem">
              <div fxLayout="row wrap" fxLayoutGap="0.5rem" class="chips">
                <span class="chip" [class.chip-ok]="r.viewedStatus" [class.chip-bad]="!r.viewedStatus">
                  {{ r.viewedStatus ? 'Viewed' : 'Not viewed' }}
                </span>
                <span class="chip">Failures since last success: {{ r.failedCount }}</span>
                <span class="chip">Total failures: {{ r.lifetimeFailures }}</span>
                <span class="chip" [class.chip-bad]="r.locked" [class.chip-ok]="!r.locked">
                  {{ r.locked ? 'Locked' + (r.lockedUntil ? ' until ' + r.lockedUntil : '') : 'Not locked' }}
                </span>
              </div>

              <h3 class="section-title">Recent audit trail</h3>
              <mat-action-list>
                @for (entry of r.recentAudit; track entry.timestamp) {
                  <mat-list-item>
                    <mat-icon matListItemIcon aria-hidden="true">history</mat-icon>
                    <div matListItemTitle>{{ entry.type }}</div>
                    <div matListItemLine>{{ entry.timestamp }} — {{ entry.actor }}</div>
                    @if (entry.detail) {
                      <div matListItemLine>{{ entry.detail }}</div>
                    }
                  </mat-list-item>
                }
              </mat-action-list>
            </mat-card-content>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #eaf1fa;
        border-radius: 50%;
        color: #005eb8;
      }
      .avatar.ok {
        background: #eef7f1;
        color: #00703c;
      }
      .chips {
        margin-top: 0.25rem;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid #c8d2dd;
        border-radius: 999px;
        padding: 0.2rem 0.7rem;
        font-size: 0.8125rem;
        font-weight: 600;
        background: #fff;
        color: #33505f;
      }
      .chip-ok {
        border-color: #00703c;
        color: #00703c;
        background: #eef7f1;
      }
      .chip-bad {
        border-color: #b00020;
        color: #b00020;
        background: #fdecec;
      }
      .section-title {
        margin: 0.25rem 0 0;
        font-size: 1rem;
        color: #33505f;
      }
    `,
  ],
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
