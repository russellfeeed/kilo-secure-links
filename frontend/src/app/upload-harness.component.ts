import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface UploadSuccess {
  documentId: string;
  accessUrl: string;
  expiryDate: string;
}

const SMS_TEMPLATE = (link: string): string =>
  `You have a secure document to view: ${link} — This preview is display-only. No message has been sent.`;

@Component({
  selector: 'sl-upload-harness',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>Upload test harness (local only)</h1>
    <p class="intro">
      Uploads a PDF to <code>POST /dev/upload</code> (dev-only unsigned alias of
      <code>POST /documents</code>) and previews how the returned link
      would appear inside an externally composed SMS. Display-only: nothing is sent.
    </p>

    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }
    @if (missing.length > 0) {
      <p class="error" role="alert">Missing fields: {{ missing.join(', ') }}</p>
    }

    <form (ngSubmit)="onSubmit()" novalidate>
      <label for="pdf">PDF file</label>
      <input id="pdf" type="file" accept="application/pdf" (change)="onFile($event)" required />

      <label for="customerId">Customer ID</label>
      <input id="customerId" name="customerId" [(ngModel)]="customerId" required />

      <label for="recipientId">Recipient ID</label>
      <input id="recipientId" name="recipientId" [(ngModel)]="recipientId" required />

      <label for="verificationValue">Verification value (DOB)</label>
      <input id="verificationValue" name="verificationValue" [(ngModel)]="verificationValue" placeholder="1990-01-31" required />

      <label for="expiryDate">Expiry date</label>
      <input id="expiryDate" name="expiryDate" type="date" [(ngModel)]="expiryDate" required [min]="today" />
      @if (expiryInPast) {
        <p class="error" role="alert">Expiry date must be in the future.</p>
      }

      <label for="originalFilename">Original filename</label>
      <input id="originalFilename" name="originalFilename" [(ngModel)]="originalFilename" placeholder="letter.pdf" required />

      <label for="documentReference">Document reference</label>
      <input id="documentReference" name="documentReference" [(ngModel)]="documentReference" placeholder="REF-123" required />

      <button type="submit" [disabled]="state === 'submitting' || !pdfBase64 || expiryInPast">
        {{ state === 'submitting' ? 'Uploading…' : 'Upload PDF' }}
      </button>
    </form>

    @if (state === 'success' && result) {
      <section aria-live="polite">
        <h2>Uploaded</h2>
        <p>Document reference: <code>{{ documentReference }}</code> — Customer ID: <code>{{ customerId }}</code></p>
        <p>Document ID: <code>{{ result.documentId }}</code></p>
        <p>Access URL: <a [href]="accessPath" target="_blank" rel="noopener">{{ result.accessUrl }}</a></p>
        <p>Expires: {{ result.expiryDate }}</p>
        <p class="hint">Look this upload up on the support health page using the reference and Customer ID above.</p>
        <h3>Simulated SMS preview</h3>
        <blockquote class="sms">{{ smsPreview }}</blockquote>
        <p class="hint">Template: <code>sms:+447700900077?body=&lt;link&gt;</code> — display only.</p>
      </section>
    }
  `,
  styles: [`
    :host { display: block; max-width: 36rem; margin: 0 auto; padding: 1rem; }
    .intro { font-size: 1.125rem; }
    .error { color: #b00020; font-weight: 600; }
    form { display: grid; gap: 0.5rem; margin-top: 1rem; }
    label { font-weight: 600; }
    input { font-size: 1rem; padding: 0.5rem; max-width: 100%; }
    button { font-size: 1rem; padding: 0.625rem 1rem; cursor: pointer; margin-top: 0.5rem; }
    .sms { border-left: 4px solid #005eb8; padding: 0.75rem 1rem; background: #f4f6f8; white-space: pre-wrap; overflow-wrap: anywhere; }
    .hint { font-size: 0.875rem; color: #444; }
  `],
})
export class UploadHarnessComponent {
  customerId = '';
  recipientId = '';
  verificationValue = '';
  expiryDate = '';
  originalFilename = '';
  documentReference = '';
  pdfBase64 = '';

  state: 'form' | 'submitting' | 'success' = 'form';
  error = '';
  missing: string[] = [];
  result: UploadSuccess | null = null;

  readonly today = new Date().toISOString().slice(0, 10);

  get expiryInPast(): boolean {
    return this.expiryDate.length > 0 && this.expiryDate <= this.today;
  }

  get smsPreview(): string {
    return this.result ? SMS_TEMPLATE(this.result.accessUrl) : '';
  }

  get accessPath(): string {
    if (!this.result) return '#';
    try {
      return new URL(this.result.accessUrl).pathname;
    } catch {
      return '#';
    }
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.pdfBase64 = '';
      return;
    }
    if (file.type !== 'application/pdf') {
      this.error = 'Select a PDF file.';
      this.pdfBase64 = '';
      return;
    }
    this.error = '';
    if (!this.originalFilename) this.originalFilename = file.name;
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (const b of buf) binary += String.fromCharCode(b);
    this.pdfBase64 = btoa(binary);
  }

  async onSubmit(): Promise<void> {
    this.state = 'submitting';
    this.error = '';
    this.missing = [];
    try {
      const res = await fetch('/dev/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerId: this.customerId,
          recipientId: this.recipientId,
          verificationValue: this.verificationValue,
          expiryDate: this.expiryDate,
          originalFilename: this.originalFilename,
          documentReference: this.documentReference,
          pdfBase64: this.pdfBase64,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        missing?: string[];
        documentId?: string;
        accessUrl?: string;
        expiryDate?: string;
      };
      if (res.status === 201 && data.documentId && data.accessUrl) {
        this.result = {
          documentId: String(data.documentId),
          accessUrl: String(data.accessUrl),
          expiryDate: String(data.expiryDate ?? ''),
        };
        this.state = 'success';
        return;
      }
      this.state = 'form';
      this.missing = Array.isArray(data.missing) ? data.missing.map(String) : [];
      this.error = String(data.message ?? 'Upload failed.');
    } catch {
      this.state = 'form';
      this.error = 'Could not reach the upload API. Try again.';
    }
  }
}
