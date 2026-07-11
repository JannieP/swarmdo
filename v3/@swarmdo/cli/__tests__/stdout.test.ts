import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { writeStdout, guardStreamEpipe, type WritableLike } from '../src/util/stdout.ts';

/** A fake writable whose write() callback reports the given outcome. */
function fakeStream(cbMode: 'ok' | 'epipe' | 'fail'): WritableLike & EventEmitter {
  const ee = new EventEmitter() as EventEmitter & WritableLike;
  ee.write = (_data: string, cb: (err?: Error | null) => void): boolean => {
    if (cbMode === 'ok') { cb(null); return true; }
    const err = new Error(cbMode === 'epipe' ? 'write EPIPE' : 'no space left') as NodeJS.ErrnoException;
    err.code = cbMode === 'epipe' ? 'EPIPE' : 'ENOSPC';
    cb(err);
    return false;
  };
  return ee;
}
const errOf = (code: string) => Object.assign(new Error(code), { code });

describe('writeStdout', () => {
  it('resolves on a normal flushed write', async () => {
    await expect(writeStdout('hi', fakeStream('ok'))).resolves.toBeUndefined();
  });

  it('resolves on an EPIPE write callback (reader closed the pipe)', async () => {
    await expect(writeStdout('big output', fakeStream('epipe'))).resolves.toBeUndefined();
  });

  it('still rejects a genuine non-EPIPE write error', async () => {
    await expect(writeStdout('x', fakeStream('fail'))).rejects.toThrow(/no space left/);
  });

  it('installs a persistent guard: an ASYNC EPIPE error event is swallowed, not thrown', async () => {
    const s = fakeStream('ok');
    await writeStdout('hi', s); // arms the guard on this stream
    // The real crash: process.stdout emits 'error' EPIPE after the write callback.
    expect(() => s.emit('error', errOf('EPIPE'))).not.toThrow();
    // …but a genuine stream error must still surface (not silently swallowed).
    expect(() => s.emit('error', errOf('EIO'))).toThrow(/EIO/);
  });
});

describe('guardStreamEpipe', () => {
  it('is idempotent — arming the same stream twice adds one listener', () => {
    const s = fakeStream('ok');
    guardStreamEpipe(s);
    guardStreamEpipe(s);
    expect(s.listenerCount('error')).toBe(1);
  });
});
