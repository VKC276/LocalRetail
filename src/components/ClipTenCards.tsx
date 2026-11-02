import { useEffect, useRef, useState } from "react";

export type ClipStatusPayload = {
  type?: string;
  status?: string;
  message?: string;
  secondary_message?: string;
  status_color?: string;
  card_number_dec?: string;
  expiry_date?: string;
  klipp_kvar_local?: number;
};

type Props = {
  kioskUrl: string;
  kioskId: string;
  /** Called when a clip/status result is shown (activity / logging). */
  onResult: (data: ClipStatusPayload) => void;
  /** Called after a successful clip OK screen has been shown. */
  onClipSuccessHome?: () => void;
  /** Called on websocket reading/status so idle timeout resets. */
  onActivity?: () => void;
};

/** Hur länge grön OK visas innan startsidan. */
const CLIP_OK_HOME_MS = 2_500;
/** Övriga statusar (fel m.m.) innan åter till Blippa. */
const RESULT_REST_MS = 5_000;
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
 * Blipp → visa saldo → användaren trycker "Klipp en markering" → Worker klipper via WS.
 */
export default function ClipTenCards({ kioskUrl, kioskId, onResult, onClipSuccessHome, onActivity }: Props) {
  const base = kioskUrl.replace(/\/$/, "");
  const [phase, setPhase] = useState<"rest" | "reading" | "ready" | "status">("rest");
  const [data, setData] = useState<ClipStatusPayload | null>(null);
  const [mainText, setMainText] = useState("Blippa ditt kort");
  const [secondary, setSecondary] = useState("");
  const [clipBusy, setClipBusy] = useState(false);
  const readingToken = useRef(0);
  const phaseRef = useRef<"rest" | "reading" | "ready" | "status">("rest");
  const lastPlayed = useRef<string | null>(null);
  const phaseTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onResultRef = useRef(onResult);
  const onClipSuccessHomeRef = useRef(onClipSuccessHome);
  const onActivityRef = useRef(onActivity);
  onResultRef.current = onResult;
  onClipSuccessHomeRef.current = onClipSuccessHome;
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
    setClipBusy(false);
    lastPlayed.current = null;
  };

  const showReady = (payload: ClipStatusPayload) => {
    clearTimers();
    readingToken.current += 1;
    phaseRef.current = "ready";
    setPhase("ready");
    setData(payload);
    setMainText(payload.message || "Du har klipp kvar.");
    setSecondary(payload.secondary_message || "Tryck på knappen för att klippa.");
    setClipBusy(false);
    const status = payload.status;
    if (status && status !== lastPlayed.current) {
      playSound(status, base);
      lastPlayed.current = status;
    }
    onActivityRef.current?.();
    onResultRef.current(payload);
  };

  const showStatus = (payload: ClipStatusPayload | null) => {
    clearTimers();
    readingToken.current += 1;
    if (!payload) {
      rest();
      return;
    }
    if (payload.status === "TENCARD_READY") {
      showReady(payload);
      return;
    }
    const status = payload.status;
    const clipOk = status === "TENCARD_CLIPPED_OK" || status === "TENCARD_CLIPPED_LAST";
    const displayPayload =
      clipOk ? { ...payload, status_color: "green" } : payload;

    phaseRef.current = "status";
    setPhase("status");
    setData(displayPayload);
    setMainText(displayPayload.message || "");
    setSecondary(
      status === "TENCARD_CLIPPED_LAST"
        ? "Lämna in kortet i reception"
        : displayPayload.secondary_message || "",
    );
    setClipBusy(false);
    if (status && status !== lastPlayed.current) {
      playSound(status, base);
      lastPlayed.current = status;
    }
    onActivityRef.current?.();
    onResultRef.current(payload);

    if (clipOk) {
      // Grön OK först, sedan startsidan.
      hideTimer.current = window.setTimeout(() => {
        onClipSuccessHomeRef.current?.();
      }, CLIP_OK_HOME_MS);
      return;
    }

    hideTimer.current = window.setTimeout(() => rest(), RESULT_REST_MS);
  };

  const showReading = (message?: string) => {
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
        message: "Det gick inte att läsa ditt kort.",
        secondary_message: "Prova igen.",
        status_color: "orange",
        card_number_dec: "",
      });
    }, READING_TIMEOUT_MS);
  };

  const confirmClip = () => {
    if (clipBusy || phaseRef.current !== "ready") return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showStatus({
        type: "UNKNOWN",
        status: "CHECKIN_ERROR",
        message: "Ingen anslutning till klipp-tjänsten.",
        secondary_message: "Prova igen om en stund.",
        status_color: "orange",
        card_number_dec: data?.card_number_dec || "",
      });
      return;
    }
    setClipBusy(true);
    showReading("Klipper markering…");
    try {
      ws.send(JSON.stringify({ type: "confirm_clip" }));
    } catch {
      showStatus({
        type: "UNKNOWN",
        status: "CHECKIN_ERROR",
        message: "Kunde inte skicka klipp.",
        secondary_message: "Prova igen.",
        status_color: "orange",
        card_number_dec: data?.card_number_dec || "",
      });
    }
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
      wsRef.current = ws;
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
        if (wsRef.current === ws) wsRef.current = null;
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
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect once per url/id
  }, [base, kioskId]);

  const color =
    phase === "reading" ? "blue" : phase === "ready" || phase === "status" ? data?.status_color || "" : "";
  const resting = phase === "rest";
  const showClipButton = phase === "ready" && data?.status === "TENCARD_READY";
  const remaining =
    typeof data?.klipp_kvar_local === "number"
      ? data.klipp_kvar_local
      : null;

  return (
    <div className={`clip-screen${color ? ` status-${color}` : ""}`}>
      <div className="clip-panel">
        <div className={`clip-box${resting ? " resting" : ""}`}>
          <h2>Klipp 10 kort</h2>
          {showClipButton && remaining != null ? (
            <>
              <p className="clip-remaining-label">Klipp kvar</p>
              <p className="clip-remaining-value">{remaining}</p>
              {secondary ? <p className="clip-secondary">{secondary}</p> : null}
            </>
          ) : (
            <>
              <p className="clip-message">{mainText}</p>
              {secondary ? <p className="clip-secondary">{secondary}</p> : null}
            </>
          )}
          {data?.card_number_dec ? <p className="clip-meta">Kortnr: {data.card_number_dec}</p> : null}
          {data?.type === "MEMBER" && data.expiry_date ? (
            <p className="clip-meta">Giltig till: {String(data.expiry_date).split("T")[0]}</p>
          ) : null}
        </div>
        {showClipButton ? (
          <button type="button" className="clip-confirm-btn" onClick={confirmClip} disabled={clipBusy}>
            Klipp en markering
          </button>
        ) : null}
      </div>
    </div>
  );
}

export { RESULT_REST_MS, CLIP_OK_HOME_MS };
