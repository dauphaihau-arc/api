export class ProductImportTemplateError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ProductImportNotFoundError extends Error {
  constructor(importId: string) {
    super(`Product import "${importId}" was not found`);
  }
}
