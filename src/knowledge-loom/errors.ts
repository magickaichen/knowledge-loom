export class ContractError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContractError";
  }
}

export class ResolutionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ResolutionError";
  }
}
