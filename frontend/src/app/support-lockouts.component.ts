import { Component } from '@angular/core';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'sl-support-lockouts',
  standalone: true,
  imports: [FlexLayoutModule, MatCardModule, MatIconModule, MatButtonModule],
  template: `
    <div class="sl-page" fxLayout="row" fxLayoutAlign="center start">
      <mat-card fxFlex="100" fxFlex.gt-sm="70">
        <mat-card-header>
          <div mat-card-avatar class="avatar" aria-hidden="true">
            <mat-icon>lock_clock</mat-icon>
          </div>
          <mat-card-title>Verification lockouts</mat-card-title>
          <mat-card-subtitle>
            Phase 1 uses direct database access plus an audited reset function.
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p>
            A dedicated admin UI is a planned future enhancement and is intentionally not built
            here. See the support runbook for the current procedure.
          </p>
          <a
            mat-stroked-button
            color="primary"
            href="/docs/runbooks/support-direct-db-access.md"
          >
            <mat-icon aria-hidden="true">menu_book</mat-icon> Open the direct-access runbook
          </a>
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
    `,
  ],
})
export class SupportLockoutsComponent {}
