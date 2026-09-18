import { type StepperSelectionEvent } from '@angular/cdk/stepper';
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
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { TEMPLATE_IDS } from './templates';

interface UploadResult {
  documentId: string;
  accessUrl: string;
  expiryDate: string;
}

interface StatusResult {
  documentReference: string;
  viewedStatus: boolean;
  failedCount: number;
  lifetimeFailures: number;
  locked: boolean;
  lockedUntil?: string;
  recentAudit: Array<{ type: string; timestamp: string; actor: string; detail?: string }>;
}

interface VerifyResult {
  documentId: string;
  documentReference: string;
  downloadUrl: string;
  expiresInSeconds: number;
}

interface UsageResult {
  documentsUploaded: number;
  documentsViewed: number;
  storageBytes: number;
  fallbackNotified: number;
  firstUploadAt?: string;
  lastUploadAt?: string;
  truncated: boolean;
}

interface ReportEvent {
  documentId: string;
  eventId: string;
  timestamp: string;
  type: string;
  actor: string;
  documentReference?: string;
  detail?: string;
}

interface EventsResult {
  events: ReportEvent[];
  nextToken?: string;
}

const SAMPLE_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPD' +
  'wgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1Bh' +
  'Z2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTAwXSAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCj' +
  'QgMCBvYmoKPDwgL0xlbmd0aCA0NiA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDE4MCBUZCAoU2FtcGxlIGRvY3Vt' +
  'ZW50KSBUaiBFVAp9IHN0cmVhbQplbmRvYmoKdHJhaWxlcgo8PCAvUm9vdCAxIDAgUiA+PgolJUVPRgo=';

