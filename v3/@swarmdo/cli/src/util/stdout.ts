/**
 * writeStdout — write to stdout and RESOLVE ONLY WHEN THE CHUNK IS FLUSHED.
 *
 * process.stdout on a pipe is asynchronous: write() buffers in JS and returns
 * immediately. If the command then returns and the CLI harness calls
 * process.exit(), any unflushed bytes are discarded — large piped output
 * (`swarmdo sbom | …`, `pack`, `compact`, `redact`) truncates at the ~64 KiB
 * pipe buffer. Awaiting the write callback guarantees the data reached the OS
 * before we hand control back. For a TTY (synchronous) this is a no-op await.
 *
 * Broken-pipe (EPIPE) handling: when the reader closes the pipe early (`… |
 * head`), Node emits an `'error'` event on the stdout Socket — often
 * ASYNCHRONOUSLY, after our write callback has already fired — and an unhandled
 * `'error'` event crashes the process with a raw stack trace. A per-write
 * listener therefore doesn't cover it (it's gone by the time the async error
 * lands). So we install ONE persistent EPIPE guard per stream that swallows the
 * broken pipe (normal producer termination) while still rethrowing any other
 * stream error, and additionally resolve the write promise on an EPIPE callback.
 * The `stream` param is injectable so this is unit-testable without a subprocess.
 */

/** The subset of a writable stream writeStdout needs (process.stdout satisfies it). */
export interface WritableLike {
  write(data: string, cb: (err?: Error | null) => void): boolean;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

const guarded = new WeakSet<object>();

/**
 * Install (once per stream) a persistent `'error'` handler that swallows EPIPE —
 * a closed reader is normal termination for a Unix producer, not a crash — and
 * rethrows everything else so genuine stream errors still surface. Exported for
 * the CLI entry point to arm stdout/stderr before any write happens.
 */
export function guardStreamEpipe(stream: WritableLike): void {
  if (guarded.has(stream as object)) return;
  guarded.add(stream as object);
  stream.on('error', (err: Error) => {
    if ((err as NodeJS.ErrnoException).code !== 'EPIPE') throw err;
  });
}

export function writeStdout(data: string, stream: WritableLike = process.stdout): Promise<void> {
  guardStreamEpipe(stream);
  return new Promise<void>((resolve, reject) => {
    stream.write(data, (err) => {
      if (err && (err as NodeJS.ErrnoException).code !== 'EPIPE') reject(err);
      else resolve();
    });
  });
}
