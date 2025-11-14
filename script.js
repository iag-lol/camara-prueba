const videoEl = document.getElementById("camera");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");
const statusEl = document.getElementById("status");

let model;
let detectionActive = false;
let lastDetections = [];

const COLORS = [
  "#22d3ee",
  "#4ade80",
  "#f472b6",
  "#facc15",
  "#fb7185",
  "#38bdf8"
];

const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent);
const backendPreference = isAppleMobile
  ? ["wasm", "webgl", "cpu"]
  : ["webgl", "wasm", "cpu"];
let backendInUse = null;

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.background = isError
    ? "rgba(239, 68, 68, 0.85)"
    : "rgba(0, 0, 0, 0.65)";
};

const hasBackend = (name) => {
  if (typeof tf.findBackendFactory === "function") {
    return Boolean(tf.findBackendFactory(name));
  }
  const engine = typeof tf.engine === "function" ? tf.engine() : undefined;
  return Boolean(engine?.registryFactory?.[name]);
};

const configureWasmBackend = () => {
  if (tf.wasm?.setWasmPaths) {
    tf.wasm.setWasmPaths(
      "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.20.0/dist/"
    );
  }
};

const initializeBackend = async () => {
  configureWasmBackend();
  for (const backend of backendPreference) {
    if (!hasBackend(backend)) continue;
    try {
      await tf.setBackend(backend);
      await tf.ready();
      backendInUse = backend;
      return backend;
    } catch (error) {
      console.warn(`No se pudo iniciar el backend ${backend}`, error);
    }
  }

  throw new Error(
    "TensorFlow.js no pudo inicializarse (WebGL/WASM/CPU no disponibles)."
  );
};

const resizeCanvasToVideo = () => {
  if (!videoEl.videoWidth || !videoEl.videoHeight) return;
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
};

const startCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Tu navegador no soporta getUserMedia().");
  }

  const constraints = {
    audio: false,
    video: {
      facingMode: "environment"
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;

  return new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      resizeCanvasToVideo();
      resolve();
    };
  });
};

const drawDetections = (predictions) => {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  lastDetections = predictions;

  predictions.forEach((prediction, index) => {
    const [x, y, width, height] = prediction.bbox;
    const color = COLORS[index % COLORS.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    const label = `${prediction.class} ${(prediction.score * 100).toFixed(1)}%`;
    ctx.fillStyle = color;
    ctx.font = "16px 'Segoe UI', sans-serif";
    const textWidth = ctx.measureText(label).width;
    const textX = x;
    const textY = y > 20 ? y - 8 : y + 20;

    ctx.fillRect(textX - 2, textY - 18, textWidth + 8, 22);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, textX + 2, textY - 3);
  });
};

const switchToNextBackend = async () => {
  const currentIndex = backendPreference.indexOf(backendInUse);
  const candidates = backendPreference.slice(currentIndex + 1);

  for (const backend of candidates) {
    if (!hasBackend(backend)) continue;
    try {
      configureWasmBackend();
      setStatus(
        `Compatibilidad limitada. Activando backend ${backend.toUpperCase()}…`
      );
      await tf.setBackend(backend);
      await tf.ready();
      backendInUse = backend;
      if (typeof model?.dispose === "function") {
        model.dispose();
      }
      model = await cocoSsd.load();
      detectionActive = true;
      setStatus(`Backend ${backend.toUpperCase()} activo. Detectando objetos…`);
      requestAnimationFrame(detectionLoop);
      return true;
    } catch (backendError) {
      console.warn(`No se pudo activar el backend ${backend}`, backendError);
    }
  }

  return false;
};

const detectionLoop = async () => {
  if (!detectionActive || !model) return;

  try {
    const predictions = await model.detect(videoEl);
    drawDetections(predictions);
    setStatus(
      predictions.length
        ? `Objetos detectados: ${predictions.length}`
        : "Sin detecciones visibles"
    );
  } catch (error) {
    console.error("Error durante la detección:", error);
    detectionActive = false;
    const recovered = await switchToNextBackend();
    if (!recovered) {
      setStatus(
        error?.message || "Error en la detección. Revisa la consola.",
        true
      );
    }
    return;
  }

  requestAnimationFrame(detectionLoop);
};

const init = async () => {
  try {
    setStatus("Solicitando acceso a la cámara…");
    await startCamera();

    setStatus("Inicializando TensorFlow.js…");
    const backend = await initializeBackend();

    setStatus(
      `Backend ${backend.toUpperCase()} listo. Cargando modelo COCO-SSD…`
    );
    model = await cocoSsd.load();

    setStatus("Detectando objetos…");
    detectionActive = true;
    detectionLoop();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "No se pudo iniciar la cámara.", true);
  }
};

window.addEventListener("resize", () => {
  resizeCanvasToVideo();
  if (lastDetections.length) {
    drawDetections(lastDetections);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    detectionActive = false;
    setStatus("Detección en pausa (pestaña oculta).");
  } else if (model && videoEl.srcObject) {
    detectionActive = true;
    setStatus("Detectando objetos…");
    detectionLoop();
  }
});

window.addEventListener("load", init);
