import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Store } from '@ngxs/store';

import { AuthState } from '../../../features/auth/state/auth.state';

@Component({
  selector: 'app-dashboard-page',
  imports: [CommonModule, RouterLink, TuiIcon],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.css',
})
export class DashboardPageComponent {
  private readonly store = inject(Store);

  protected readonly currentUser = this.store.selectSignal(AuthState.currentUser);
}
