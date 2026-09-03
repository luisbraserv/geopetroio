import { provideTaiga } from '@taiga-ui/core';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';

import { routes } from './app.routes';
import { authTokenInterceptor } from './core/http/auth-token.interceptor';
import { AuthState } from './features/auth/state/auth.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    provideTaiga(),
    provideStore([AuthState], withNgxsStoragePlugin({ keys: ['auth'] })),
  ],
};
