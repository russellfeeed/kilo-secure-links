import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'sl-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <a class="skip-link" href="#main">Skip to main content</a>
    <header role="banner">
      <nav aria-label="Primary">
        <a routerLink="/health" aria-label="SecureLinks home">SecureLinks</a>
      </nav>
    </header>
    <main id="main" role="main" tabindex="-1">
      <router-outlet></router-outlet>
    </main>
    <footer role="contentinfo">
      <p>SecureLinks Phase 1 pilot — secure document access. SMS delivery handled upstream by Prism/Firetext.</p>
    </footer>
  `,
})
export class AppComponent {}
