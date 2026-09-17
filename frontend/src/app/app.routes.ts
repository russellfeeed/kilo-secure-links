import { Routes } from '@angular/router';
import { DocumentAccessComponent } from './document-access.component';
import { SupportHealthComponent } from './support-health.component';
import { SupportLockoutsComponent } from './support-lockouts.component';
import { UploadHarnessComponent } from './upload-harness.component';

export const routes: Routes = [
  { path: 'd/:token', component: DocumentAccessComponent, title: 'Access your document' },
  { path: 'dev/upload', component: UploadHarnessComponent, title: 'Upload test harness' },
  { path: 'support/health', component: SupportHealthComponent, title: 'Delivery queue health' },
  { path: 'support/lockouts', component: SupportLockoutsComponent, title: 'Verification lockouts' },
  { path: '**', redirectTo: 'support/health' },
];
