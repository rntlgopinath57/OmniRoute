function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

async function signHs256(secret: string, signingInput: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return base64UrlBytes(new Uint8Array(signature));
}

export default async function livekitTokenHandler(request: Request, env: {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const serverUrl = String(env.LIVEKIT_URL || "").trim();
  const apiKey = String(env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET || "").trim();
  if (!serverUrl || !apiKey || !apiSecret) {
    return Response.json({ error: "LiveKit is not configured" }, { status: 503 });
  }

  const now = Math.floor(Date.now() / 1000);
  const roomName = `nandi-${crypto.randomUUID()}`;
  const participantIdentity = `user-${crypto.randomUUID()}`;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: participantIdentity,
    nbf: now - 5,
    exp: now + 10 * 60,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
    roomConfig: {
      agents: [{ agentName: "nandi-livekit-proof" }],
    },
  };

  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await signHs256(apiSecret, signingInput);
  const participantToken = `${signingInput}.${signature}`;

  return Response.json(
    {
      server_url: serverUrl,
      participant_token: participantToken,
      room_name: roomName,
      participant_identity: participantIdentity,
      agent_name: "nandi-livekit-proof",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
