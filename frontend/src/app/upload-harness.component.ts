import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

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
  imports: [
    FormsModule,
    FlexLayoutModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="sl-page" fxLayout="row" fxLayoutAlign="center start">
      <div fxFlex="100" fxFlex.gt-sm="80" fxLayout="column" fxLayoutGap="1rem">
        <mat-card>
          <mat-card-header>
            <div mat-card-avatar class="avatar" aria-hidden="true">
              <mat-icon>upload_file</mat-icon>
            </div>
            <mat-card-title>Upload test harness (local only)</mat-card-title>
            <mat-card-subtitle>
              Uploads a PDF to <code>POST /dev/upload</code> and previews how the returned link
              would appear inside an externally composed SMS. Display-only: nothing is sent.
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (error) {
              <p class="sl-alert" role="alert">{{ error }}</p>
            }
            @if (missing.length > 0) {
              <p class="sl-alert" role="alert">Missing fields: {{ missing.join(', ') }}</p>
            }
            @if (state === 'submitting') {
              <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
            }

            <form (ngSubmit)="onSubmit()" novalidate fxLayout="row wrap" fxLayoutGap="0.75rem">
              <div fxFlex="100">
                <button mat-stroked-button type="button" (click)="fileInput.click()">
                  <mat-icon aria-hidden="true">attach_file</mat-icon>
                  {{ originalFilename || 'Choose PDF' }}
                </button>
                <input
                  #fileInput
                  id="pdf"
                  type="file"
                  accept="application/pdf"
                  (change)="onFile($event)"
                  hidden
                  required
                />
              </div>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Customer ID</mat-label>
                <input matInput id="customerId" name="customerId" [(ngModel)]="customerId" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Recipient ID</mat-label>
                <input matInput id="recipientId" name="recipientId" [(ngModel)]="recipientId" required />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Verification value (DOB)</mat-label>
                <input
                  matInput
                  id="verificationValue"
                  name="verificationValue"
                  [(ngModel)]="verificationValue"
                  placeholder="1990-01-31"
                  required
                />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Expiry date</mat-label>
                <input
                  matInput
                  id="expiryDate"
                  name="expiryDate"
                  type="date"
                  [(ngModel)]="expiryDate"
                  required
                  [min]="today"
                />
                @if (expiryInPast) {
                  <mat-error>Expiry date must be in the future.</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Original filename</mat-label>
                <input
                  matInput
                  id="originalFilename"
                  name="originalFilename"
                  [(ngModel)]="originalFilename"
                  placeholder="letter.pdf"
                  required
                />
              </mat-form-field>
              <mat-form-field appearance="outline" fxFlex="100" fxFlex.gt-xs="calc(50% - 0.5rem)">
                <mat-label>Document reference</mat-label>
                <input
                  matInput
                  id="documentReference"
                  name="documentReference"
                  [(ngModel)]="documentReference"
                  placeholder="REF-123"
                  required
                />
              </mat-form-field>
              <div fxFlex="100">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="state === 'submitting' || !pdfBase64 || expiryInPast"
                >

                  <mat-icon aria-hidden="true">cloud_upload</mat-icon>

                  {{state === 'submitting' ? 'Uploading…' : 'Upload PDF' }}
                </button>
              </div>
            </form>
          </mat-card-content>

        </mat-card>

        @if (state === 'success' && result) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <div mat-card-avatar class="avatar ok" aria-hidden="true">
                <mat-icon>check_circle</mat-icon>
              </div>
              <mat-card-title>Uploaded</mat-card-title>
              <mat-card-subtitle>Expires {{ result.expiryDate }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content fxLayout="column" fxLayoutGap="0.5rem">
              <p>
                Document reference: <code>{{ documentReference }}</code> — Customer ID:
                <code>{{ customerId }}</code>
              </p>
              <p>Document ID: <code>{{ result.documentId }}</code></p>
              <p>
                Access URL:
                <a [href]="accessPath" target="_blank" rel="noopener">{{ result.accessUrl }}</a>
              </p>
              <p class="sl-hint">
                Look this upload up on the support health page using the reference and Customer ID
                above.
              </p>
              <h3>Simulated SMS preview</h3>
              <blockquote class="sms">{{ smsPreview }}</blockquote>
              <p class="sl-hint">Template: <code>sms:+447700900077?body=&lt;link&gt;</code> — display only.</p>
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
     
      .sms {
        border-left: 4px solid #005eb8;
        padding: 0.75rem 1rem;
        background: #f4f6f8;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        margin: 0;
      }
      code {
        background: #f0f4f8;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
    `,
  ],
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
