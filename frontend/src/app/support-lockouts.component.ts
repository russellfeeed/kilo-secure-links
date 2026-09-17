import { Component } from '@angular/core';

@Component({
  selector: 'sl-support-lockouts',
  standalone: true,
  template: `
    <h1>Verification lockouts</h1>
    <p>
      Phase 1 uses direct database access plus an audited reset function — see the support runbook.
      A dedicated admin UI is a planned future enhancement and is intentionally not built here.
    </p>
    <p><a href="/docs/runbooks/support-direct-db-access.md">Open the direct-access runbook</a></p>
  `,
})
export class SupportLockoutsComponent {}
