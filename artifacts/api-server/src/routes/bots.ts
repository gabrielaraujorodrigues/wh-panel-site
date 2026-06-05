import { Router, type IRouter } from "express";
import { execSync, exec } from "child_process";
import fs from "fs";
import { db } from "@workspace/db";
import { botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateBotBody,
  UpdateBotBody,
  UpdateBotParams,
  GetBotParams,
  DeleteBotParams,
  StartBotParams,
  StopBotParams,
  RestartBotParams,
  PullBotParams,
  SendTerminalInputParams,
  SendTerminalInputBody,
  GetBotLogsParams,
  InstallBotDepsParams,
} from "@workspace/api-zod";
import {
  getBotDir,
  ensureBotsDir,
  startProcess,
  stopProcess,
  isRunning,
  getLogs,
  sendInput,
  setDbRestartCallback,
} from "../lib/processManager";

const router: IRouter = Router();

setDbRestartCallback(async (botId, pid) => {
  await db
    .update(botsTable)
    .set({ status: "running", pid, updatedAt: new Date() })
    .where(eq(botsTable.id, botId));
});

function buildCloneUrl(gitUrl: string, gitToken?: string | null): string {
  if (!gitToken) return gitUrl;
  try {
    const u = new URL(gitUrl);
    u.username = gitToken;
    u.password = "";
    return u.toString();
  } catch {
    return gitUrl;
  }
}

function formatBot(bot: typeof botsTable.$inferSelect) {
  return {
    id: bot.id,
    name: bot.name,
    gitUrl: bot.gitUrl,
    command: bot.command,
    status: bot.status,
    pid: bot.pid ?? null,
    autoRestart: bot.autoRestart,
    gitToken: bot.gitToken ?? null,
    installCommand: bot.installCommand ?? null,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
  };
}

// ─── System info ────────────────────────────────────────────────────────────

router.get("/system/info", (_req, res) => {
  return res.json({
    nodeVersion: process.version,
    platform: process.platform,
  });
});

// ─── In-memory cache for GET /bots (1 s TTL) ────────────────────────────────
let _botsCache: { data: ReturnType<typeof formatBot>[]; ts: number } | null = null;
function invalidateBotsCache() { _botsCache = null; }

// ─── List bots ───────────────────────────────────────────────────────────────

