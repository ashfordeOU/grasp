// Grasp Team Dashboard — WebSocket room-based sync server
// Attach to an existing http.Server; clients connect at ws://host:port/sync
//
// URL params (query string on connect):
//   room=<id>         room identifier (default: "default")
//   name=<string>     display name for this client
//   readonly=1        client can receive updates but cannot push them
//   password=<string> room password (checked against --room-secrets map)

import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';

interface SyncClient {
  ws:       WebSocket;
  room:     string;
  id:       string;
  name:     string;
  readonly: boolean;
}

interface SyncRoom {
  id:        string;
  clients:   Set<SyncClient>;
  workspace: any;  // last known workspace snapshot
}

const rooms = new Map<string, SyncRoom>();

function getOrCreateRoom(id: string): SyncRoom {
  if (!rooms.has(id)) rooms.set(id, { id, clients: new Set(), workspace: null });
  return rooms.get(id)!;
}

function presenceList(room: SyncRoom) {
  return Array.from(room.clients).map(c => ({ id: c.id, name: c.name, readonly: c.readonly }));
}

function broadcast(room: SyncRoom, msg: object, exclude?: SyncClient) {
  const json = JSON.stringify(msg);
  for (const client of room.clients) {
    if (client === exclude) continue;
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(json);
  }
}

export function attachSyncServer(httpServer: Server, roomSecrets: Record<string, string> = {}) {
  const wss = new WebSocketServer({ server: httpServer, path: '/sync' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const raw  = req.url ?? '/sync';
    const qs   = raw.includes('?') ? new URLSearchParams(raw.slice(raw.indexOf('?') + 1)) : new URLSearchParams();
    const roomId   = qs.get('room')     || 'default';
    const clientName = qs.get('name')   || 'Anonymous';
    const readonly = qs.get('readonly') === '1';
    const password = qs.get('password') || '';
    const clientId = Math.random().toString(36).slice(2, 10);

    // Password gate
    const expected = roomSecrets[roomId];
    if (expected && password !== expected) {
      ws.send(JSON.stringify({ type: 'error', code: 'WRONG_PASSWORD' }));
      ws.close();
      return;
    }

    const room: SyncRoom = getOrCreateRoom(roomId);
    const client: SyncClient = { ws, room: roomId, id: clientId, name: clientName, readonly };
    room.clients.add(client);

    // Send current state to the joining client
    ws.send(JSON.stringify({
      type:     'init',
      clientId,
      workspace: room.workspace,
      presence:  presenceList(room),
    }));

    // Notify existing clients of the new arrival
    broadcast(room, { type: 'presence', presence: presenceList(room) }, client);

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'workspace_update') {
          if (readonly) return; // read-only clients cannot push changes
          room.workspace = msg.workspace;
          broadcast(room, {
            type:      'workspace_update',
            workspace: msg.workspace,
            from:      { id: clientId, name: clientName },
          }, client);

        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch { /* ignore malformed messages */ }
    });

    ws.on('close', () => {
      room.clients.delete(client);
      broadcast(room, { type: 'presence', presence: presenceList(room) });
    });
  });

  return wss;
}

// REST API helpers — used by cli.ts route handlers
export function getRoomList() {
  return Array.from(rooms.values()).map(r => ({
    id:              r.id,
    clients:         r.clients.size,
    hasWorkspace:    r.workspace !== null,
  }));
}

export function getWorkspace(roomId: string) {
  return rooms.get(roomId)?.workspace ?? null;
}

export function setWorkspace(roomId: string, workspace: any) {
  const room = getOrCreateRoom(roomId);
  room.workspace = workspace;
}
