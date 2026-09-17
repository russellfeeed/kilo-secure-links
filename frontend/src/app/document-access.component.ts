import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

interface VerifySuccess {
  documentReference: string;
  downloadUrl: string;
  expiresInSeconds: number;
}

@Component({
  selector: 'sl-document-access',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1>Access your document</h1>
    <p class="intro">
      You have received a secure document. Enter your date of birth to verify
      your identity and view it.
    </p>

    @if (state === 'loading') {
      <p role="status">Checking this link…</p>
    }

    @if (error) {
      <p class="error" role="alert">{{ error }}</p>
    }

    @if (state === 'form' || state === 'submitting' || state === 'error') {
      <form (ngSubmit)="onSubmit()" #dobForm="ngForm" novalidate>
        <label for="dob">Date of birth</label>
        <input
          id="dob"
          name="dateOfBirth"
          type="date"
          required
          [(ngModel)]="dateOfBirth"
          [disabled]="state === 'submitting'"
          autocomplete="bday"
        />
        <button type="submit" [disabled]="state === 'submitting' || !dateOfBirth">
          {{ state === 'submitting' ? 'Verifying…' : 'View document' }}
        </button>
      </form>
      <p class="hint">Use the date of birth held by your care provider, format YYYY-MM-DD.</p>
    }

    @if (state === 'locked') {
      <p role="alert">
        Too many incorrect attempts. This link is temporarily locked.
        @if (lockedUntil) {
          Try again after {{ lockedUntil }}.
        }
      </p>
    }

    @if (state === 'success' && result) {
      <section aria-live="polite">
        <h2>Verified</h2>
        <p>Document {{ result.documentReference }} is ready. The link below expires in 5 minutes.</p>
        <p><a [href]="result.downloadUrl" target="_blank" rel="noopener">Open your document (PDF)</a></p>
      </section>
    }
  `,
  styles: [`
    :host { display: block; max-width: 32rem; margin: 0 auto; padding: 1rem; }
    .intro { font-size: 1.125rem; }
    .error { color: #b00020; font-weight: 600; }
    form { display: grid; gap: 0.75rem; margin-top: 1rem; }
    label { font-weight: 600; }
    input { font-size: 1rem; padding: 0.5rem; max-width: 100%; }
    button { font-size: 1rem; padding: 0.625rem 1rem; cursor: pointer; }
    .hint { font-size: 0.875rem; color: #444; }
  `],
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
