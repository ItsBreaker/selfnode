/**
 * Start and stop node clients so they can always shut down cleanly.
 *
 * POSIX: a normal child process; stop = SIGINT, then SIGKILL after the timeout.
 *
 * Windows: console apps only shut down cleanly on a console Ctrl+C event, which
 * Node can't send (`child.kill()` is TerminateProcess). So, with built-in tools
 * only (no new dependencies or binaries):
 *  - start: PowerShell `Start-Process` launches the client in its OWN hidden
 *    console (stdout/stderr go to log files we tail), prints its PID, waits for
 *    it, and prints its exit code;
 *  - stop: an inline `Add-Type` C# helper runs FreeConsole → AttachConsole(pid) →
 *    SetConsoleCtrlHandler(NULL, TRUE) (so the helper itself ignores it) →
 *    GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0). Because the client has its own
 *    console, only the client receives it.
 * Either way we wait up to `timeoutMs` for a clean exit and only then force-kill,
 * logging that it happened.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ExitInfo {
  code: number | null;
  signal: string | null;
}

export interface StopResult extends ExitInfo {
  graceful: boolean;
}

export interface ManagedProcess {
  readonly name: string;
  readonly exited: Promise<ExitInfo>;
  readonly running: boolean;
  /** Ctrl+C / SIGINT, then force-kill after `timeoutMs`. */
  stop(timeoutMs: number): Promise<StopResult>;
}

export interface StartOptions {
  name: string;
  binary: string;
  args: string[];
  cwd: string;
  /** Windows: where the client's stdout/stderr are written (and tailed from). */
  logDir: string;
  onLine: (line: string) => void;
  onNote: (note: string) => void;
}

/** ANSI colour/escape sequences (ESC [ … letter). Built from a char code to avoid a control char in a regex literal. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");

const lines = (cb: (l: string) => void) => {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    const parts = buf.split(/\r?\n/);
    buf = parts.pop() ?? "";
    // Strip ANSI colour codes (Nethermind colourises its log lines).
    for (const p of parts) {
      const clean = p.replace(ANSI, "");
      if (clean.trim()) cb(clean);
    }
  };
};

export function startClient(o: StartOptions): ManagedProcess {
  return process.platform === "win32" ? startWindows(o) : startPosix(o);
}

// ---------------------------------------------------------------- POSIX

function startPosix(o: StartOptions): ManagedProcess {
  const child = spawn(o.binary, o.args, { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] });
  const out = lines(o.onLine);
  child.stdout?.on("data", (b: Buffer) => out(b.toString()));
  child.stderr?.on("data", (b: Buffer) => out(b.toString()));
  let running = true;
  const exited = new Promise<ExitInfo>((resolve) => {
    child.on("exit", (code, signal) => {
      running = false;
      resolve({ code, signal });
    });
    child.on("error", (e) => {
      running = false;
      o.onNote(`${o.name} failed to start: ${e.message}`);
      resolve({ code: null, signal: null });
    });
  });
  return {
    name: o.name,
    exited,
    get running() {
      return running;
    },
    stop: (timeoutMs) =>
      stopWith(
        o,
        exited,
        () => running,
        () => child.kill("SIGINT"),
        () => child.kill("SIGKILL"),
        timeoutMs,
      ),
  };
}

// ---------------------------------------------------------------- Windows

/** PowerShell scripts are passed with -EncodedCommand (UTF-16LE base64): no quoting pitfalls. */
const encode = (script: string) => Buffer.from(script, "utf16le").toString("base64");
const psArgs = (script: string) => [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
  "-EncodedCommand",
  encode(script),
];

