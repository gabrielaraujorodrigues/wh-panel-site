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
} from "../lib/processManager";

const router: IRouter = Router();

function formatBot(bot: typeof botsTable.$inferSelect) {
  return {
    id: bot.id,
    name: bot.name,
    gitUrl: bot.gitUrl,
    command: bot.command,
    status: bot.status,
    pid: bot.pid ?? null,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
  };
}

router.get("/bots", async (req, res) => {
  try {
    const bots = await db.select().from(botsTable).orderBy(botsTable.id);
    for (const bot of bots) {
      if (!isRunning(bot.id) && (bot.status === "running" || bot.status === "starting")) {
        bot.status = "stopped";
        bot.pid = null;
      }
    }
    return res.json(bots.map(formatBot));
  } catch (err) {
    req.log.error({ err }, "Failed to list bots");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bots", async (req, res) => {
  try {
    const body = CreateBotBody.parse(req.body);
    ensureBotsDir();

    const [bot] = await db.insert(botsTable).values({
      name: body.name,
      gitUrl: body.gitUrl,
      command: body.command,
      status: "stopped",
    }).returning();

    const botDir = getBotDir(bot.id);

    res.status(201).json(formatBot(bot));

    try {
      execSync(`git clone "${body.gitUrl}" "${botDir}"`, { timeout: 120000 });
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

router.get("/bots/:id", async (req, res) => {
  try {
    const { id } = GetBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });
    if (!isRunning(id) && (bot.status === "running" || bot.status === "starting")) {
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

    const [updated] = await db.update(botsTable).set(updates).where(eq(botsTable.id, id)).returning();
    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

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
    return res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

    const bp = startProcess(id, bot.command);
    const [updated] = await db.update(botsTable)
      .set({ status: "running", pid: bp.pid, updatedAt: new Date() })
      .where(eq(botsTable.id, id))
      .returning();

    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to start bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to stop bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bots/:id/restart", async (req, res) => {
  try {
    const { id } = RestartBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    stopProcess(id);
    await new Promise(r => setTimeout(r, 1500));

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Diretório do bot não encontrado." });
    }

    const bp = startProcess(id, bot.command);
    const [updated] = await db.update(botsTable)
      .set({ status: "running", pid: bp.pid, updatedAt: new Date() })
      .where(eq(botsTable.id, id))
      .returning();

    return res.json(formatBot(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to restart bot");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bots/:id/install", async (req, res) => {
  try {
    const { id } = InstallBotDepsParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Diretório do bot não encontrado. Clone o repositório primeiro." });
    }

    const hasYarn = fs.existsSync(`${botDir}/yarn.lock`);
    const hasPnpm = fs.existsSync(`${botDir}/pnpm-lock.yaml`);
    const installCmd = hasPnpm ? "pnpm install" : hasYarn ? "yarn install" : "npm install";

    exec(installCmd, { cwd: botDir, timeout: 180000 }, (err, stdout, stderr) => {
      const output = (stdout + stderr).trim() || "Done.";
      if (err) req.log.error({ err, botId: id }, "Install failed");
      res.json({ output });
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to install deps");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bots/:id/pull", async (req, res) => {
  try {
    const { id } = PullBotParams.parse({ id: Number(req.params.id) });
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const botDir = getBotDir(id);
    if (!fs.existsSync(botDir)) {
      return res.status(400).json({ error: "Repositório não clonado ainda." });
    }

    exec(`git -C "${botDir}" pull`, { timeout: 60000 }, (err, stdout, stderr) => {
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
