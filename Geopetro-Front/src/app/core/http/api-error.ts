import { HttpErrorResponse } from '@angular/common/http';

type ApiErrorBody = {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  details?: string[];
  detail?: string;
  title?: string;
  errors?: string[] | Record<string, string | string[]>;
};

export function parseApiError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Não foi possível concluir a operação.';
  }

  if (error.status === 0) {
    return 'Não foi possível conectar ao servidor.';
  }

  const body = normalizeErrorBody(error.error);

  if (body && typeof body === 'object') {
    const details = normalizeDetails(body.details);
    const mainMessage = firstNonEmpty(body.message, body.detail, body.title);

    if (mainMessage && details.length > 0) {
      return `${mainMessage} ${details.join(' ')}`;
    }

    if (mainMessage) {
      return mainMessage;
    }

    if (details.length > 0) {
      return details.join(' ');
    }

    const errors = normalizeErrors(body.errors);

    if (errors.length > 0) {
      return errors.join(' ');
    }

    if (body.error && !isHttpReasonPhrase(body.error)) {
      return body.error;
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }

  if (error.status === 401 || error.status === 403) {
    return 'Usuário ou senha inválidos.';
  }

  return 'Erro ao processar resposta do servidor.';
}

function normalizeErrorBody(body: unknown): ApiErrorBody | string | null {
  if (typeof body === 'string') {
    return parseJsonOrText(body);
  }

  if (body && typeof body === 'object') {
    return body as ApiErrorBody;
  }

  return null;
}

function parseJsonOrText(value: string): ApiErrorBody | string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed) as ApiErrorBody;
  } catch {
    return trimmed;
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

function normalizeDetails(details: unknown): string[] {
  if (!Array.isArray(details)) {
    return [];
  }

  return details.filter((detail): detail is string => typeof detail === 'string' && detail.trim().length > 0);
}

function normalizeErrors(errors: ApiErrorBody['errors']): string[] {
  if (Array.isArray(errors)) {
    return errors.filter((item) => item.trim().length > 0);
  }

  if (errors && typeof errors === 'object') {
    return Object.values(errors)
      .flat()
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  return [];
}

function isHttpReasonPhrase(value: string): boolean {
  return ['Bad Request', 'Unauthorized', 'Forbidden', 'Not Found', 'Conflict', 'Internal Server Error'].includes(value);
}
