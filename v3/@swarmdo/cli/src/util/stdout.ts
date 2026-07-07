/**
 * writeStdout — write to stdout and RESOLVE ONLY WHEN THE CHUNK IS FLUSHED.
 *
 * process.stdout on a pipe is asynchronous: write() buffers in JS and returns
 * immediately. If the command then returns and the CLI harness calls
 * process.exit(), any unflushed bytes are discarded — large piped output
 * (`swarmdo sbom | …`, `pack`, `compact`, `redact`) truncates at the ~64 KiB
 * pipe buffer. Awaiting the write callback guarantees the data reached the OS
 * before we hand control back. For a TTY (synchronous) this is a no-op await.
 */
export function writeStdout(data: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    process.stdout.write(data, (err) => (err ? reject(err) : resolve()));
  });
}
