/** Process exit codes; documented in docs/m0-ke-hoach.md section 6. */
export const ExitCode = {
  Ok: 0,
  Usage: 1,
  Import: 2,
  Unmapped: 3,
  Firmware: 4,
  Runtime: 5,
} as const;

export class CliError extends Error {
  override name = 'CliError';
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}
