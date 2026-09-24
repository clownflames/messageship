export class WhatsappApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(message: string, status: number, code: string, requestId?: string) {
    super(message);
    this.name = "WhatsappApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class WhatsappValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "WhatsappValidationError";
    this.field = field;
  }
}
