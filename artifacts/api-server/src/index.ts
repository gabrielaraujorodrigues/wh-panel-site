import http from "http";
import { execSync, exec } from "child_process";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { processEmitter, getProcess, getBotDir, ensureBotsDir } from "./lib/processManager";
import { db } from "@workspace/db";
import { botsTable } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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

// Ao iniciar, clona automaticamente qualquer bot que está no banco mas não tem diretório
async function startupBotRestore() {
  try {
    ensureBotsDir();
    const bots = await db.select().from(botsTable);
    if (!bots.length) return;

    logger.info({ count: bots.length }, "Startup: checking bot directories");

    for (const bot of bots) {
      const botDir = getBotDir(bot.id);
      if (!fs.existsSync(botDir)) {
        logger.info({ botId: bot.id, name: bot.name }, "Startup: auto-cloning missing bot");
        const cloneUrl = buildCloneUrl(bot.gitUrl, bot.gitToken);
        try {
          execSync(`git clone "${cloneUrl}" "${botDir}"`, {
            timeout: 120000,
            stdio: "pipe",
          });
          logger.info({ botId: bot.id }, "Startup: bot cloned OK");

          // Instala dependências em background (não bloqueia o startup)
          const rawInstall = (bot.installCommand || "").trim();
          // Se o comando de install for falso (echo, empty), usa npm como fallback real
          const isRealInstall = rawInstall && !rawInstall.startsWith("echo ");
          const installCmd = isRealInstall
            ? rawInstall
            : "npm install --legacy-peer-deps --ignore-engines --ignore-scripts";

          exec(installCmd, { cwd: botDir, timeout: 300000 }, (err) => {
            if (err) {
              logger.warn({ botId: bot.id }, "Startup: npm install failed, trying yarn...");
              exec(
                "yarn install --ignore-engines --network-timeout 60000",
                { cwd: botDir, timeout: 300000 },
                (err2) => {
                  if (err2) logger.warn({ botId: bot.id, msg: err2.message }, "Startup: yarn also failed");
                  else logger.info({ botId: bot.id }, "Startup: yarn install succeeded");
                },
              );
            } else {
              logger.info({ botId: bot.id }, "Startup: deps installed OK");
            }
          });
        } catch (err) {
          logger.error({ botId: bot.id, err }, "Startup: auto-clone failed");
        }
      } else {
        logger.info({ botId: bot.id, name: bot.name }, "Startup: bot dir exists, skipping clone");
      }
    }
  } catch (err) {
    logger.error({ err }, "Startup bot restore error");
  }
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = req.url ?? "";
  const match = url.match(/\/ws\/bots\/(\d+)\/terminal/);

  if (!match) {
    ws.close(1008, "Invalid path");
    return;
  }

  const botId = Number(match[1]);
  logger.info({ botId }, "WebSocket terminal connected");

  const existingProcess = getProcess(botId);
  if (existingProcess && existingProcess.logs.length > 0) {
    ws.send(JSON.stringify({ type: "output", data: existingProcess.logs.join("") }));
  }

  const onOutput = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "output", data }));
    }
  };

  const onExit = (code: number | null) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "exit", code }));
    }
  };

  processEmitter.on(`output:${botId}`, onOutput);
  processEmitter.on(`exit:${botId}`, onExit);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "input" && typeof msg.data === "string") {
        const bp = getProcess(botId);
        if (bp?.process.stdin) {
          bp.process.stdin.write(msg.data);
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    processEmitter.off(`output:${botId}`, onOutput);
    processEmitter.off(`exit:${botId}`, onExit);
    logger.info({ botId }, "WebSocket terminal disconnected");
  });
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  // Restaura bots após o servidor subir (não bloqueia o listen)
  startupBotRestore().catch((e) =>
    logger.error({ err: e }, "startupBotRestore uncaught error"),
  );
});
