import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { processEmitter, getProcess } from "./lib/processManager";

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
});
