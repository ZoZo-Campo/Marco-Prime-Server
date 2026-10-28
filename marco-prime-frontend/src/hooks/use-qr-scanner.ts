import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import jsQR from "jsqr";

// Cadence minimale entre deux analyses (ms). Le véritable coût est le temps de
// décodage : on ajoute cette pause APRÈS chaque analyse pour ne jamais empiler.
const DETECT_INTERVAL_MS = 30;
const AUTO_CLOSE_MS = 30_000;
const HAVE_CURRENT_DATA = 2;
// On n'analyse que le carré central (la zone visée par le cadre). La taille de
// décodage est LE facteur de vitesse : jsQR coûte ~quadratiquement le nombre de
// pixels et le processeur de la tablette est lent (mesures réelles : 480 px ≈
// 1,6 s/frame sur une scène normale, jusqu'à 16 s sur une scène texturée !).
// Le QR ne contient qu'un numéro de carte (10 chiffres max) : 160 px suffisent
// et divisent le temps de décodage par ~2. Si le QR est petit/éloigné, on
// repasse automatiquement à 224 px après 1,5 s sans détection.
const FAST_DECODE_DIMENSION = 160;
const FALLBACK_DECODE_DIMENSION = 224;
const FALLBACK_AFTER_MS = 1_500;
// Un QR classique est sombre sur clair : l'analyse « dontInvert » suffit et va
// ~2× plus vite. On tente l'inversion (QR clair sur sombre) ponctuellement.
const INVERT_RETRY_MS = 1_200;
// Par défaut on ne coupe pas la caméra tant qu'on est sur l'écran Achats
// (0 = pas d'extinction automatique). Voir l'option `warmIdleMs` pour un délai.
const DEFAULT_WARM_IDLE_MS = 0;

// Autofocus continu : non standard mais reconnu par la plupart des navigateurs
// Android (Bromite/Chrome). Passé en « ideal » pour ne jamais faire échouer
// l'ouverture si la caméra ne le gère pas.
type FocusConstraints = MediaTrackConstraints & { focusMode?: ConstrainDOMString };

const VIDEO_CONSTRAINTS: FocusConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 640 },
  height: { ideal: 480 },
  focusMode: { ideal: "continuous" },
};

const FOCUS_ADVANCED = {
  advanced: [{ focusMode: "continuous" }],
} as unknown as MediaTrackConstraints;

function cameraSupported() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/**
 * L'autorisation caméra a-t-elle déjà été accordée ? Le préchauffage ne doit
 * jamais déclencher la demande d'autorisation : sur un téléphone, elle
 * s'afficherait à l'ouverture de la page d'achat, sans action de l'utilisateur.
 */