router.get("/bots", async (req, res) => {
  try {
    if (_botsCache && Date.now() - _botsCache.ts < 1000) {
      res.setHeader("Cache-Control", "no-store");
      return res.json(_botsCache.data);
    }
    const bots = await db.select().from(botsTable).orderBy(botsTable.id);
    for (const bot of bots) {
      if (!isRunning(bot.id, bot.pid) && (bot.status === "running" || bot.status === "starting")) {
        bot.status = "stopped";
        bot.pid = null;
      }
    }
    const result = bots.map(formatBot);
    _botsCache = { data: result, ts: Date.now() };
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list bots");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Create bot ──────────────────────────────────────────────────────────────

router.post("/bots", async (req, res) => {
  try {
    const body = CreateBotBody.parse(req.body);
    ensureBotsDir();

    const [bot] = await db.insert(botsTable).values({
      name: body.name,
      gitUrl: body.gitUrl,
      command: body.command,
      status: "stopped",
      autoRestart: body.autoRestart ?? true,
      gitToken: body.gitToken ?? null,
      installCommand: body.installCommand ?? null,
    }).returning();

    const botDir = getBotDir(bot.id);
    const cloneUrl = buildCloneUrl(body.gitUrl, body.gitToken);

    invalidateBotsCache();
    res.status(201).json(formatBot(bot));

    try {
      execSync(`git clone "${cloneUrl}" "${botDir}"`, { timeout: 120000 });
      req.log.info({ botId: bot.id }, "Bot repository cloned");
    } catch (cloneErr) {
      req.log.error({ err: cloneErr, botId: bot.id }, "Failed to clone repository");
      await db.update(botsTable)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(botsTable.id, bot.id));
    }
    return;
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create bot");
    if (err instanceof Error && err.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Get bot ─────────────────────────────────────────────────────────────────

router.get("/bots/:id", async (req, res) => {
  try {
    const { id } = GetBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });
    if (!isRunning(id, bot.pid) && (bot.status === "running" || bot.status === "starting")) {
      bot.status = "stopped";
      bot.pid = null;
      await db.update(botsTable).set({ status: "stopped", pid: null, updatedAt: new Date() }).where(eq(botsTable.id, id));
    }
    return res.json(formatBot(bot));
  } catch (err) {
    req.log.error({ err }, "Failed to get bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Update bot ──────────────────────────────────────────────────────────────

router.patch("/bots/:id", async (req, res) => {
  try {
    const { id } = UpdateBotParams.parse({ id: Number(req.params.id) });
    const body = UpdateBotBody.parse(req.body);
    const [existing] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Bot not found" });

    const updates: Partial<typeof botsTable.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.command !== undefined) updates.command = body.command;
    if (body.gitUrl !== undefined) updates.gitUrl = body.gitUrl;
    if (body.autoRestart !== undefined) updates.autoRestart = body.autoRestart;
    if (body.gitToken !== undefined) updates.gitToken = body.gitToken;
    if (body.installCommand !== undefined) updates.installCommand = body.installCommand;

    const [updated] = await db.update(botsTable).set(updates).where(eq(botsTable.id, id)).returning();
    invalidateBotsCache();
    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Delete bot ──────────────────────────────────────────────────────────────

router.delete("/bots/:id", async (req, res) => {
  try {
    const { id } = DeleteBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    if (isRunning(id)) stopProcess(id);

    const botDir = getBotDir(id);
    if (fs.existsSync(botDir)) {
      fs.rmSync(botDir, { recursive: true, force: true });
    }

    await db.delete(botsTable).where(eq(botsTable.id, id));
    invalidateBotsCache();
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

router.post("/bots/:id/start", async (req, res) => {
  try {
    const { id } = StartBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    if (isRunning(id)) {
      return res.json(formatBot({ ...bot, status: "running" }));
    }

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Diretório do bot não encontrado. Clone o repositório primeiro." });
    }

    const bp = startProcess(id, bot.command, bot.autoRestart);
    const [updated] = await db.update(botsTable)
      .set({ status: "running", pid: bp.pid, updatedAt: new Date() })
      .where(eq(botsTable.id, id))
      .returning();

    invalidateBotsCache();
    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to start bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Stop ────────────────────────────────────────────────────────────────────

router.post("/bots/:id/stop", async (req, res) => {
  try {
    const { id } = StopBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    stopProcess(id);
    const [updated] = await db.update(botsTable)
      .set({ status: "stopped", pid: null, updatedAt: new Date() })
      .where(eq(botsTable.id, id))
      .returning();

    invalidateBotsCache();
    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to stop bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Restart ─────────────────────────────────────────────────────────────────

router.post("/bots/:id/restart", async (req, res) => {
  try {
    const { id } = RestartBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    stopProcess(id);
    await new Promise(r => setTimeout(r, 500));

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Diretório do bot não encontrado." });
    }

    const bp = startProcess(id, bot.command, bot.autoRestart);
    const [updated] = await db.update(botsTable)
      .set({ status: "running", pid: bp.pid, updatedAt: new Date() })
      .where(eq(botsTable.id, id))
      .returning();

    invalidateBotsCache();
    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to restart bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Install deps ────────────────────────────────────────────────────────────

router.post("/bots/:id/install", async (req, res) => {
  try {
    const { id } = InstallBotDepsParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Diretório do bot não encontrado." });
    }

    let installCmd = bot.installCommand;
    if (!installCmd) {
      const hasYarn = fs.existsSync(`${botDir}/yarn.lock`);
      const hasPnpm = fs.existsSync(`${botDir}/pnpm-lock.yaml`);
      installCmd = hasPnpm ? "pnpm install" : hasYarn ? "yarn install" : "npm install --legacy-peer-deps --ignore-engines";
    }

    exec(installCmd, { cwd: botDir, timeout: 300000 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim() || "Concluído.";
      if (err) req.log.error({ err, botId: id }, "Install failed");
      res.json({ output });
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to install deps");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Git pull ────────────────────────────────────────────────────────────────

router.post("/bots/:id/pull", async (req, res) => {
  try {
    const { id } = PullBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Repositório não clonado ainda." });
    }

    const token = bot.gitToken;
    const pullCmd = token
      ? `git -C "${botDir}" -c credential.helper= -c http.extraHeader="Authorization: Bearer ${token}" pull`
      : `git -C "${botDir}" pull`;

    exec(pullCmd, { timeout: 60000 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim() || "Already up to date.";
      if (err) req.log.error({ err, botId: id }, "Git pull failed");
      res.json({ output });
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to pull bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Terminal input ──────────────────────────────────────────────────────────

router.post("/bots/:id/terminal/input", async (req, res) => {
  try {
    const { id } = SendTerminalInputParams.parse({ id: Number(req.params.id) });
    const body = SendTerminalInputBody.parse(req.body);
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const ok = sendInput(id, body.text);
    return res.json({ ok });
  } catch (err) {
    req.log.error({ err }, "Failed to send input");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Logs ────────────────────────────────────────────────────────────────────

router.get("/bots/:id/logs", async (req, res) => {
  try {
    const { id } = GetBotLogsParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const logs = getLogs(id);
    return res.json({ logs });
  } catch (err) {
    req.log.error({ err }, "Failed to get logs");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
