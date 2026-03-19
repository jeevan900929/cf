import { DurableObject } from "cloudflare:workers";
import type { RoomWsMessage } from "../../shared/types/room";

export class Room extends DurableObject<Env> {
  private count = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        state_before INTEGER NOT NULL,
        state_after INTEGER NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
    const row = ctx.storage.sql
      .exec("SELECT state_after FROM room_events ORDER BY id DESC LIMIT 1")
      .toArray();
    if (row.length > 0) {
      this.count = row[0].state_after as number;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      this.broadcast({ type: "join", count: this.count, connectedClients: this.ctx.getWebSockets().length });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (request.method === "GET" && url.pathname === "/state") {
      return Response.json({
        count: this.count,
        connectedClients: this.ctx.getWebSockets().length,
      });
    }

    if (request.method === "GET" && url.pathname === "/history") {
      const events = this.ctx.storage.sql
        .exec("SELECT * FROM room_events ORDER BY id DESC LIMIT 50")
        .toArray();
      return Response.json({ events });
    }

    if (request.method === "POST" && url.pathname === "/action") {
      const { type } = (await request.json()) as { type: string };
      const actor = url.searchParams.get("actor") ?? "anonymous";
      const before = this.count;

      switch (type) {
        case "increment":
          this.count++;
          break;
        case "decrement":
          this.count--;
          break;
        case "reset":
          this.count = 0;
          break;
        default:
          return Response.json({ ok: false, error: `Unknown action: ${type}` }, { status: 400 });
      }

      this.ctx.storage.sql.exec(
        "INSERT INTO room_events (type, actor, state_before, state_after, timestamp) VALUES (?, ?, ?, ?, ?)",
        type,
        actor,
        before,
        this.count,
        new Date().toISOString(),
      );

      const msg: RoomWsMessage = {
        type: "action",
        count: this.count,
        connectedClients: this.ctx.getWebSockets().length,
        action: type,
        actor,
      };
      this.broadcast(msg);

      return Response.json({ ok: true, count: this.count, action: type });
    }

    return Response.json({ ok: false, error: "Not Found" }, { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Clients can send actions via WebSocket too
    if (typeof message !== "string") return;
    try {
      const { type, actor } = JSON.parse(message) as { type: string; actor?: string };
      const before = this.count;

      switch (type) {
        case "increment":
          this.count++;
          break;
        case "decrement":
          this.count--;
          break;
        case "reset":
          this.count = 0;
          break;
        default:
          return;
      }

      this.ctx.storage.sql.exec(
        "INSERT INTO room_events (type, actor, state_before, state_after, timestamp) VALUES (?, ?, ?, ?, ?)",
        type,
        actor ?? "ws-client",
        before,
        this.count,
        new Date().toISOString(),
      );

      this.broadcast({
        type: "action",
        count: this.count,
        connectedClients: this.ctx.getWebSockets().length,
        action: type,
        actor: actor ?? "ws-client",
      });
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.broadcast({
      type: "leave",
      count: this.count,
      connectedClients: this.ctx.getWebSockets().length - 1,
    });
  }

  private broadcast(message: RoomWsMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Client may have disconnected
      }
    }
  }
}
