export class ConcurrencyConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string = 'Conflitto di concorrenza: la risorsa è stata modificata da un altro utente') {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string = 'Operazione non consentita: permessi insufficienti') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string = 'Risorsa non trovata o non visibile') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