async function cameraAlreadyGranted() {
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

export interface QrScannerOptions {
  // Garde le flux caméra ouvert entre deux scans (le gros gain de rapidité).
  keepWarm?: boolean;
  // Extinction automatique après N ms sans scan (0 = jamais, libérée seulement
  // au démontage de l'écran). Utile pour la batterie/LED en cas d'appareil laissé
  // allumé longtemps.
  warmIdleMs?: number;
}

export interface QrScanner {
  supported: boolean;
  active: boolean;
  ready: boolean;
  error: string | null;
  videoRef: RefObject<HTMLVideoElement>;
  start: () => void;
  stop: () => void;
  warm: () => void;
}

/**
 * Lecture de QR code 100 % JavaScript (jsQR) à partir des images de la caméra.
 * On n'utilise pas l'API BarcodeDetector : elle est présente dans certains
 * navigateurs Android mais y renvoie souvent des résultats vides, ce qui donnait
 * une caméra qui s'ouvre sans jamais détecter de code.
 */
export function useQrScanner(
  onResult: (text: string) => void,
  options: QrScannerOptions = {},
): QrScanner {
  const keepWarm = options.keepWarm ?? true;
  const warmIdleMs = options.warmIdleMs ?? DEFAULT_WARM_IDLE_MS;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const acquiringRef = useRef<Promise<MediaStream | null> | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const autoCloseRef = useRef<number | undefined>(undefined);
  const warmReleaseRef = useRef<number | undefined>(undefined);
  const onResultRef = useRef(onResult);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  onResultRef.current = onResult;
  const supported = cameraSupported();

  const activeRef = useRef(active);
  activeRef.current = active;

  // Libère complètement la caméra et les minuteurs.
  const release = () => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(autoCloseRef.current);
    window.clearTimeout(warmReleaseRef.current);
    timerRef.current = undefined;
    autoCloseRef.current = undefined;
    warmReleaseRef.current = undefined;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  };

  const releaseRef = useRef(release);
  releaseRef.current = release;

  // Après un scan / une fermeture : soit on garde la caméra chaude, soit on la
  // coupe (éventuellement après un délai d'inactivité).
  const scheduleWarmRelease = () => {
    window.clearTimeout(warmReleaseRef.current);
    warmReleaseRef.current = undefined;
    if (!keepWarm) {
      release();
      return;
    }
    if (warmIdleMs > 0) {
      warmReleaseRef.current = window.setTimeout(release, warmIdleMs);
    }
  };

  // Ouvre la caméra si nécessaire, sinon réutilise le flux déjà chaud.
  const acquire = (): Promise<MediaStream | null> => {
    const existing = streamRef.current;
    if (existing && existing.getTracks().some((t) => t.readyState === "live")) {
      return Promise.resolve(existing);
    }
    if (acquiringRef.current) return acquiringRef.current;

    const promise = navigator.mediaDevices
      .getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false })
      .then(async (stream) => {
        const [track] = stream.getVideoTracks();
        if (track) {
          track.addEventListener("ended", () => {
            if (streamRef.current === stream) {
              streamRef.current = null;
              setReady(false);
            }
          });
          try {
            await track.applyConstraints(FOCUS_ADVANCED);
          } catch {
            /* autofocus continu non supporté : on garde la config par défaut */
          }
        }
        streamRef.current = stream;
        setReady(true);
        setError(null);
        return stream;
      })
      .catch(() => {
        setError("Impossible d'ouvrir la caméra. Vérifiez qu'elle est autorisée.");
        return null;
      })
      .finally(() => {
        acquiringRef.current = null;
      });

    acquiringRef.current = promise;
    return promise;
  };

  const start = async () => {
    if (active) return;
    setError(null);
    window.clearTimeout(warmReleaseRef.current);
    warmReleaseRef.current = undefined;

    if (!cameraSupported()) {
      setError("Cette tablette ne propose pas de caméra utilisable.");
      return;
    }

    const stream = await acquire();
    if (!stream || stream.getVideoTracks().length === 0) return;
    setActive(true);
  };

  // Pré-ouvre la caméra sans afficher la modale, pour que le premier scan soit
  // instantané. Appelé au montage de l'écran Achats.
  const warm = () => {
    if (!cameraSupported() || activeRef.current) return;
    window.clearTimeout(warmReleaseRef.current);
    warmReleaseRef.current = undefined;
    void (async () => {
      if (!(await cameraAlreadyGranted()) || activeRef.current) return;
      const stream = await acquire();
      if (stream && !activeRef.current) scheduleWarmRelease();
    })();
  };

  const stop = () => {
    setActive(false);
    window.clearTimeout(timerRef.current);
    window.clearTimeout(autoCloseRef.current);
    timerRef.current = undefined;
    autoCloseRef.current = undefined;
    scheduleWarmRelease();
  };

  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Démontage de l'écran : on coupe toujours la caméra.
  useEffect(() => () => releaseRef.current(), []);

  // Le <video> reste monté en permanence : on lui attache le flux dès qu'il est
  // prêt et on le laisse jouer (caméra chaude) même quand la modale est cachée.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) video.srcObject = stream;
    const play = video.play();
    if (play) play.catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // À l'ouverture, on s'assure simplement que la lecture tourne.
  useEffect(() => {
    if (!active) return;
    const play = videoRef.current?.play();
    if (play) play.catch(() => {});
  }, [active]);

  // Fermeture automatique si aucun QR n'est lu.
  useEffect(() => {
    if (!active) return;
    autoCloseRef.current = window.setTimeout(() => stopRef.current(), AUTO_CLOSE_MS);
    return () => window.clearTimeout(autoCloseRef.current);
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      setError("Lecture de QR indisponible : canvas non disponible.");
      return;
    }

    let cancelled = false;
    let lastInvertAt = 0;
    let decodeDimension = FAST_DECODE_DIMENSION;
    let firstFrameAt: number | null = null;

    const decodeFrame = () => {
      const video = videoRef.current;
      if (!video || video.readyState < HAVE_CURRENT_DATA) return;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return;

      const now = performance.now();
      if (firstFrameAt === null) firstFrameAt = now;
      if (
        decodeDimension === FAST_DECODE_DIMENSION &&
        now - firstFrameAt >= FALLBACK_AFTER_MS
      ) {
        decodeDimension = FALLBACK_DECODE_DIMENSION;
      }

      // Le cadre affiché est un carré central : on analyse exactement cette
      // zone (object-cover), ce qui évite de décoder des pixels inutiles.
      const side = Math.min(sourceWidth, sourceHeight);
      const sourceX = (sourceWidth - side) / 2;
      const sourceY = (sourceHeight - side) / 2;
      const size = Math.min(decodeDimension, side);
      if (canvas.width !== size) canvas.width = size;
      if (canvas.height !== size) canvas.height = size;

      try {
        context.drawImage(video, sourceX, sourceY, side, side, 0, 0, size, size);
        const image = context.getImageData(0, 0, size, size);
        const attemptBoth = now - lastInvertAt >= INVERT_RETRY_MS;
        if (attemptBoth) lastInvertAt = now;
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: attemptBoth ? "attemptBoth" : "dontInvert",
        });
        if (code?.data) {
          cancelled = true;
          window.clearTimeout(timerRef.current);
          window.clearTimeout(autoCloseRef.current);
          setActive(false);
          scheduleWarmRelease();
          onResultRef.current(code.data);
          return;
        }
      } catch {
        /* image non exploitable, on réessaie au prochain tour */
      }
    };

    const schedule = () => {
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        decodeFrame();
        schedule();
      }, DETECT_INTERVAL_MS);
    };

    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return {
    supported,
    active,
    ready,
    error,
    videoRef,
    start: () => void start(),
    stop,
    warm,
  };
}
