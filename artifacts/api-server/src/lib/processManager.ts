import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { logger } from "./logger";

const BOTS_DIR = process.env.BOTS_DIR || path.join(process.cwd(), "bot_instances");

export interface BotProcess {
  pid: number;
  botId: number;
  process: ChildProcess;
  logs: string[];
}

export const processEmitter = new EventEmitter();
processEmitter.setMaxListeners(100);

const runningProcesses = new Map<number, BotProcess>();
const MAX_LOG_LINES = 500;

export function getBotDir(botId: number): string {
  return path.join(BOTS_DIR, `bot_${botId}`);
}

export function ensureBotsDir() {
  if (!fs.existsSync(BOTS_DIR)) {
    fs.mkdirSync(BOTS_DIR, { recursive: true });
  }
}

export function getProcess(botId: number): BotProcess | undefined {
  return runningProcesses.get(botId);
}

export function isRunning(botId: number, fallbackPid?: number | null): boolean {
  const bp = runningProcesses.get(botId);
  if (bp) {
    try {
      process.kill(bp.pid, 0);
      return true;
    } catch {
      runningProcesses.delete(botId);
      return false;
    }
  }
  // After API server restart the in-memory map is empty but the bot process
  // may still be alive — check the PID stored in the database.
  if (fallbackPid) {
    try {
      process.kill(fallbackPid, 0);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function getLogs(botId: number): string {
  const bp = runningProcesses.get(botId);
  if (!bp) return "";
  return bp.logs.join("");
}

export function startProcess(botId: number, command: string): BotProcess {
  const botDir = getBotDir(botId);

  if (!fs.existsSync(botDir)) {
    throw new Error(`Bot directory not found: ${botDir}`);
  }

  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  logger.info({ botId, command }, "Starting bot process");

  const child = spawn(cmd, args, {
    cwd: botDir,
    env: {
      ...process.env,
      // Performance: run in production mode so V8 optimizes fully
      NODE_ENV: "production",
      // Terminal color support
      TERM: "xterm-256color",
      FORCE_COLOR: "1",
      // Increase Node.js memory limit for heavy bots (2 GB)
      NODE_OPTIONS: "--max-old-space-size=2048",
      // Disable source maps in production for faster startup
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
    // Detached so the bot stays alive independently of the panel process tree
    detached: false,
  });

  const bp: BotProcess = {
    pid: child.pid ?? 0,
    botId,
    process: child,
    logs: [],
  };

  runningProcesses.set(botId, bp);

  // Raise bot process priority for snappier WhatsApp command responses
  if (bp.pid) {
    try {
      // -5 = higher priority (nice level), valid without root
      process.kill(bp.pid, 0); // confirm alive
      require("child_process").execSync(`renice -n -5 -p ${bp.pid} 2>/dev/null || true`);
    } catch {
      // non-fatal — priority boost is best-effort
    }
  }

  // Strip ANSI escape codes so the terminal shows clean text
  const stripAnsi = (str: string) =>
    str.replace(/\x1B(?:\[[0-9;]*[mGKHFJ]|\][^\x07]*\x07|[()][A-Z0-9])/g, "");

  const appendLog = (data: Buffer) => {
    const text = stripAnsi(data.toString());
    bp.logs.push(text);
    if (bp.logs.length > MAX_LOG_LINES) {
      bp.logs = bp.logs.slice(-MAX_LOG_LINES);
    }
    processEmitter.emit(`output:${botId}`, text);
  };

  child.stdout?.on("data", appendLog);
  child.stderr?.on("data", appendLog);

  child.on("exit", (code) => {
    logger.info({ botId, code }, "Bot process exited");
    processEmitter.emit(`exit:${botId}`, code);
    runningProcesses.delete(botId);
  });

  child.on("error", (err) => {
    logger.error({ botId, err }, "Bot process error");
    appendLog(Buffer.from(`\r\n[ERRO] ${err.message}\r\n`));
    processEmitter.emit(`exit:${botId}`, 1);
    runningProcesses.delete(botId);
  });

  return bp;
}

export function stopProcess(botId: number): boolean {
  const bp = runningProcesses.get(botId);
  if (!bp) return false;

  try {
    process.kill(bp.pid, "SIGTERM");
    // Force-kill after 5 s if still alive
    setTimeout(() => {
      if (isRunning(botId)) {
        try { process.kill(bp.pid, "SIGKILL"); } catch {}
      }
    }, 5000);
    return true;
  } catch (err) {
    logger.warn({ botId, err }, "Error stopping process");
    runningProcesses.delete(botId);
    return false;
  }
}

export function sendInput(botId: number, text: string): boolean {
  const bp = runningProcesses.get(botId);
  if (!bp || !bp.process.stdin) return false;
  try {
    bp.process.stdin.write(text + "\n");
    return true;
  } catch {
    return false;
  }
}
