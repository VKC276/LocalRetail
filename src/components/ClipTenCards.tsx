import { useEffect, useRef, useState } from "react";

export type ClipStatusPayload = {
  type?: string;
  status?: string;
  message?: string;
  secondary_message?: string;
  status_color?: string;
  card_number_dec?: string;
  expiry_date?: string;
};

type Props = {
  kioskUrl: string;
  kioskId: string;
  /** Called when a clip/status result is shown (parent starts 5s home timer). */
  onResult: (data: ClipStatusPayload) => void;
  /** Called on websocket reading/status so idle timeout resets. */
  onActivity?: () => void;
};

const RESULT_HOME_MS = 5_000;
const READING_TIMEOUT_MS = 12_000;

function playSound(status: string | undefined, baseUrl: string) {
  if (!status || status === "RESTING") return;
  let file = "";
  if (status === "ACTIVE" || status === "TENCARD_CLIPPED_OK" || status === "TENCARD_READY") {
    file = "success.mp3";
  } else if (status === "EXPIRING_SOON" || status === "TENCARD_CLIPPED_LAST") {
    file = "warning.mp3";
  } else if (
    status === "EXPIRED" ||
    status === "NOT_FOUND" ||
    status === "INVALID_FORMAT" ||
    status === "TENCARD_EXHAUSTED" ||
    status === "TENCARD_CLIP_FAIL_EXHAUSTED" ||
    status === "TENCARD_CLIP_FAIL_UNKNOWN" ||
    status === "TENCARD_CLIP_ERROR" ||
    status === "CHECKIN_ERROR"
  ) {
    file = "failure.mp3";
  }
  if (!file) return;
  const audio = new Audio(`${baseUrl}/static/${file}`);
  audio.play().catch(() => {});
}

/**
 * Self-service 10-card clip UI on Retail.
 * Talks only to the vkc-kiosk Cloudflare Worker hub (WebSocket) — not the reception
 * carousel screen. After a status result, parent returns home after 5s.
 */
export default function ClipTenCards({ kioskUrl, kioskId, onResult, onActivity }: Props) {
  const base = kioskUrl.replace(/\/$/, "");
  const [phase, setPhase] = useState<"rest" | "reading" | "status">("rest");
  const [data, setData] = useState<ClipStatusPayload | null>(null);
  const [mainText, setMainText] = useState("Blippa ditt kort");
  const [secondary, setSecondary] = useState("");
  const readingToken = useRef(0);
  const phaseRef = useRef<"rest" | "reading" | "status">("rest");
  const lastPlayed = useRef<string | null>(null);
  const phaseTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const onResultRef = useRef(onResult);
  const onActivityRef = useRef(onActivity);
  onResultRef.current = onResult;
  onActivityRef.current = onActivity;

  const clearTimers = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (phaseTimer.current) window.clearTimeout(phaseTimer.current);
    hideTimer.current = null;
    phaseTimer.current = null;
  };

  const rest = () => {
    clearTimers();
    readingToken.current += 1;
    phaseRef.current = "rest";
    setPhase("rest");
    setData(null);
    setMainText("Blippa ditt kort");
    setSecondary("");
    lastPlayed.current = null;
  };

  const showStatus = (payload: ClipStatusPayload | null) => {
    clearTimers();
    readingToken.current += 1;
    if (!payload) {
      rest();
      return;
    }
    phaseRef.current = "status";
    setPhase("status");
    setData(payload);
    setMainText(payload.message || "");
    setSecondary(payload.secondary_message || "");
    const status = payload.status;
    if (status && status !== lastPlayed.current) {
      playSound(status, base);
      lastPlayed.current = status;
    }
    if (status === "TENCARD_CLIPPED_LAST") {
      phaseTimer.current = window.setTimeout(() => {
        setMainText("Lämna in kortet i reception");
        setSecondary("");
        setData((prev) => (prev ? { ...prev, status_color: "orange" } : prev));
      }, 3000);
    }
    onActivityRef.current?.();
    onResultRef.current(payload);
  };

  const showReading = (message?: string) => {
    if (phaseRef.current === "status") return;
    clearTimers();
    const token = ++readingToken.current;
    phaseRef.current = "reading";
    setPhase("reading");
    setData(null);
    setMainText(message || "Kortet läst, kontrollerar status");
    setSecondary("Vänta…");
    onActivityRef.current?.();
    hideTimer.current = window.setTimeout(() => {
      if (readingToken.current !== token) return;
      showStatus({
        type: "UNKNOWN",
        status: "CHECKIN_ERROR",
        message: "Det gick inte att klippa ditt kort.",
        secondary_message: "Prova igen.",
        status_color: "orange",
        card_number_dec: "",
      });
    }, READING_TIMEOUT_MS);
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: number | null = null;

    const connect = () => {
      if (closed) return;
      const proto = base.startsWith("https") ? "wss:" : "ws:";
      const host = base.replace(/^https?:\/\//, "");
      ws = new WebSocket(`${proto}//${host}/api/kiosk/ws?kiosk=${encodeURIComponent(kioskId)}`);
      ws.onmessage = (ev) => {
        if (ev.data === "pong") return;
        let msg: { type?: string; message?: string; data?: ClipStatusPayload };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === "reading") showReading(msg.message);
        else if (msg.type === "status") showStatus(msg.data || null);
        else if (msg.type === "clear") rest();
      };
      ws.onclose = () => {
        if (closed) return;
        retry = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimers();
      if (retry) window.clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect once per url/id
  }, [base, kioskId]);

  const color = phase === "reading" ? "blue" : phase === "status" ? data?.status_color || "" : "";
  const resting = phase === "rest";

  return (
    <div className={`clip-screen${color ? ` status-${color}` : ""}`}>
      <div className={`clip-box${resting ? " resting" : ""}`}>
        <h2>Klipp 10 kort</h2>
        <p className="clip-message">{mainText}</p>
        {secondary ? <p className="clip-secondary">{secondary}</p> : null}
        {data?.card_number_dec ? <p className="clip-meta">Kortnr: {data.card_number_dec}</p> : null}
        {data?.type === "MEMBER" && data.expiry_date ? (
          <p className="clip-meta">Giltig till: {String(data.expiry_date).split("T")[0]}</p>
        ) : null}
      </div>
    </div>
  );
}

export { RESULT_HOME_MS };
