import { runLockedProcess } from "../knowledge-loom/vault-lock.js";

export type TrackWriter = (pid: number, group?: boolean) => void;

// Node cannot atomically replace a directory with a symlink. Use the OS exchange
// primitive through Python's standard-library FFI, only during explicit adoption.
// There is deliberately no two-rename fallback on unsupported filesystems.
const EXCHANGE = `
import ctypes, os, sys
libc = ctypes.CDLL(None, use_errno=True)
a, b = os.fsencode(sys.argv[1]), os.fsencode(sys.argv[2])
if sys.platform == 'darwin':
    fn = libc.renamex_np
    fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    result = fn(a, b, 2)
elif sys.platform.startswith('linux'):
    fn = libc.renameat2
    fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    result = fn(-100, a, -100, b, 2)
else:
    raise RuntimeError('atomic adoption requires macOS or Linux')
if result != 0:
    error = ctypes.get_errno()
    raise OSError(error, os.strerror(error))
`;

export async function exchangeInstallation(root: string, target: string, backup: string, trackWriter: TrackWriter): Promise<void> {
  let diagnostic = "";
  const status = await runLockedProcess(root, "python3", ["-c", EXCHANGE, target, backup], trackWriter, {
    timeoutMs: 10_000,
    stderr: { write(message: string) { diagnostic += message; } },
  });
  if (status !== 0) throw new Error(`atomic adoption unavailable; original installation preserved: ${diagnostic.trim()}`);
}
