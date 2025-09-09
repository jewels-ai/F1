const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

const infoModal = document.getElementById('info-modal');
const subcategoryButtons = document.getElementById('subcategory-buttons');
const jewelryOptions = document.getElementById('jewelry-options');

let earringImg = null;
let necklaceImg = null;
let braceletImg = null;
let ringImg = null;

let currentType = '';
let smoothedFaceLandmarks = null;
let smoothedHandLandmarks = null;
let camera;

// Store smoothed jewelry positions
let smoothedHandPoints = {};
let smoothedFacePoints = {};

// ================== GOOGLE DRIVE CONFIG ==================
const API_KEY = "AIzaSyA1JCqs3gl6TMVz1cwPIsTD2sefDPRr8OY"; 

// Map jewelry type → Google Drive Folder ID
const driveFolders = {
  gold_earrings: "16wvDBpxaMgObqTQBxpM0PH1OAZbcNXcj",
  gold_necklaces: "1csT7TYA8lMbyuuIYAk2cMVYK9lRIT5Gz",
  diamond_earrings: "1K7Vv-FBFhtq6r-UsZGG3f3CpWZ0d49Ys",
  diamond_necklaces: "1csT7TYA8lMbyuuIYAk2cMVYK9lRIT5Gz",
  bracelet: "1N0xOM5Vih_6hEirRSyMkswxVqmWzD2yH",
  ring: "1NT1iOKj8FSJgwGVF41ngPqsh7UAX6Ykw",
};

// Fetch image links from a Drive folder
async function fetchDriveImages(folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType)`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.files) return [];

  return data.files
    .filter(f => f.mimeType.includes("image/"))
    .map(f => {
      const link = `https://drive.google.com/thumbnail?id=${f.id}&sz=w1000`;
      console.log("Image loaded:", link);
      return { id: f.id, name: f.name, src: link };
    });
}

// =========================================================

// Utility function to load images
async function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.error(`Failed to load image: ${src}`);
      resolve(null);
    };
    img.src = src;
  });
}

// Change jewelry image
async function changeJewelry(type, src) {
  const img = await loadImage(src);
  if (!img) return;

  earringImg = necklaceImg = braceletImg = ringImg = null;

  if (type.includes('earrings')) earringImg = img;
  else if (type.includes('necklaces')) necklaceImg = img;
  else if (type.includes('bracelet')) braceletImg = img;
  else if (type.includes('ring')) ringImg = img;
}

// Handle category selection
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

// Handle subcategory (Gold/Diamond)
function selectJewelryType(mainType, subType) {
  currentType = `${subType}_${mainType}`;
  subcategoryButtons.style.display = 'none';
  jewelryOptions.style.display = 'flex';
  insertJewelryOptions(currentType, 'jewelry-options');
}

// Insert jewelry options (from Google Drive)
async function insertJewelryOptions(type, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!driveFolders[type]) {
    console.error("No Google Drive folder mapped for:", type);
    return;
  }

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

// ================== MEDIAPIPE ==================
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
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const newLandmarks = results.multiFaceLandmarks[0];
    if (!smoothedFaceLandmarks) {
      smoothedFaceLandmarks = newLandmarks;
    } else {
      const smoothingFactor = 0.2;
      smoothedFaceLandmarks = smoothedFaceLandmarks.map((prev, i) => ({
        x: prev.x * (1 - smoothingFactor) + newLandmarks[i].x * smoothingFactor,
        y: prev.y * (1 - smoothingFactor) + newLandmarks[i].y * smoothingFactor,
        z: prev.z * (1 - smoothingFactor) + newLandmarks[i].z * smoothingFactor,
      }));
    }
  } else {
    smoothedFaceLandmarks = null;
  }
  drawJewelry(smoothedFaceLandmarks, smoothedHandLandmarks, canvasCtx);
});

// Start camera
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

// =============== Smoothing Helper ==================
function smoothPoint(prev, current, factor = 0.4) {
  if (!prev) return current;
  return {
    x: prev.x * (1 - factor) + current.x * factor,
    y: prev.y * (1 - factor) + current.y * factor
  };
}

// Draw jewelry
function drawJewelry(faceLandmarks, handLandmarks, ctx) {
  const earringScale = 0.078;
  const necklaceScale = 0.252;
  const braceletScale = 0.28;
  const ringScale = 0.1;
  const angleOffset = Math.PI / 2;

  if (faceLandmarks) {
    const leftEarLandmark = faceLandmarks[132];
    const rightEarLandmark = faceLandmarks[361];
    const neckLandmark = faceLandmarks[152];

    let leftEarPos = { x: leftEarLandmark.x * canvasElement.width - 6, y: leftEarLandmark.y * canvasElement.height - 16 };
    let rightEarPos = { x: rightEarLandmark.x * canvasElement.width + 6, y: rightEarLandmark.y * canvasElement.height - 16 };
    let neckPos = { x: neckLandmark.x * canvasElement.width - 8, y: neckLandmark.y * canvasElement.height + 10 };

    // Smooth positions
    smoothedFacePoints.leftEar = smoothPoint(smoothedFacePoints.leftEar, leftEarPos);
    smoothedFacePoints.rightEar = smoothPoint(smoothedFacePoints.rightEar, rightEarPos);
    smoothedFacePoints.neck = smoothPoint(smoothedFacePoints.neck, neckPos);

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

        // Midpoint between 13 & 14
        const ringBase = { x: hand[13].x * canvasElement.width, y: hand[13].y * canvasElement.height };
        const ringKnuckle = { x: hand[14].x * canvasElement.width, y: hand[14].y * canvasElement.height };
        let currentPos = {
          x: (ringBase.x + ringKnuckle.x) / 2,
          y: (ringBase.y + ringKnuckle.y) / 2
        };

        const key = `ring_${idx}`;
        smoothedHandPoints[key] = smoothPoint(smoothedHandPoints[key], currentPos);

        ctx.drawImage(ringImg, smoothedHandPoints[key].x - w / 2, smoothedHandPoints[key].y - h / 2, w, h);
      }
    });
  }
}

// Info modal
function toggleInfoModal() {
  if (infoModal.open) infoModal.close();
  else infoModal.showModal();
}
