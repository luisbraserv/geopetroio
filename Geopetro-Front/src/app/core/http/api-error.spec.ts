import { HttpErrorResponse } from '@angular/common/http';
import { parseApiError } from './api-error';

describe('API failure messages', () => {
  it('explains the empty 500 returned when the development proxy cannot reach the backend', () => {
    expect(parseApiError(new HttpErrorResponse({ status: 500, error: '' })))
      .toContain('servidor está indisponível');
  });
  it('distinguishes a denied operation from invalid credentials', () => {
    expect(parseApiError(new HttpErrorResponse({ status: 403 }))).toContain('permissão');
    expect(parseApiError(new HttpErrorResponse({ status: 401 }))).toContain('senha inválidos');
  });
  it('preserves actionable API errors', () => {
    expect(parseApiError(new HttpErrorResponse({ status: 500, error: { message: 'Falha específica' } })))
      .toBe('Falha específica');
  });
});
