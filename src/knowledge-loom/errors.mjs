export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ContractError";
  }
}

export class ResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResolutionError";
  }
}
