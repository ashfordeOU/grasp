export interface CollabSocket {
  send(data: string): void;
  readyState: number;
  on(event: string, handler: () => void): void;
}

export class CollabRoom {
  private clients = new Map<string, CollabSocket>();
  constructor(public readonly sessionId: string) {}

  get clientCount(): number { return this.clients.size; }

  join(userId: string, ws: CollabSocket): void {
    this.clients.set(userId, ws);
    ws.on('close', () => this.clients.delete(userId));
  }

  broadcast(fromUserId: string, message: unknown): void {
    const payload = JSON.stringify(message);
    for (const [uid, ws] of this.clients) {
      if (uid !== fromUserId && ws.readyState === 1) ws.send(payload);
    }
  }
}

export class CollabServer {
  private rooms = new Map<string, CollabRoom>();

  getOrCreate(sessionId: string): CollabRoom {
    if (!this.rooms.has(sessionId)) this.rooms.set(sessionId, new CollabRoom(sessionId));
    return this.rooms.get(sessionId)!;
  }
}