@Component({
  selector: 'sl-dev-playground',
  standalone: true,
  imports: [
    FormsModule,
    FlexLayoutModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatStepperModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <div class="sl-page" fxLayout="row" fxLayoutAlign="center start">
      <div fxFlex="100" fxFlex.gt-sm="90" fxLayout="column" fxLayoutGap="1rem">
        <mat-card>
          <mat-card-header>
            <div mat-card-avatar class="avatar" aria-hidden="true">
              <mat-icon>science</mat-icon>
            </div>
            <mat-card-title>Developer playground</mat-card-title>
            <mat-card-subtitle>
              Walks the full SecureLinks lifecycle against the live dev backend. Nothing here sends
              SMS.
            </mat-card-subtitle>
          </mat-card-header>
        </mat-card>

        <mat-stepper
          [selectedIndex]="step() - 1"
          (selectionChange)="onStepChange($event)"
          [linear]="false"
          orientation="horizontal"
          aria-label="Playground steps"
        >
          <mat-step [completed]="!!uploadResult()" label="Upload">
            <h2>Step 1 — Upload a document</h2>
            @if (step1Error()) {
              <p class="sl-alert" role="alert">{{ step1Error() }}</p>
            }
            @if (busy1()) {
              <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
            }
            <form (ngSubmit)="uploadSample()" novalidate fxLayout="row wrap" fxLayoutGap="0.75rem">
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Customer ID</mat-label>
                <input matInput name="pCustomerId" [(ngModel)]="customerId" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Recipient ID</mat-label>
                <input matInput name="pRecipientId" [(ngModel)]="recipientId" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Verification DOB</mat-label>
                <input matInput name="pDob" [(ngModel)]="dob" placeholder="1990-01-31" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Expiry date</mat-label>
                <input
                  matInput
                  name="pExpiry"
                  type="date"
                  [(ngModel)]="expiryDate"
                  required
                  [min]="today"
                />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Document reference</mat-label>
                <input matInput name="pRef" [(ngModel)]="reference" placeholder="PLAY-001" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Filename</mat-label>
                <input matInput name="pName" [(ngModel)]="filename" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Branding template</mat-label>
                <mat-select name="pTemplate" [(ngModel)]="template">
                  @for (id of templateIds; track id) {
                    <mat-option [value]="id">{{ id }}</mat-option>
                  }
                </mat-select>
                <mat-hint>Styles the patient page (REQ-024).</mat-hint>
              </mat-form-field>
              <div fxFlex="100">
                <button mat-flat-button color="primary" type="submit" [disabled]="busy1()">
                  <mat-icon aria-hidden="true">cloud_upload</mat-icon>
                  {{ busy1() ? 'Uploading…' : 'Upload sample PDF' }}
                </button>
              </div>
            </form>
            @if (uploadResult(); as r) {
              <p class="ok" role="status">
                Uploaded — document <code>{{ r.documentId }}</code>, reference
                <code>{{ reference }}</code>
              </p>
              <button mat-stroked-button color="primary" type="button" (click)="step.set(2)">
                Next: check status
                <mat-icon aria-hidden="true">arrow_forward</mat-icon>
              </button>
            }
          </mat-step>

          <mat-step [completed]="!!statusResult()" label="Check status">
            <h2>Step 2 — Check document status</h2>
            <p class="sl-hint">
              Look up by the reference and Customer ID from step 1 (same data the support page uses).
            </p>
            <button
              mat-stroked-button
              color="primary"
              type="button"
              (click)="checkStatus()"
              [disabled]="busy2() || !uploadResult()"
            >
              <mat-icon aria-hidden="true">refresh</mat-icon>
              {{ busy2() ? 'Checking…' : 'Refresh status' }}
            </button>
            @if (busy2()) {
              <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
            }
            @if (step2Error()) {
              <p class="sl-alert" role="alert">{{ step2Error() }}</p>
            }
            @if (statusResult(); as s) {
              <mat-card appearance="outlined" class="inner">
                <mat-card-content>
                  <div fxLayout="row wrap" fxLayoutGap="0.5rem" class="chips">
                    <span class="chip" [class.chip-ok]="s.viewedStatus" [class.chip-bad]="!s.viewedStatus">
                      {{ s.viewedStatus ? 'Viewed' : 'Not viewed' }}
                    </span>
                    <span class="chip">Failures since last success: {{ s.failedCount }}</span>
                    <span class="chip">Total failures: {{ s.lifetimeFailures }}</span>
                    <span class="chip" [class.chip-bad]="s.locked" [class.chip-ok]="!s.locked">
                      {{ s.locked ? 'Locked' : 'Not locked' }}
                    </span>
                  </div>
                  <mat-action-list>
                    @for (entry of s.recentAudit; track entry.timestamp) {
                      <mat-list-item>
                        <mat-icon matListItemIcon aria-hidden="true">history</mat-icon>
                        <div matListItemTitle>{{ entry.type }}</div>
                        <div matListItemLine>{{ entry.timestamp }} — {{ entry.actor }}</div>
                      </mat-list-item>
                    }
                  </mat-action-list>
                </mat-card-content>
              </mat-card>
              <button mat-stroked-button color="primary" type="button" (click)="step.set(3)">
                Next: retrieve as recipient
                <mat-icon aria-hidden="true">arrow_forward</mat-icon>
              </button>
            }
          </mat-step>

          <mat-step [completed]="!!verifyResult()" label="Retrieve as recipient">
            <h2>Step 3 — Retrieve as the recipient</h2>
            <p class="sl-hint">
              The recipient only has the link and their date of birth.
              @if (uploadResult(); as u) {
                Access URL:
                <a [href]="u.accessUrl" target="_blank" rel="noopener">{{ u.accessUrl }}</a>
              }
            </p>
            <form (ngSubmit)="verify()" novalidate fxLayout="column" fxLayoutGap="0.75rem">
              <mat-form-field appearance="outline">
                <mat-label>Date of birth</mat-label>
                <input matInput name="pVerifyDob" type="date" [(ngModel)]="verifyDob" required />
              </mat-form-field>
              <div>
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="busy3() || !verifyDob"
                >
                  <mat-icon aria-hidden="true">visibility</mat-icon>
                  {{ busy3() ? 'Verifying…' : 'Verify and get document' }}
                </button>
              </div>
            </form>
            @if (busy3()) {
              <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
            }
            @if (step3Error()) {
              <p class="sl-alert" role="alert">{{ step3Error() }}</p>
            }
            @if (verifyResult(); as v) {
              <mat-card appearance="outlined" class="inner">
                <mat-card-content fxLayout="column" fxLayoutGap="0.75rem">
                  <p role="status">
                    Verified — the link expires in {{ v.expiresInSeconds / 60 }} minutes.
                  </p>
                  <a
                    mat-stroked-button
                    color="primary"
                    [href]="v.downloadUrl"
                    target="_blank"
                    rel="noopener"
                  >
                    <mat-icon aria-hidden="true">open_in_new</mat-icon> Open your document (PDF)
                  </a>
                  <button mat-stroked-button color="primary" type="button" (click)="goToReporting()">
                    Next: view reporting
                    <mat-icon aria-hidden="true">arrow_forward</mat-icon>
                  </button>
                </mat-card-content>
              </mat-card>
            }
          </mat-step>

          <mat-step [completed]="!!usageResult()" label="Reporting">
            <h2>Step 4 — Reporting</h2>
            <p class="sl-hint">
              Commercial usage and the document event trail for Customer ID
              <code>{{ customerId }}</code> — the same data the reports API returns.
            </p>
            <button mat-stroked-button color="primary" type="button" (click)="loadReports()" [disabled]="busy4()">
              <mat-icon aria-hidden="true">refresh</mat-icon>
              {{ busy4() ? 'Loading…' : 'Refresh reporting' }}
            </button>
            @if (busy4()) {
              <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
            }
            @if (step4Error()) {
              <p class="sl-alert" role="alert">{{ step4Error() }}</p>
            }
            @if (usageResult(); as u) {
              <mat-card appearance="outlined" class="inner">
                <mat-card-header>
                  <mat-card-title>Usage summary</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  <div fxLayout="row wrap" fxLayoutGap="0.5rem" class="chips">
                    <span class="chip">Uploaded: {{ u.documentsUploaded }}</span>
                    <span class="chip">Viewed: {{ u.documentsViewed }}</span>
                    <span class="chip">Storage: {{ u.storageBytes }} bytes</span>
                    <span class="chip">Fallback notified: {{ u.fallbackNotified }}</span>
                  </div>
                  <p class="sl-hint">
                    First upload: {{ u.firstUploadAt ?? '—' }} — last upload: {{ u.lastUploadAt ?? '—' }}
                    @if (u.truncated) {
                      (truncated)
                    }
                  </p>
                </mat-card-content>
              </mat-card>
            }
            @if (eventsResult(); as ev) {
              <mat-card appearance="outlined" class="inner">
                <mat-card-header>
                  <mat-card-title>Document events (newest first)</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  @if (ev.events.length === 0) {
                    <p class="sl-hint">No events recorded for this customer yet.</p>
                  }
                  <mat-action-list>
                    @for (e of ev.events; track e.eventId) {
                      <mat-list-item>
                        <mat-icon matListItemIcon aria-hidden="true">event_note</mat-icon>
                        <div matListItemTitle>{{ e.type }} — {{ e.actor }}</div>
                        <div matListItemLine>
                          {{ e.timestamp }}
                          @if (e.documentReference) {
                            — {{ e.documentReference }}
                          }
                          @if (e.detail) {
                            — {{ e.detail }}
                          }
                        </div>
                      </mat-list-item>
                    }
                  </mat-action-list>
                </mat-card-content>
              </mat-card>
            }
          </mat-step>
        </mat-stepper>
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
      h2 {
        font-size: 1.15rem;
        margin: 0 0 0.75rem;
      }
      .ok {
        color: #00703c;
        font-weight: 600;
      }
      .inner {
        margin: 0.75rem 0;
      }
      .chips {
        margin: 0.5rem 0;
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
      code {
        background: #f0f4f8;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
    `,
  ],
})
export class DevPlaygroundComponent {
  step = signal(1);
  busy1 = signal(false);
  busy2 = signal(false);
  busy3 = signal(false);
  busy4 = signal(false);
  step1Error = signal('');
  step2Error = signal('');
  step3Error = signal('');
  step4Error = signal('');

  customerId = 'playground-cust';
  recipientId = 'playground-rec';
  dob = '1990-01-31';
  expiryDate = '';
  reference = '';
  filename = 'playground-sample.pdf';
  template = 'default';

  readonly templateIds = TEMPLATE_IDS;

  verifyDob = '';
  uploadResult = signal<UploadResult | null>(null);
  statusResult = signal<StatusResult | null>(null);
  verifyResult = signal<VerifyResult | null>(null);
  usageResult = signal<UsageResult | null>(null);
  eventsResult = signal<EventsResult | null>(null);

  readonly today = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);

  constructor() {
    this.expiryDate = this.today;
  }

  onStepChange(event: StepperSelectionEvent): void {
    this.step.set(event.selectedIndex + 1);
    if (event.selectedIndex === 3) {
      void this.loadReports();
    }
  }

  token(): string {
    const r = this.uploadResult();
    if (!r) return '';
    try {
      return new URL(r.accessUrl).pathname.split('/d/')[1] ?? '';
    } catch {
      return '';
    }
  }

  async uploadSample(): Promise<void> {
    if (
      !this.customerId.trim() ||
      !this.recipientId.trim() ||
      !this.dob.trim() ||
      !this.expiryDate.trim() ||
      !this.reference.trim()
    ) {
      this.step1Error.set('Fill every field before uploading.');
      return;
    }
    this.busy1.set(true);
    this.step1Error.set('');
    this.uploadResult.set(null);
    this.statusResult.set(null);
    this.verifyResult.set(null);
    this.usageResult.set(null);
    this.eventsResult.set(null);
    try {
      const res = await fetch('/dev/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: this.customerId.trim(),
          recipientId: this.recipientId.trim(),
          verificationValue: this.dob.trim(),
          expiryDate: this.expiryDate.trim(),
          originalFilename: this.filename.trim() || 'playground.pdf',
          documentReference: this.reference.trim(),
          template: this.template,
          pdfBase64: SAMPLE_PDF_BASE64,
        }),
      });
      const data = (await res.json()) as UploadResult & { message?: string };
      if (res.status === 201 && data.documentId && data.accessUrl) {
        this.uploadResult.set(data);
        this.verifyDob = this.dob.trim();
        this.step.set(2);
        void this.checkStatus();
      } else {
        this.step1Error.set(String(data.message ?? `Upload failed (HTTP ${res.status}).`));
      }
    } catch {
      this.step1Error.set('Could not reach the upload API. Try again.');
    } finally {
      this.busy1.set(false);
    }
  }

  async checkStatus(): Promise<void> {
    const r = this.uploadResult();
    if (!r) return;
    this.busy2.set(true);
    this.step2Error.set('');
    try {
      const params = new URLSearchParams({
        reference: this.reference.trim(),
        customerId: this.customerId.trim(),
      });
      const res = await fetch(`/dev/support-health?${params.toString()}`, {
        headers: { accept: 'application/json' },
      });
      const data = (await res.json()) as StatusResult & { message?: string };
      if (res.ok) {
        this.statusResult.set(data);
      } else {
        this.step2Error.set(String(data.message ?? `Status check failed (HTTP ${res.status}).`));
      }
    } catch {
      this.step2Error.set('Could not reach the support health API. Try again.');
    } finally {
      this.busy2.set(false);
    }
  }

  async verify(): Promise<void> {
    const token = this.token();
    if (!token) return;
    this.busy3.set(true);
    this.step3Error.set('');
    this.verifyResult.set(null);
    try {
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, dateOfBirth: this.verifyDob }),
      });
      const data = (await res.json()) as VerifyResult & { message?: string; lockedUntil?: string };
      if (res.status === 200 && data.downloadUrl) {
        this.verifyResult.set(data);
        void this.checkStatus();
        return;
      }
      if (res.status === 429) {
        this.step3Error.set(`Locked until ${String(data.lockedUntil ?? 'later')}.`);
        return;
      }
      this.step3Error.set(String(data.message ?? `Verification failed (HTTP ${res.status}).`));
    } catch {
      this.step3Error.set('Could not reach the verification service. Try again.');
    } finally {
      this.busy3.set(false);
    }
  }

  goToReporting(): void {
    this.step.set(4);
    void this.loadReports();
  }

  async loadReports(): Promise<void> {
    this.busy4.set(true);
    this.step4Error.set('');
    const params = new URLSearchParams({ customerId: this.customerId.trim() });
    try {
      const [usageRes, eventsRes] = await Promise.all([
        fetch(`/dev/reports/usage?${params.toString()}`, { headers: { accept: 'application/json' } }),
        fetch(`/dev/reports/document-events?${params.toString()}&limit=50`, {
          headers: { accept: 'application/json' },
        }),
      ]);
      const usage = (await usageRes.json()) as UsageResult & { message?: string };
      const events = (await eventsRes.json()) as EventsResult & { message?: string };
      if (!usageRes.ok || !eventsRes.ok) {
        this.step4Error.set(
          String(
            usage.message ??
              events.message ??
              `Reporting failed (HTTP ${usageRes.status}/${eventsRes.status}).`,
          ),
        );
        return;
      }
      this.usageResult.set(usage);
      this.eventsResult.set(events);
    } catch {
      this.step4Error.set('Could not reach the reporting API. Try again.');
    } finally {
      this.busy4.set(false);
    }
  }
}
