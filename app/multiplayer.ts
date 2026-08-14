export type MultiplayerRole = "solo" | "host" | "guest";
export type PeerStatus = "idle" | "creating" | "waiting" | "joining" | "connecting" | "connected" | "disconnected" | "error";

type PeerHandlers = {
  onOpen: () => void;
  onMessage: (message: unknown) => void;
  onStatus: (status: PeerStatus, detail?: string) => void;
};

type SignalResponse = Record<string, unknown> & { error?: string };

async function signal(payload: Record<string, unknown>): Promise<SignalResponse> {
  const response = await fetch("/api/multiplayer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as SignalResponse;
  if (!response.ok) throw new Error(data.error || "Multiplayer service unavailable.");
  return data;
}

function waitForIce(connection: RTCPeerConnection, timeout = 7000) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      connection.removeEventListener("icegatheringstatechange", changed);
      clearTimeout(timer);
      resolve();
    };
    const changed = () => connection.iceGatheringState === "complete" && done();
    const timer = window.setTimeout(done, timeout);
    connection.addEventListener("icegatheringstatechange", changed);
  });
}

function makeConnection(handlers: PeerHandlers) {
  const connection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  connection.addEventListener("connectionstatechange", () => {
    if (connection.connectionState === "connected") handlers.onStatus("connected");
    if (["failed", "disconnected"].includes(connection.connectionState))
      handlers.onStatus("disconnected", "The other commander disconnected.");
  });
  return connection;
}

function bindChannel(channel: RTCDataChannel, handlers: PeerHandlers) {
  channel.binaryType = "arraybuffer";
  channel.addEventListener("open", handlers.onOpen);
  channel.addEventListener("close", () => handlers.onStatus("disconnected", "The other commander disconnected."));
  channel.addEventListener("message", (event) => {
    try { handlers.onMessage(JSON.parse(String(event.data))); }
    catch { /* Ignore malformed peer data. */ }
  });
}

export class PeerSession {
  constructor(
    readonly role: "host" | "guest",
    readonly code: string,
    readonly token: string,
    private connection: RTCPeerConnection,
    private channel: RTCDataChannel,
  ) {}

  get open() { return this.channel.readyState === "open"; }

  send(message: unknown) {
    if (this.open) this.channel.send(JSON.stringify(message));
  }

  close() {
    void signal({ action: "close", code: this.code, token: this.token }).catch(() => undefined);
    this.channel.close();
    this.connection.close();
  }
}

export async function hostRoom(fogEnabled: boolean, handlers: PeerHandlers) {
  handlers.onStatus("creating");
  const created = await signal({ action: "create", fogEnabled });
  const code = String(created.code);
  const hostToken = String(created.hostToken);
  const connection = makeConnection(handlers);
  const channel = connection.createDataChannel("frontier-command", { ordered: true });
  bindChannel(channel, handlers);
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await waitForIce(connection);
  await signal({ action: "offer", code, token: hostToken, description: JSON.stringify(connection.localDescription) });
  handlers.onStatus("waiting");

  let stopped = false;
  const poll = async () => {
    while (!stopped && connection.remoteDescription === null) {
      const status = await signal({ action: "poll", code, token: hostToken });
      if (typeof status.answer === "string" && status.answer) {
        await connection.setRemoteDescription(JSON.parse(status.answer) as RTCSessionDescriptionInit);
        handlers.onStatus("connecting");
        window.setTimeout(() => {
          if (connection.connectionState !== "connected") {
            handlers.onStatus("error", "The direct connection could not be established. Check that both players are online and try a new room.");
          }
        }, 20000);
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    }
  };
  void poll().catch((error) => handlers.onStatus("error", error instanceof Error ? error.message : "Connection failed."));
  const session = new PeerSession("host", code, hostToken, connection, channel);
  connection.addEventListener("connectionstatechange", () => { if (connection.connectionState === "closed") stopped = true; });
  return session;
}

export async function joinRoom(codeInput: string, handlers: PeerHandlers) {
  const code = codeInput.trim().toUpperCase();
  handlers.onStatus("joining");
  const joined = await signal({ action: "join", code });
  const guestToken = String(joined.guestToken);
  const connection = makeConnection(handlers);
  let channel: RTCDataChannel | null = null;
  connection.addEventListener("datachannel", (event) => {
    channel = event.channel;
    bindChannel(channel, handlers);
  });
  await connection.setRemoteDescription(JSON.parse(String(joined.offer)) as RTCSessionDescriptionInit);
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await waitForIce(connection);
  await signal({ action: "answer", code, token: guestToken, description: JSON.stringify(connection.localDescription) });
  handlers.onStatus("connecting");
  const started = performance.now();
  while (!channel && performance.now() - started < 20000)
    await new Promise((resolve) => window.setTimeout(resolve, 30));
  if (!channel) {
    connection.close();
    throw new Error("The direct connection could not be established. Check that both players are online and try a new room.");
  }
  return {
    session: new PeerSession("guest", code, guestToken, connection, channel),
    fogEnabled: joined.fogEnabled !== false,
  };
}
