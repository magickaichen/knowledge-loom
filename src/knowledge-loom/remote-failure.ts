export function classifyFailure(error: string): string {
  return /authentication failed|permission denied|could not read Username|could not read Password/i.test(error) ? "authentication" : "transport";
}
