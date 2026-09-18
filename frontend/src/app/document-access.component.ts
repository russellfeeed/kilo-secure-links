import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';

interface VerifySuccess {
  documentReference: string;
  downloadUrl: string;
  expiresInSeconds: number;
}

@Component({
  selector: 'sl-document-access',
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
      <mat-card fxFlex="100" fxFlex.gt-sm="70" fxFlex.gt-lg="55">
        <mat-card-header>
          <div mat-card-avatar class="avatar" aria-hidden="true">
            <mat-icon>verified_user</mat-icon>
          </div>
          <mat-card-title>Access your document</mat-card-title>
          <mat-card-subtitle>
            Enter your date of birth to verify your identity and view it.
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (state === 'loading') {
            <p role="status">Checking this link…</p>
            <mat-progress-bar mode="indeterminate" aria-hidden="true"></mat-progress-bar>
          }

          @if (error) {
            <p class="sl-alert" role="alert">{{ error }}</p>
          }

          @if (state === 'form' || state === 'submitting' || state === 'error') {
            <form (ngSubmit)="onSubmit()" #dobForm="ngForm" novalidate fxLayout="column" fxLayoutGap="0.75rem">
              <mat-form-field appearance="outline">
                <mat-label>Date of birth</mat-label>
                <input
                  matInput
                  id="dob"
                  name="dateOfBirth"
                  type="date"
                  required
                  [(ngModel)]="dateOfBirth"
                  [disabled]="state === 'submitting'"
                  autocomplete="bday"
                />
                <mat-icon matSuffix aria-hidden="true">event</mat-icon>
                <mat-hint>Use the date of birth held by your care provider.</mat-hint>
              </mat-form-field>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="state === 'submitting' || !dateOfBirth"
              >
                <mat-icon aria-hidden="true">{{ state === 'submitting' ? 'hourglass_top' : 'visibility' }}</mat-icon>
                {{ state === 'submitting' ? 'Verifying…' : 'View document' }}
              </button>
            </form>
            <p class="sl-hint">Format YYYY-MM-DD.</p>
          }

          @if (state === 'locked') {
            <div class="state-box" role="alert">
              <mat-icon color="warn" aria-hidden="true">lock</mat-icon>
              <div>
                <p><strong>Too many incorrect attempts.</strong> This link is temporarily locked.</p>
                @if (lockedUntil) {
                  <p>Try again after {{ lockedUntil }}.</p>
                }
              </div>
            </div>
          }

          @if (state === 'success' && result) {
            <section aria-live="polite" fxLayout="column" fxLayoutGap="0.75rem">
              <div class="state-box success">
                <mat-icon aria-hidden="true">check_circle</mat-icon>
                <div>
                  <p>
                    <strong>Verified.</strong> Document
                    <code>{{ result.documentReference || 'yours' }}</code> is ready.
                  </p>
                  <p class="sl-hint">
                    The link below expires in {{ result.expiresInSeconds / 60 }} minutes.
                  </p>
                </div>
              </div>
              <a
                mat-stroked-button
                color="primary"
                [href]="result.downloadUrl"
                target="_blank"
                rel="noopener"
              >
                <mat-icon aria-hidden="true">open_in_new</mat-icon> Open your document (PDF)
              </a>
            </section>
          }
        </mat-card-content>
      </mat-card>
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
      .state-box {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        border: 1px solid #d8dee6;
        border-radius: 8px;
        padding: 0.875rem 1rem;
        background: #fff;
      }
      .state-box p {
        margin: 0 0 0.25rem;
      }
      .state-box.success {
        border-color: #00703c;
        background: #eef7f1;
      }
      .state-box.success mat-icon {
        color: #00703c;
      }
      code {
        background: #f0f4f8;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
    `,
  ],
})
export class DocumentAccessComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  token = '';
  dateOfBirth = '';
  state: 'loading' | 'form' | 'submitting' | 'error' | 'locked' | 'success' = 'loading';
  error = '';
  lockedUntil = '';
  result: VerifySuccess | null = null;

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token')?.trim() ?? '';
    if (!this.token) {
      this.state = 'error';
      this.error = 'This link is invalid or has expired.';
      return;
    }
    this.state = 'form';
  }

  async onSubmit(): Promise<void> {
    if (!this.dateOfBirth) return;
    this.state = 'submitting';
    this.error = '';
    try {
      const res = await fetch('/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: this.token, dateOfBirth: this.dateOfBirth }),
      });
      const data = (await res.json()) as {
        message?: string;
        lockedUntil?: string;
        documentReference?: string;
        downloadUrl?: string;
        expiresInSeconds?: number;
      };
      if (res.status === 200 && data.downloadUrl) {
        this.result = {
          documentReference: String(data.documentReference ?? ''),
          downloadUrl: String(data.downloadUrl),
          expiresInSeconds: Number(data.expiresInSeconds ?? 300),
        };
        this.state = 'success';
        return;
      }
      if (res.status === 429) {
        this.state = 'locked';
        this.lockedUntil = String(data.lockedUntil ?? '');
        return;
      }
      this.state = 'error';
      this.error = String(data.message ?? 'Verification failed. Try again.');
    } catch {
      this.state = 'error';
      this.error = 'Could not reach the verification service. Try again.';
    }
  }
}
