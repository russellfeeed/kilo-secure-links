import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'sl-root',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FlexLayoutModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
  ],
  template: `
    <a class="skip-link" href="#main">Skip to main content</a>
    <header role="banner">
      <mat-toolbar color="primary">
        <a class="brand" mat-button routerLink="/health" aria-label="SecureLinks home">
          <mat-icon aria-hidden="true">verified_user</mat-icon>
          <span class="brand-name">SecureLinks</span>
        </a>
        <nav
          aria-label="Primary"
          fxFlex
          fxLayout="row"
          fxLayoutAlign="end center"
          fxLayoutGap="0.25rem"
        >
          <a mat-button routerLink="/dev/playground" routerLinkActive="active-link">Playground</a>
          <a mat-button routerLink="/dev/harness" routerLinkActive="active-link">Upload harness</a>
          <a mat-button routerLink="/support/health" routerLinkActive="active-link">Support health</a>
        </nav>
      </mat-toolbar>
    </header>
    <main id="main" role="main" tabindex="-1" fxFlexFill>
      <router-outlet></router-outlet>
    </main>
    <footer role="contentinfo" fxLayout="row" fxLayoutAlign="center center">
      <p>SecureLinks Phase 1 pilot — secure document access. SMS delivery handled upstream by Prism/Firetext.</p>
    </footer>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }
      main {
        flex: 1 1 auto;
      }
      .brand {
        font-weight: 700;
        color: #fff;
      }
      .brand-name {
        font-size: 1.15rem;
        letter-spacing: 0.01em;
      }
      nav a {
        color: #fff;
      }
      .active-link {
        background: rgba(255, 255, 255, 0.16);
        border-radius: 4px;
      }
      footer {
        background: #e2e9f0;
        padding: 0.75rem 1rem;
      }
      footer p {
        margin: 0;
        font-size: 0.8125rem;
        color: #445;
        text-align: center;
      }
    `,
  ],
})
export class AppComponent {}
