import { TuiRoot } from '@taiga-ui/core';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastHostComponent } from './shared/toast/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot, ToastHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