/** Quote one argument for Start-Process -ArgumentList (a single Windows command line). */
function winQuote(a: string): string {
  if (a !== "" && !/[\s"]/.test(a)) return a;
  return `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

// SetConsoleCtrlHandler(NULL, FALSE) first: "restores normal processing of CTRL+C
// input. This attribute of ignoring or processing CTRL+C is inherited by child
// processes" (Win32 docs). Without it the client can inherit "ignore Ctrl+C" from
// whatever started us (seen on GitHub's Windows runners) and never shut down.
const LAUNCHER = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SelfnodeCtrlInherit {
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
}
'@
$restored = [SelfnodeCtrlInherit]::SetConsoleCtrlHandler([IntPtr]::Zero, $false)
[Console]::Out.WriteLine("SELFNODE_CTRLC_RESTORED " + $restored); [Console]::Out.Flush()
$p = Start-Process -FilePath $env:SN_BIN -ArgumentList $env:SN_ARGS -WorkingDirectory $env:SN_CWD -WindowStyle Hidden -PassThru -RedirectStandardOutput $env:SN_OUT -RedirectStandardError $env:SN_ERR
$null = $p.Handle  # cache the handle now, or ExitCode is empty after the process exits (PowerShell quirk)
[Console]::Out.WriteLine("SELFNODE_PID " + $p.Id); [Console]::Out.Flush()
$p.WaitForExit()
[Console]::Out.WriteLine("SELFNODE_EXIT " + $p.ExitCode); [Console]::Out.Flush()
`;

const CTRL_C = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SelfnodeCtrlC {
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GenerateConsoleCtrlEvent(uint ctrlEvent, uint processGroupId);
  public static int Send(uint pid) {
    FreeConsole();
    if (!AttachConsole(pid)) return 1000 + Marshal.GetLastWin32Error();
    SetConsoleCtrlHandler(IntPtr.Zero, true);       // this helper ignores the event itself
    bool ok = GenerateConsoleCtrlEvent(0, 0);       // CTRL_C_EVENT to everyone on that console
    int err = ok ? 0 : 2000 + Marshal.GetLastWin32Error();
    System.Threading.Thread.Sleep(500);
    FreeConsole();
    return err;
  }
}
'@
exit [SelfnodeCtrlC]::Send([uint32]$env:SN_PID)
`;

/** Follow a growing log file, calling `onText` with new content. */
function tail(path: string, onText: (s: string) => void): () => void {
  let pos = 0;
  const read = () => {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    if (size <= pos) return;
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(size - pos);
      readSync(fd, buf, 0, buf.length, pos);
      pos = size;
      onText(buf.toString("utf8"));
    } finally {
      closeSync(fd);
    }
  };
  const t = setInterval(read, 500);
  return () => {
    clearInterval(t);
    read();
  };
}

function startWindows(o: StartOptions): ManagedProcess {
  mkdirSync(o.logDir, { recursive: true });
  const stamp = Date.now();
  const outLog = join(o.logDir, `${o.name}-${stamp}.out.log`);
  const errLog = join(o.logDir, `${o.name}-${stamp}.err.log`);
  const env = {
    ...process.env,
    SN_BIN: o.binary,
    SN_ARGS: o.args.map(winQuote).join(" "),
    SN_CWD: o.cwd,
    SN_OUT: outLog,
    SN_ERR: errLog,
  };
  // The launcher itself has no console (windowsHide); Start-Process gives the client a new, hidden one.
  const launcher: ChildProcess = spawn("powershell.exe", psArgs(LAUNCHER), {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let pid: number | null = null;
  let exitCode: number | null = null;
  let running = true;
  const pidReady = new Promise<number | null>((resolve) => {
    const onLauncher = lines((l) => {
      const m = l.match(/^SELFNODE_PID (\d+)/);
      if (m) {
        pid = Number(m[1]);
        resolve(pid);
      }
      if (l.startsWith("SELFNODE_CTRLC_RESTORED"))
        o.onNote(
          `${o.name}: Ctrl+C handling ${l.endsWith("True") ? "restored" : "not confirmed"} for the client`,
        );
      const e = l.match(/^SELFNODE_EXIT (-?\d+)/);
      if (e) exitCode = Number(e[1]);
    });
    launcher.stdout?.on("data", (b: Buffer) => onLauncher(b.toString()));
    launcher.stderr?.on("data", (b: Buffer) =>
      o.onNote(`${o.name} launcher: ${b.toString().trim().slice(0, 300)}`),
    );
    launcher.on("exit", () => resolve(pid));
  });
  const out = lines(o.onLine);
  const stopOut = tail(outLog, out);
  const stopErr = tail(errLog, out);
  const exited = new Promise<ExitInfo>((resolve) => {
    launcher.on("exit", () => {
      // Give the log files a moment to flush, then read what's left before reporting the exit.
      setTimeout(() => {
        stopOut();
        stopErr();
        running = false;
        resolve({ code: exitCode, signal: null });
      }, 750);
    });
  });
  const sendCtrlC = async () => {
    const p = await pidReady;
    if (!p) return;
    await new Promise<void>((resolve) => {
      const h = spawn("powershell.exe", psArgs(CTRL_C), {
        env: { ...process.env, SN_PID: String(p) },
        stdio: "ignore",
        windowsHide: true,
      });
      h.on("exit", (code) => {
        if (code !== 0) o.onNote(`${o.name}: Ctrl+C helper returned ${code}`);
        resolve();
      });
      h.on("error", () => resolve());
    });
  };
  const forceKill = () => {
    if (pid) {
      try {
        process.kill(pid); // TerminateProcess
      } catch {
        /* already gone */
      }
    }
  };
  return {
    name: o.name,
    exited,
    get running() {
      return running;
    },
    stop: (timeoutMs) =>
      stopWith(
        o,
        exited,
        () => running,
        () => void sendCtrlC(),
        forceKill,
        timeoutMs,
      ),
  };
}

async function stopWith(
  o: StartOptions,
  exited: Promise<ExitInfo>,
  isRunning: () => boolean,
  graceful: () => void,
  force: () => void,
  timeoutMs: number,
): Promise<StopResult> {
  if (!isRunning()) return { ...(await exited), graceful: true };
  graceful();
  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), timeoutMs)),
  ]);
  if (timedOut) {
    o.onNote(
      `${o.name} didn't exit within ${Math.round(timeoutMs / 1000)} s of Ctrl+C; force-killing it.`,
    );
    force();
  }
  return { ...(await exited), graceful: !timedOut };
}
