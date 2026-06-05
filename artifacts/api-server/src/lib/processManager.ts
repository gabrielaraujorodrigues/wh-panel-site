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

type DbRestartCallback = (botId: number, pid: number) => Promise<void>;
let _dbRestartCallback: DbRestartCallback | null = null;

export function setDbRestartCallback(cb: DbRestartCallback): void {
  _dbRestartCallback = cb;
}

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

export function startProcess(botId: number, command: string, autoRestart?: boolean): BotProcess {
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
      NODE_ENV: "production",
      TERM: "xterm-256color",
      FORCE_COLOR: "1",
      NODE_OPTIONS: "--max-old-space-size=2048",
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
    detached: false,
  });

  const bp: BotProcess = {
    pid: child.pid ?? 0,
    botId,
    process: child,
    logs: [],
  };

  runningProcesses.set(botId, bp);

  if (bp.pid) {
    try {
      process.kill(bp.pid, 0);
      require("child_process").execSync(`renice -n -5 -p ${bp.pid} 2>/dev/null || true`);
    } catch {
      // non-fatal
    }
  }

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

    if (autoRestart && code !== 0) {
      logger.info({ botId }, "Auto-restarting bot after crash");
      setTimeout(async () => {
        try {
          const restarted = startProcess(botId, command, autoRestart);
          if (_dbRestartCallback && restarted.pid) {
            await _dbRestartCallback(botId, restarted.pid);
          }
        } catch (err) {
          logger.error({ botId, err }, "Auto-restart failed");
        }
      }, 3000);
    }
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
