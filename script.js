const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

const subcategoryButtons = document.getElementById('subcategory-buttons');
const jewelryOptions = document.getElementById('jewelry-options');

let earringImg = null, necklaceImg = null, braceletImg = null, ringImg = null;
let currentType = '';
let smoothedFaceLandmarks = null;
let smoothedHandLandmarks = null;
let camera;

let smoothedHandPoints = {};
let smoothedFacePoints = {};
let lastSnapshotDataURL = '';

// ================== GOOGLE DRIVE CONFIG ==================
const API_KEY = "AIzaSyA1JCqs3gl6TMVz1cwPIsTD2sefDPRr8OY"; 
const driveFolders = {
  gold_earrings: "16wvDBpxaMgObqTQBxpM0PH1OAZbcNXcj",
  gold_necklaces: "1csT7TYA8lMbyuuIYAk2cMVYK9lRIT5Gz",
  diamond_earrings: "1K7Vv-FBFhtq6r-UsZGG3f3CpWZ0d49Ys",
  diamond_necklaces: "1csT7TYA8lMbyuuIYAk2cMVYK9lRIT5Gz",
  bracelet: "1N0xOM5Vih_6hEirRSyMkswxVqmWzD2yH",
  ring: "1NT1iOKj8FSJgwGVF41ngPqsh7UAX6Ykw",
};

async function fetchDriveImages(folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType)`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.files) return [];
  return data.files
    .filter(f => f.mimeType.includes("image/"))
    .map(f => ({ id: f.id, name: f.name, src: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000` }));
}

async function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function changeJewelry(type, src) {
  const img = await loadImage(src);
  if (!img) return;
  earringImg = necklaceImg = braceletImg = ringImg = null;
  if (type.includes('earrings')) earringImg = img;
  else if (type.includes('necklaces')) necklaceImg = img;
  else if (type.includes('bracelet')) braceletImg = img;
  else if (type.includes('ring')) ringImg = img;
}

function toggleCategory(category) {
  jewelryOptions.style.display = 'none';
  subcategoryButtons.style.display = 'none';
  currentType = category;
  const isAccessoryCategory = ['bracelet', 'ring'].includes(category);
  if (isAccessoryCategory) {
    insertJewelryOptions(category, 'jewelry-options');
    jewelryOptions.style.display = 'flex';
    startCamera('environment');
  } else {
    subcategoryButtons.style.display = 'flex';
    startCamera('user');
  }
}

function selectJewelryType(mainType, subType) {
  currentType = `${subType}_${mainType}`;
  subcategoryButtons.style.display = 'none';
  jewelryOptions.style.display = 'flex';
  insertJewelryOptions(currentType, 'jewelry-options');
}

async function insertJewelryOptions(type, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!driveFolders[type]) return;
  const images = await fetchDriveImages(driveFolders[type]);
  images.forEach((file, i) => {
    const btn = document.createElement('button');
    const img = document.createElement('img');
    img.src = file.src;
    img.alt = `${type.replace('_', ' ')} ${i + 1}`;
    btn.appendChild(img);
    btn.onclick = () => changeJewelry(type, file.src);
    container.appendChild(btn);
  });
}

// ===== Mediapipe setup =====
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

hands.onResults((results) => {
  smoothedHandLandmarks = results.multiHandLandmarks && results.multiHandLandmarks.length > 0 ? results.multiHandLandmarks : null;
});

faceMesh.onResults((results) => {
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  if (results.multiFaceLandmarks?.length > 0) {
    const newLandmarks = results.multiFaceLandmarks[0];
    const factor = 0.2;
    smoothedFaceLandmarks = smoothedFaceLandmarks
      ? smoothedFaceLandmarks.map((prev, i) => ({
          x: prev.x * (1 - factor) + newLandmarks[i].x * factor,
          y: prev.y * (1 - factor) + newLandmarks[i].y * factor,
          z: prev.z * (1 - factor) + newLandmarks[i].z * factor,
        }))
      : newLandmarks;
  } else {
    smoothedFaceLandmarks = null;
  }
  drawJewelry(smoothedFaceLandmarks, smoothedHandLandmarks, canvasCtx);
});

async function startCamera(facingMode) {
  if (camera) camera.stop();
  camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({ image: videoElement });
      await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720,
    facingMode: facingMode
  });
  camera.start();
}

document.addEventListener('DOMContentLoaded', () => startCamera('user'));
videoElement.addEventListener('loadedmetadata', () => {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
});

function smoothPoint(prev, current, factor = 0.4) {
  if (!prev) return current;
  return { x: prev.x * (1 - factor) + current.x * factor, y: prev.y * (1 - factor) + current.y * factor };
}

