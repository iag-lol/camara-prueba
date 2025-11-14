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

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.background = isError
    ? "rgba(239, 68, 68, 0.85)"
    : "rgba(0, 0, 0, 0.65)";
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
    setStatus("Error en la detección. Revisa la consola.", true);
    detectionActive = false;
    return;
  }

  requestAnimationFrame(detectionLoop);
};

const init = async () => {
  try {
    setStatus("Solicitando acceso a la cámara…");
    await startCamera();

    setStatus("Cargando modelo COCO-SSD…");
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
