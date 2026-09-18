import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  imports: [FormsModule],
  template: `
    <h1>Developer playground</h1>
    <p class="intro">
      Walks the full SecureLinks lifecycle against the live dev backend:
      <strong>1) upload</strong> a document, <strong>2) check</strong> its status,
      <strong>3) retrieve</strong> it the way a recipient would, <strong>4) review</strong>
      the reporting it produced. Nothing here sends SMS.
    </p>

    <ol class="steps" aria-label="Progress">
      <li [class.done]="step() > 1" [class.active]="step() === 1">Upload</li>
      <li [class.done]="step() > 2" [class.active]="step() === 2">Check status</li>
      <li [class.done]="step() > 3" [class.active]="step() === 3">Retrieve as recipient</li>
      <li [class.active]="step() === 4">Reporting</li>
    </ol>

    <section [hidden]="step() !== 1" aria-labelledby="step1h">
      <h2 id="step1h">Step 1 — Upload a document</h2>
      @if (step1Error()) {
        <p class="error" role="alert">{{ step1Error() }}</p>
      }
      <form (ngSubmit)="uploadSample()" novalidate>
        <div class="grid2">
          <label>Customer ID <input name="pCustomerId" [(ngModel)]="customerId" required /></label>
          <label>Recipient ID <input name="pRecipientId" [(ngModel)]="recipientId" required /></label>
          <label>Verification DOB <input name="pDob" [(ngModel)]="dob" placeholder="1990-01-31" required /></label>
          <label>Expiry date <input name="pExpiry" type="date" [(ngModel)]="expiryDate" required [min]="today" /></label>
          <label>Document reference <input name="pRef" [(ngModel)]="reference" placeholder="PLAY-001" required /></label>
          <label>Filename <input name="pName" [(ngModel)]="filename" required /></label>
        </div>
        <button type="submit" [disabled]="busy1()">
          {{ busy1() ? 'Uploading…' : 'Upload sample PDF' }}
        </button>
      </form>
      @if (uploadResult(); as r) {
        <p class="ok" role="status">
          Uploaded — document <code>{{ r.documentId }}</code>, reference <code>{{ reference }}</code>
        </p>
        <button type="button" (click)="step.set(2)">Next: check status →</button>
      }
    </section>

    <section [hidden]="step() !== 2" aria-labelledby="step2h">
      <h2 id="step2h">Step 2 — Check document status</h2>
      <p class="hint">Look up by the reference and Customer ID from step 1 (same data the support page uses).</p>
      <button type="button" (click)="checkStatus()" [disabled]="busy2() || !uploadResult()">
        {{ busy2() ? 'Checking…' : 'Refresh status' }}
      </button>
      @if (step2Error()) {
        <p class="error" role="alert">{{ step2Error() }}</p>
      }
      @if (statusResult(); as s) {
        <div class="panel">
          <p>
            Viewed: <strong>{{ s.viewedStatus ? 'yes' : 'no' }}</strong> —
            failures since last success: <strong>{{ s.failedCount }}</strong> —
            total failures: <strong>{{ s.lifetimeFailures }}</strong> —
            locked: <strong>{{ s.locked ? 'yes' : 'no' }}</strong>
          </p>
          <ul>
            @for (entry of s.recentAudit; track entry.timestamp) {
              <li>{{ entry.timestamp }} — {{ entry.type }} — {{ entry.actor }}</li>
            }
          </ul>
        </div>
        <button type="button" (click)="step.set(3)">Next: retrieve as recipient →</button>
      }
    </section>

    <section [hidden]="step() !== 3" aria-labelledby="step3h">
      <h2 id="step3h">Step 3 — Retrieve as the recipient</h2>
      <p class="hint">
        The recipient only has the link and their date of birth. Access URL:
        <a [href]="uploadResult()?.accessUrl" target="_blank" rel="noopener">{{ uploadResult()?.accessUrl }}</a>
      </p>
      <form (ngSubmit)="verify()" novalidate>
        <label>Date of birth <input name="pVerifyDob" type="date" [(ngModel)]="verifyDob" required /></label>
        <button type="submit" [disabled]="busy3() || !verifyDob">
          {{ busy3() ? 'Verifying…' : 'Verify and get document' }}
        </button>
      </form>
      @if (step3Error()) {
        <p class="error" role="alert">{{ step3Error() }}</p>
      }
      @if (verifyResult(); as v) {
        <div class="panel">
          <p role="status">
            Verified — <a [href]="v.downloadUrl" target="_blank" rel="noopener">open your document (PDF)</a>.
            The link expires in {{ v.expiresInSeconds / 60 }} minutes.
          </p>
          <button type="button" (click)="goToReporting()">Next: view reporting →</button>
        </div>
      }
    </section>

    <section [hidden]="step() !== 4" aria-labelledby="step4h">
      <h2 id="step4h">Step 4 — Reporting</h2>
      <p class="hint">
        Commercial usage and the document event trail for Customer ID
        <code>{{ customerId }}</code> — the same data the reports API returns.
      </p>
      <button type="button" (click)="loadReports()" [disabled]="busy4()">
        {{ busy4() ? 'Loading…' : 'Refresh reporting' }}
      </button>
      @if (step4Error()) {
        <p class="error" role="alert">{{ step4Error() }}</p>
      }
      @if (usageResult(); as u) {
        <div class="panel">
          <h3>Usage summary</h3>
          <p>
            Uploaded: <strong>{{ u.documentsUploaded }}</strong> —
            viewed: <strong>{{ u.documentsViewed }}</strong> —
            storage: <strong>{{ u.storageBytes }} bytes</strong> —
            fallback notified: <strong>{{ u.fallbackNotified }}</strong>
          </p>
          <p class="hint">
            First upload: {{ u.firstUploadAt ?? '—' }} — last upload: {{ u.lastUploadAt ?? '—' }}
            @if (u.truncated) {
              (truncated)
            }
          </p>
        </div>
      }
      @if (eventsResult(); as ev) {
        <div class="panel">
          <h3>Document events (newest first)</h3>
          @if (ev.events.length === 0) {
            <p class="hint">No events recorded for this customer yet.</p>
          }
          <ul>
            @for (e of ev.events; track e.eventId) {
              <li>
                {{ e.timestamp }} — <strong>{{ e.type }}</strong> — {{ e.actor }}
                @if (e.documentReference) {
                  — <code>{{ e.documentReference }}</code>
                }
                @if (e.detail) {
                  — {{ e.detail }}
                }
              </li>
            }
          </ul>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; max-width: 40rem; margin: 0 auto; padding: 1rem; }
    .intro { font-size: 1.125rem; }
    .steps { display: flex; gap: 0.5rem; list-style: none; padding: 0; }
    .steps li { padding: 0.25rem 0.75rem; border: 1px solid #ccc; border-radius: 999px; }
    .steps li.active { border-color: #005eb8; font-weight: 700; }
    .steps li.done { border-color: #00703c; color: #00703c; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
    label { display: grid; gap: 0.15rem; font-weight: 600; }
    input { font-size: 1rem; padding: 0.4rem; }
    button { font-size: 1rem; padding: 0.5rem 1rem; cursor: pointer; margin-top: 0.5rem; }
    .error { color: #b00020; font-weight: 600; }
    .ok { color: #00703c; font-weight: 600; }
    .panel { border: 1px solid #ccc; padding: 0.75rem 1rem; margin-top: 0.75rem; }
    .panel h3 { margin: 0 0 0.4rem; font-size: 1rem; }
    .hint { font-size: 0.875rem; color: #444; }
    section { margin-top: 1.5rem; }
  `],
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
    if (!this.customerId.trim() || !this.recipientId.trim() || !this.dob.trim() || !this.expiryDate.trim() || !this.reference.trim()) {
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
      const params = new URLSearchParams({ reference: this.reference.trim(), customerId: this.customerId.trim() });
      const res = await fetch(`/dev/support-health?${params.toString()}`, { headers: { accept: 'application/json' } });
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
          String(usage.message ?? events.message ?? `Reporting failed (HTTP ${usageRes.status}/${eventsRes.status}).`),
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