function drawJewelry(faceLandmarks, handLandmarks, ctx) {
  const earringScale = 0.078, necklaceScale = 0.252, braceletScale = 0.28, ringScale = 0.1, angleOffset = Math.PI / 2;
  if (faceLandmarks) {
    const leftEar = { x: faceLandmarks[132].x * canvasElement.width - 6, y: faceLandmarks[132].y * canvasElement.height - 16 };
    const rightEar = { x: faceLandmarks[361].x * canvasElement.width + 6, y: faceLandmarks[361].y * canvasElement.height - 16 };
    const neck = { x: faceLandmarks[152].x * canvasElement.width - 8, y: faceLandmarks[152].y * canvasElement.height + 10 };
    smoothedFacePoints.leftEar = smoothPoint(smoothedFacePoints.leftEar, leftEar);
    smoothedFacePoints.rightEar = smoothPoint(smoothedFacePoints.rightEar, rightEar);
    smoothedFacePoints.neck = smoothPoint(smoothedFacePoints.neck, neck);
    if (earringImg) {
      const w = earringImg.width * earringScale, h = earringImg.height * earringScale;
      ctx.drawImage(earringImg, smoothedFacePoints.leftEar.x - w / 2, smoothedFacePoints.leftEar.y, w, h);
      ctx.drawImage(earringImg, smoothedFacePoints.rightEar.x - w / 2, smoothedFacePoints.rightEar.y, w, h);
    }
    if (necklaceImg) {
      const w = necklaceImg.width * necklaceScale, h = necklaceImg.height * necklaceScale;
      ctx.drawImage(necklaceImg, smoothedFacePoints.neck.x - w / 2, smoothedFacePoints.neck.y, w, h);
    }
  }
  if (handLandmarks) {
    handLandmarks.forEach((hand, idx) => {
      const wristPos = { x: hand[0].x * canvasElement.width, y: hand[0].y * canvasElement.height };
      const middleFingerPos = { x: hand[9].x * canvasElement.width, y: hand[9].y * canvasElement.height };
      const angle = Math.atan2(middleFingerPos.y - wristPos.y, middleFingerPos.x - wristPos.x);
      if (braceletImg) {
        const w = braceletImg.width * braceletScale, h = braceletImg.height * braceletScale;
        const key = `bracelet_${idx}`;
        smoothedHandPoints[key] = smoothPoint(smoothedHandPoints[key], wristPos);
        ctx.save();
        ctx.translate(smoothedHandPoints[key].x, smoothedHandPoints[key].y);
        ctx.rotate(angle + angleOffset);
        ctx.drawImage(braceletImg, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      if (ringImg) {
        const w = ringImg.width * ringScale, h = ringImg.height * ringScale;
        const ringBase = { x: hand[13].x * canvasElement.width, y: hand[13].y * canvasElement.height };
        const ringKnuckle = { x: hand[14].x * canvasElement.width, y: hand[14].y * canvasElement.height };
        let currentPos = { x: (ringBase.x + ringKnuckle.x) / 2, y: (ringBase.y + ringKnuckle.y) / 2 };
        const key = `ring_${idx}`;
        smoothedHandPoints[key] = smoothPoint(smoothedHandPoints[key], currentPos);
        ctx.drawImage(ringImg, smoothedHandPoints[key].x - w / 2, smoothedHandPoints[key].y - h / 2, w, h);
      }
    });
  }
}

// ====== SNAPSHOT FUNCTIONS (using html2canvas) ======
function takeSnapshot() {
  const container = document.querySelector('.video-container');

  html2canvas(container, {
    useCORS: true,
    allowTaint: true
  }).then(canvas => {
    lastSnapshotDataURL = canvas.toDataURL("image/png");
    document.getElementById('snapshot-preview').src = lastSnapshotDataURL;
    document.getElementById('snapshot-modal').style.display = 'block';
  }).catch(err => {
    console.error("Snapshot failed:", err);
    alert("Could not capture snapshot. Try again.");
  });
}

function saveSnapshot() {
  const link = document.createElement('a');
  link.href = lastSnapshotDataURL;
  link.download = `jewelry-tryon-${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function shareSnapshot() {
  if (navigator.canShare && navigator.canShare({ files: [] })) {
    const res = await fetch(lastSnapshotDataURL);
    const blob = await res.blob();
    const file = new File([blob], 'jewelry-tryon.png', { type: blob.type });

    try {
      await navigator.share({
        title: 'Jewelry Try-On',
        text: 'Check out my look!',
        files: [file]
      });
    } catch (err) {
      console.error("Share cancelled or failed", err);
    }
  } else {
    // Fallback for unsupported browsers
    const win = window.open();
    win.document.write(`<img src="${lastSnapshotDataURL}" style="max-width:100%">`);
    alert("Sharing not supported. Image opened in a new tab.");
  }
}

function closeSnapshotModal() {
  document.getElementById('snapshot-modal').style.display = 'none';
}
