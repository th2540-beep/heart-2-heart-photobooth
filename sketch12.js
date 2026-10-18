// =======================================================
// HE<3RT 2 HE<3RT PHOTOBOOTH
// =======================================================


// -------------------------------------------------------
// ML / VIDEO
// -------------------------------------------------------

let classifier;
let video;

let label = "";
let confidence = 0;


// -------------------------------------------------------
// SESSION STATE
// -------------------------------------------------------

let hasStarted = false;
let classificationRunning = false;
let sessionComplete = false;


// -------------------------------------------------------
// COUNTDOWN
// -------------------------------------------------------

let countdownSound;

let countdownActive = false;
let countdownValue = 0;
let countdownStartTime = 0;
let lastCountdownValue = -1;

// Wait this long AFTER a photo is taken
// before another countdown can start.
const COUNTDOWN_COOLDOWN = 4000;

let lastCountdownTime = 0;


// -------------------------------------------------------
// SHUTTER
// -------------------------------------------------------

let shutterSound;
let flashAlpha = 0;


// -------------------------------------------------------
// POSES
// -------------------------------------------------------

let poseImages = {};

let poseOrder = [
  "Finger Heart",
  "Classic Hand Heart",
  "Claw Heart",
  "Holding Hands Heart",
  "Pyramid Heart"
];

let randomizedPoseOrder = [];


// -------------------------------------------------------
// PHOTO STRIP
// -------------------------------------------------------

let photoStrip = [];

const MAX_PHOTOS = 4;


// -------------------------------------------------------
// ML THRESHOLDS
// -------------------------------------------------------

const THRESHOLDS = {

  "Finger Heart": 0.80,

  "Classic Hand Heart": 0.80,

  "Claw Heart": 0.75,

  "Holding Hands Heart": 0.78,

  "Pyramid Heart": 0.80

};


const IGNORE_LABELS = [
  "Not a Heart"
];


// -------------------------------------------------------
// CONFIDENCE SMOOTHING
// -------------------------------------------------------

const SMOOTH_FRAMES = 20;

const HOLD_TIME = 1000;

let confidenceHistory = {};

let lastLabel = "";

let stableStartTime = 0;


// =======================================================
// SUPABASE
// =======================================================

const SUPABASE_URL =
  "https://reqmzyrhozcisnfurxsb.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_ylDyUu9aJxPYVRSZJ2N3WA_GGLZjzFj";


// IMPORTANT:
// This must exactly match the bucket name in Supabase.

const SUPABASE_BUCKET =
  "heart-attack-photos";


const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


// =======================================================
// QR / FINISHED SCREEN
// =======================================================

let uploadState = "none";

// possible:
// none
// uploading
// ready
// error


let photoURL = "";

let qrImage = null;

// QR drawn as part of a pixel heart
let qrMatrix = null;
let qrHeartGfx = null;


// -------------------------------------------------------
// COLORS (shared so everything matches)
// -------------------------------------------------------

const PINK = [255, 100, 150];   // main pink (#FF6496)
const BG_DARK = 20;             // background (#141414)

// Font sizes for the main screens (one scale everywhere)
const TYPE_TITLE = 32;   // big headings
const TYPE_BODY = 18;    // normal lines
const TYPE_SMALL = 14;   // little notes
const TYPE_COUNTDOWN = 120;


// Saying + date at the bottom of the photostrip
const STRIP_SAYING = "made by hand <3";


// -------------------------------------------------------
// ACCURACY METER
// -------------------------------------------------------

// Below this, the heart meter shows 0%.
const METER_FLOOR = 0.5;

// meterTarget: how good the pose is right now (0..1).
// meterDisplay: what the heart shows. It moves toward
// the target slowly, so it fills up / drains smoothly.
// When it's full and held, the countdown starts.

let meterTarget = 0;
let meterDisplay = 0;
let meterFullSince = 0;

const METER_RISE_PER_SEC = 0.6;  // ~1.7s to fill
const METER_FALL_PER_SEC = 0.9;  // ~1.1s to empty
const FULL_HOLD_TIME = 400;      // stay full this long


// Little "<3" particles when the pose is right
let particles = [];


// -------------------------------------------------------
// HAND CHECK
// -------------------------------------------------------

// Meter stays at 0 unless a hand is actually seen.
// (Stops the meter filling when no one is there.)

const REQUIRE_HANDS = true;

let handTracker = null;
let handTrackerReady = false;
let lastHandSeen = 0;

// true  = only the pose shown in the strip counts
// false = any heart pose counts
const REQUIRE_PROMPTED_POSE = true;


// QR will stay visible for 45 seconds

const RESET_DELAY = 45000;

let qrReadyTime = 0;


// =======================================================
// PRELOAD
// =======================================================

function preload() {

  const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/PHSSJODhI/";


  classifier =
    ml5.imageClassifier(
      MODEL_URL + "model.json"
    );


  // sounds

  shutterSound =
    loadSound("Camerashutter.wav");


  countdownSound =
    loadSound("countdown.mp3");


  // pose images

  poseImages["Finger Heart"] =
    loadImage("FingerHeart.png");


  poseImages["Classic Hand Heart"] =
    loadImage("Classichandheart.png");


  poseImages["Claw Heart"] =
    loadImage("Claw Heart.png");


  poseImages["Holding Hands Heart"] =
    loadImage("HoldingHandsHeart.png");


  poseImages["Pyramid Heart"] =
    loadImage("Pyramid heart.png");

}


// =======================================================
// SETUP
// =======================================================

function setup() {

  createCanvas(800, 600);
  pixelDensity(2);


  // -----------------------
  // WEBCAM
  // -----------------------

  video =
    createCapture(VIDEO);


  video.size(
    1280,
    960
  );


  video.hide();


  // -----------------------
  // HAND TRACKER
  // -----------------------

  if (REQUIRE_HANDS && ml5.handpose) {

    try {

      handTracker =
        ml5.handpose(video, () => {
          handTrackerReady = true;
          console.log("Hand tracker ready");
        });

      handTracker.on("predict", (hands) => {
        if (hands && hands.length > 0) {
          lastHandSeen = millis();
        }
      });

    }

    catch (e) {

      console.warn("Hand tracker unavailable:", e);

    }

  }


  // -----------------------
  // RANDOMIZE POSES
  // -----------------------

  randomizePoses();

}


// =======================================================
// RANDOMIZE POSES
// =======================================================

function randomizePoses() {

  randomizedPoseOrder =
    shuffle(poseOrder)
      .slice(
        0,
        MAX_PHOTOS
      );

}


// =======================================================
// CLASSIFICATION LOOP
// =======================================================

function classifyVideo() {


  // Prevent multiple classifier loops

  if (classificationRunning) {
    return;
  }


  classificationRunning = true;


  runClassification();

}


// -------------------------------------------------------
// RUN CLASSIFICATION
// -------------------------------------------------------

function runClassification() {

  classifier.classify(
    video,

    (err, results) => {


      if (err) {

        console.error(
          "CLASSIFIER ERROR:",
          err
        );

        classificationRunning = false;

        return;

      }


      if (
        results &&
        results.length > 0
      ) {

        let rawLabel =
          results[0].label;


        label =
          rawLabel;


        // Which pose are we scoring?

        let targetPose =
          REQUIRE_PROMPTED_POSE
            ? randomizedPoseOrder[photoStrip.length]
            : rawLabel;


        // Confidence for that pose.
        // "Not a Heart" on top = 0.

        let rawConfidence = 0;

        if (
          targetPose &&
          !IGNORE_LABELS.includes(rawLabel)
        ) {

          let match =
            results.find(
              (r) => r.label === targetPose
            );

          rawConfidence =
            match ? match.confidence : 0;

        }


        // No hands seen recently = nobody posing.

        if (
          REQUIRE_HANDS &&
          handTrackerReady &&
          millis() - lastHandSeen > 600
        ) {

          rawConfidence = 0;

        }


        confidence =
          smoothConfidence(
            targetPose || "none",
            rawConfidence
          );


        // Meter: 0% below METER_FLOOR,
        // 100% at the pose's threshold.

        let needed =
          THRESHOLDS[targetPose] || 0.8;

        meterTarget =
          constrain(
            map(
              confidence,
              METER_FLOOR,
              needed,
              0,
              1
            ),
            0,
            1
          );


        // (The countdown is now started by
        // updateMeter() when the heart is full.)

      }


      // Continue classification

      runClassification();

    }
  );

}


// =======================================================
// CONFIDENCE SMOOTHING
// =======================================================

function smoothConfidence(
  currentLabel,
  conf
) {

  if (
    !confidenceHistory[currentLabel]
  ) {

    confidenceHistory[currentLabel] = [];

  }


  confidenceHistory[currentLabel]
    .push(conf);


  if (
    confidenceHistory[currentLabel].length >
    SMOOTH_FRAMES
  ) {

    confidenceHistory[currentLabel]
      .shift();

  }


  let total =
    confidenceHistory[currentLabel]
      .reduce(
        (a, b) => a + b,
        0
      );


  return (
    total /
    confidenceHistory[currentLabel].length
  );

}


// =======================================================
// POSE STABILITY
// =======================================================

function isPoseStable(
  currentLabel
) {

  if (
    currentLabel !== lastLabel
  ) {

    lastLabel =
      currentLabel;


    stableStartTime =
      millis();


    return false;

  }


  return (
    millis() -
    stableStartTime >=
    HOLD_TIME
  );

}


// =======================================================
// CHECK WHETHER PHOTO SHOULD START
// =======================================================

function checkForPhoto(
  currentLabel,
  currentConfidence
) {


  // Booth is on start screen

  if (!hasStarted) {
    return;
  }


  // Finished session

  if (sessionComplete) {
    return;
  }


  // Already have four photos

  if (
    photoStrip.length >=
    MAX_PHOTOS
  ) {

    return;

  }


  // Ignore "Not a Heart"

  if (
    IGNORE_LABELS.includes(
      currentLabel
    )
  ) {

    return;

  }


  // Make sure classifier result
  // is one of our poses

  if (
    !(
      currentLabel
      in
      THRESHOLDS
    )
  ) {

    return;

  }


  // Don't create two countdowns

  if (countdownActive) {
    return;
  }


  let needed =
    THRESHOLDS[currentLabel];


  // Pose must stay above the threshold
  // for HOLD_TIME before the countdown.

  if (currentConfidence < needed) {

    stableStartTime = 0;

    return;

  }


  if (stableStartTime === 0) {

    stableStartTime = millis();

  }


  let heldLongEnough =
    millis() - stableStartTime >= HOLD_TIME;


  if (

    heldLongEnough &&

    millis() -
    lastCountdownTime >
    COUNTDOWN_COOLDOWN

  ) {

    startCountdown();

  }

}


// =======================================================
// START COUNTDOWN
// =======================================================

function startCountdown() {

  countdownActive = true;

  countdownValue = 3;

  countdownStartTime =
    millis();

  lastCountdownValue = -1;

}


// =======================================================
// UPDATE COUNTDOWN
// =======================================================

function updateCountdown() {

  if (!countdownActive) {
    return;
  }


  let elapsed =
    millis() -
    countdownStartTime;


  let newValue =
    3 -
    floor(
      elapsed / 1000
    );


  // -----------------------
  // COUNTDOWN SOUND
  // -----------------------

  if (
    newValue !==
    lastCountdownValue
  ) {

    lastCountdownValue =
      newValue;


    if (newValue > 0) {

      countdownSound.setVolume(
        0.1
      );


      countdownSound.play();

    }

  }


  countdownValue =
    max(
      newValue,
      0
    );


  // -----------------------
  // TAKE PHOTO
  // -----------------------

  if (
    countdownValue === 0 &&
    elapsed > 3000
  ) {

    takePhoto();

    countdownActive = false;


    // Start the cooldown from when the
    // photo was taken, and make people
    // hold a fresh pose for the next one.

    lastCountdownTime = millis();

    meterDisplay = 0;

    meterTarget = 0;

    meterFullSince = 0;

    confidenceHistory = {};

    lastLabel = "";

    stableStartTime = 0;

  }

}


// =======================================================
// TAKE PHOTO
// =======================================================

function takePhoto() {


  // Flash

  flashAlpha = 255;


  // Shutter sound

  shutterSound.setVolume(1);

  shutterSound.play();


  // -----------------------
  // CAPTURE CAMERA
  // -----------------------

  let photo =
    createGraphics(
      video.width,
      video.height
    );


  // Mirror photo

  photo.push();


  photo.translate(
    video.width,
    0
  );


  photo.scale(
    -1,
    1
  );


  photo.image(
    video,
    0,
    0,
    video.width,
    video.height
  );


  photo.pop();


  // -----------------------
  // ADD TO STRIP
  // -----------------------

  photoStrip.push({

    img: photo,

    label: label

  });


  console.log(
    "Photo taken:",
    photoStrip.length
  );


  // -----------------------
  // FOURTH PHOTO
  // -----------------------

  if (
    photoStrip.length ===
    MAX_PHOTOS
  ) {

    finishSession();

  }

}


// =======================================================
// FINISH SESSION
// =======================================================

async function finishSession() {


  // This prevents this function
  // from running more than once.

  if (sessionComplete) {
    return;
  }


  sessionComplete = true;

  uploadState =
    "uploading";


  console.log(
    "Four photos complete."
  );


  // Build the finished strip directly
  // from the four captured images.

  let finishedStrip =
    buildHighResolutionStrip();


  // -----------------------
  // OPTIONAL LOCAL SAVE
  // -----------------------

  /*
  NOTE:

  Browser automatic downloads can
  sometimes be blocked when running
  unattended.

  If you WANT local downloads too,
  remove the // from the save line.
  */


  // save(
  //   finishedStrip,
  //   "photo_strip_" +
  //   Date.now() +
  //   ".png"
  // );


  // -----------------------
  // AUTOMATIC SUPABASE UPLOAD
  // -----------------------

  await uploadPhotoStrip(
    finishedStrip
  );

}


// =======================================================
// BUILD HIGH-RES PHOTO STRIP
// =======================================================

function buildHighResolutionStrip() {


  // Native camera photos are 640 x 480.
  //
  // Four photos:
  // 480 x 4 = 1920
  //
  // plus 160 px title
  //
  // final = 640 x 2080


  const stripWidth =
    640;


  // room for the stacked title
  const titleHeight =
    250;


  // margin keeps a border around each photo
  const margin =
    36;


  const gap =
    28;


  const photoWidth =
    stripWidth - margin * 2;


  const photoHeight =
    photoWidth * 0.75;


  // room at the bottom for the saying + date
  const footerHeight =
    130;


  const stripHeight =
    titleHeight +
    photoHeight * MAX_PHOTOS +
    gap * (MAX_PHOTOS - 1) +
    footerHeight;


  let strip =
    createGraphics(
      stripWidth,
      stripHeight
    );


  // -----------------------
  // BACKGROUND
  // -----------------------

  strip.background(PINK[0], PINK[1], PINK[2]);


  // -----------------------
  // TITLE
  // -----------------------

  strip.fill(BG_DARK);


  strip.noStroke();


  strip.textAlign(
    CENTER,
    CENTER
  );


  // stacked title:  HE<3RT / 2 / HE<3RT

  strip.textSize(64);
  strip.text("HE<3RT", stripWidth / 2, 72);

  strip.textSize(64);
  strip.text("HE<3RT", stripWidth / 2, 180);


  // the "2" sits on a little heart,
  // nested between the two lines

  strip.fill(BG_DARK);
  drawHeart(stripWidth / 2, 86, 84, strip);

  strip.fill(PINK[0], PINK[1], PINK[2]);
  strip.textSize(40);
  strip.textStyle(BOLD);
  strip.text("2", stripWidth / 2, 120);
  strip.textStyle(NORMAL);


  // little finger hearts on both sides

  let fh = poseImages["Finger Heart"];

  if (fh) {

    strip.imageMode(CENTER);

    strip.image(fh, 90, 126, 110, 110);
    strip.image(fh, stripWidth - 90, 126, 110, 110);

    strip.imageMode(CORNER);

  }


  // -----------------------
  // PHOTOS
  // -----------------------

  for (
    let i = 0;
    i < photoStrip.length;
    i++
  ) {

    let y =
      titleHeight +
      i *
      (photoHeight + gap);


    strip.image(
      photoStrip[i].img,
      margin,
      y,
      photoWidth,
      photoHeight
    );


    // dark border

    strip.noFill();


    strip.stroke(BG_DARK);


    strip.strokeWeight(6);


    strip.rect(
      margin,
      y,
      photoWidth,
      photoHeight
    );

  }


  // -----------------------
  // SAYING + DATE
  // -----------------------

  let footerTop =
    titleHeight +
    photoHeight * MAX_PHOTOS +
    gap * (MAX_PHOTOS - 1);

  strip.noStroke();

  strip.fill(BG_DARK);

  strip.textAlign(CENTER, CENTER);

  strip.textSize(34);

  strip.text(
    STRIP_SAYING,
    stripWidth / 2,
    footerTop + 52
  );

  strip.textSize(22);

  strip.text(
    nf(month(), 2) + "." + nf(day(), 2) + "." + nf(year() % 100, 2),
    stripWidth / 2,
    footerTop + 94
  );


  return strip;

}


// =======================================================
// UPLOAD PHOTOSTRIP TO SUPABASE
// =======================================================

async function uploadPhotoStrip(
  stripImage
) {

  console.log(
    "Uploading photostrip..."
  );


  try {


    // -----------------------
    // CANVAS → PNG BLOB
    // -----------------------

    const blob =
      await new Promise(
        (resolve) => {

          stripImage.canvas
            .toBlob(
              resolve,
              "image/png"
            );

        }
      );


    if (!blob) {

      throw new Error(
        "Could not create PNG blob."
      );

    }


    // -----------------------
    // UNIQUE FILENAME
    // -----------------------

    const fileName =

      "photostrip_" +

      Date.now() +

      "_" +

      Math.random()
        .toString(36)
        .substring(2, 8) +

      ".png";


    console.log(
      "Uploading:",
      fileName
    );


    // -----------------------
    // UPLOAD
    // -----------------------

    const {
      data,
      error
    } =

      await supabaseClient
        .storage
        .from(
          SUPABASE_BUCKET
        )
        .upload(
          fileName,
          blob,
          {

            contentType:
              "image/png",

            cacheControl:
              "3600",

            upsert:
              false

          }
        );


    if (error) {
      throw error;
    }


    console.log(
      "PHOTOSTRIP UPLOAD SUCCESS!"
    );


    console.log(data);


    // -----------------------
    // PUBLIC URL
    // -----------------------

    const {
      data: publicData
    } =

      supabaseClient
        .storage
        .from(
          SUPABASE_BUCKET
        )
        .getPublicUrl(
          fileName
        );


    if (
      !publicData ||
      !publicData.publicUrl
    ) {

      throw new Error(
        "Could not get public URL."
      );

    }


    photoURL =
      publicData.publicUrl;


    console.log(
      "PHOTO URL:"
    );


    console.log(
      photoURL
    );


    // -----------------------
    // CREATE QR
    // -----------------------

    createQRCode(
      photoURL
    );

  }

  catch (error) {

    console.error(
      "PHOTOSTRIP UPLOAD ERROR:",
      error
    );


    uploadState =
      "error";


    qrReadyTime =
      millis();

  }

}


// =======================================================
// CREATE QR CODE
// =======================================================

function createQRCode(url) {

  console.log("Creating QR code for:", url);

  // Create a temporary invisible div
  let qrContainer = document.createElement("div");

  qrContainer.style.position = "absolute";
  qrContainer.style.left = "-9999px";
  qrContainer.style.top = "-9999px";

  document.body.appendChild(qrContainer);


  // Generate the QR code
  let qrObj = new QRCode(qrContainer, {

    text: url,

    width: 400,
    height: 400,

    // dark squares on the main pink
    colorDark: "#141414",
    colorLight: "#ff6496",

    correctLevel:
      QRCode.CorrectLevel.L

  });


  // Read the QR squares directly so we can
  // draw them as part of a pixel heart.

  try {

    let model = qrObj._oQRCode;

    let n = model.getModuleCount();

    qrMatrix = [];

    for (let r = 0; r < n; r++) {

      let row = [];

      for (let c = 0; c < n; c++) {
        row.push(model.isDark(r, c));
      }

      qrMatrix.push(row);

    }

    qrHeartGfx = buildQRHeart(qrMatrix);

    uploadState = "ready";

    qrReadyTime = millis();

    console.log("QR HEART READY!");

    qrContainer.remove();

    return;

  }

  catch (e) {

    // Fall back to the plain QR image below.

    console.warn("QR heart fallback:", e);

    qrMatrix = null;

    qrHeartGfx = null;

  }


  // Give QRCode.js a moment to create its canvas
  setTimeout(() => {

    let qrCanvas =
      qrContainer.querySelector("canvas");


    if (!qrCanvas) {

      console.error(
        "QR ERROR: QR canvas was not created."
      );

      uploadState = "error";
      qrReadyTime = millis();

      qrContainer.remove();

      return;
    }


    // Convert QR canvas into an image URL
    let qrDataURL =
      qrCanvas.toDataURL("image/png");


    // Load it into p5
    loadImage(

      qrDataURL,

      function(img) {

        qrImage = img;

        uploadState = "ready";

        qrReadyTime = millis();


        console.log("QR READY!");


        // Remove temporary HTML element
        qrContainer.remove();

      },

      function(error) {

        console.error(
          "QR IMAGE ERROR:",
          error
        );


        uploadState = "error";

        qrReadyTime = millis();


        qrContainer.remove();

      }

    );

  }, 100);

}


// =======================================================
// PIXEL HEART WITH THE QR CODE BUILT IN
// =======================================================

// Layout of the QR screen heart
const QR_HEART_TOP = 142;    // top of heart (px)
const QR_HEART_SCALE = 140;  // px per heart unit (size)
const QR_QUIET = 3;          // plain pink squares around QR


// The heart shape used everywhere: it's a "<3"
// turned upright -- a sharp "<" point at the bottom
// and the two round bumps of the "3" on top.
// (y points up; spans y -1..1.236, x -1.223..1.223)

const HEART_D = 1.0131;               // diamond half-size
const HEART_C = 0.0131;               // diamond center y
const HEART_R = HEART_D / Math.SQRT2; // bump radius


function insideHeartShape(x, y) {

  // the "<" (a diamond / rotated square)
  if (Math.abs(x) + Math.abs(y - HEART_C) <= HEART_D) {
    return true;
  }

  // the "3" (two round bumps)
  let by = HEART_C + HEART_D / 2;
  let bx = HEART_D / 2;

  let dl = (x + bx) * (x + bx) + (y - by) * (y - by);
  let dr = (x - bx) * (x - bx) + (y - by) * (y - by);

  return dl <= HEART_R * HEART_R || dr <= HEART_R * HEART_R;

}


// Little repeatable "random" number per square,
// so the sparkle pixels don't flicker.

function cellRandom(i, j) {

  let v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;

  return v - Math.floor(v);

}


function buildQRHeart(matrix) {

  let n = matrix.length;

  let k = QR_HEART_SCALE;

  let cx = width / 2;


  // heart y-unit -> screen y

  let toScreenY = (Y) =>
    QR_HEART_TOP + (1.236 - Y) * k;


  // QR + quiet zone fits the biggest
  // square inside the heart

  let squarePx = 1.30 * k;

  let m = squarePx / (n + 2 * QR_QUIET);


  let qrCenterY = toScreenY(0.35);

  let gridX0 = cx - (n / 2 + QR_QUIET) * m;

  let gridY0 = qrCenterY - (n / 2 + QR_QUIET) * m;


  // grid range covering the heart + sparkle edge

  let pad = 4;

  let iMin = Math.floor((cx - 1.3 * k - gridX0) / m) - pad;
  let iMax = Math.ceil((cx + 1.3 * k - gridX0) / m) + pad;

  let jMin = Math.floor((QR_HEART_TOP - gridY0) / m) - pad;
  let jMax = Math.ceil((toScreenY(-1) - gridY0) / m) + pad;


  let W = iMax - iMin + 1;
  let H = jMax - jMin + 1;

  let inside = new Array(W * H).fill(false);

  let qrZone = new Array(W * H).fill(false);

  let qrSpan = n + 2 * QR_QUIET;


  for (let j = jMin; j <= jMax; j++) {

    for (let i = iMin; i <= iMax; i++) {

      let px = gridX0 + (i + 0.5) * m;
      let py = gridY0 + (j + 0.5) * m;

      let X = (px - cx) / k;
      let Y = 1.236 - (py - QR_HEART_TOP) / k;

      let inQR =
        i >= 0 && i < qrSpan &&
        j >= 0 && j < qrSpan;

      inside[(j - jMin) * W + (i - iMin)] =
        inQR || insideHeartShape(X, Y);

      qrZone[(j - jMin) * W + (i - iMin)] = inQR;

    }

  }


  let g = createGraphics(width, height);

  g.noStroke();

  let s = m + 0.6; // tiny overlap, no seams


  // pink heart, filled with QR-style squares
  // (the real QR + a plain border stays clean)

  let cellAt = (i, j) => {

    let ii = i - iMin;
    let jj = j - jMin;

    if (ii < 0 || ii >= W || jj < 0 || jj >= H) {
      return { inside: false, qr: false };
    }

    return {
      inside: inside[jj * W + ii],
      qr: qrZone[jj * W + ii]
    };

  };


  for (let j = jMin; j <= jMax; j++) {

    for (let i = iMin; i <= iMax; i++) {

      let cell = cellAt(i, j);

      if (!cell.inside) {
        continue;
      }

      let x = gridX0 + i * m;
      let y = gridY0 + j * m;

      g.fill(PINK[0], PINK[1], PINK[2]);
      g.rect(x, y, s, s);


      if (!cell.qr && cellRandom(i, j) < 0.45) {

        g.fill(BG_DARK);
        g.rect(x, y, s, s);

      }

    }

  }


  // a few little QR-style square "eyes" in the decoration

  let eyes = [];

  for (let k = 0; k < 200 && eyes.length < 7; k++) {

    let ci = iMin + Math.floor(cellRandom(k, 7) * W);
    let cj = jMin + Math.floor(cellRandom(k, 13) * H);


    // 7x7 block (eye + pink ring) must be in the heart,
    // away from the real QR, and not touch other eyes

    let ok = true;

    for (let dj = -2; dj <= 6 && ok; dj++) {

      for (let di = -2; di <= 6 && ok; di++) {

        let cell = cellAt(ci + di, cj + dj);

        if (!cell.inside || cell.qr) {
          ok = false;
        }

      }

    }

    for (let e of eyes) {

      if (abs(e.i - ci) < 9 && abs(e.j - cj) < 9) {
        ok = false;
      }

    }

    if (!ok) {
      continue;
    }

    eyes.push({ i: ci, j: cj });


    let ex = gridX0 + ci * m;
    let ey = gridY0 + cj * m;

    g.fill(PINK[0], PINK[1], PINK[2]);
    g.rect(ex - m, ey - m, m * 7 + 0.6, m * 7 + 0.6);

    g.fill(BG_DARK);
    g.rect(ex, ey, m * 5 + 0.6, m * 5 + 0.6);

    g.fill(PINK[0], PINK[1], PINK[2]);
    g.rect(ex + m, ey + m, m * 3 + 0.6, m * 3 + 0.6);

    g.fill(BG_DARK);
    g.rect(ex + m * 2, ey + m * 2, m + 0.6, m + 0.6);

  }


  // the QR code itself, dark squares on the pink

  g.fill(BG_DARK);

  for (let r = 0; r < n; r++) {

    for (let c = 0; c < n; c++) {

      if (matrix[r][c]) {

        g.rect(
          gridX0 + (QR_QUIET + c) * m,
          gridY0 + (QR_QUIET + r) * m,
          s,
          s
        );

      }

    }

  }


  return g;

}


// =======================================================
// METER: FILL / DRAIN SLOWLY, START COUNTDOWN WHEN FULL
// =======================================================

function updateMeter() {

  let dt = min(deltaTime, 100) / 1000;


  if (meterDisplay < meterTarget) {

    meterDisplay = min(
      meterTarget,
      meterDisplay + METER_RISE_PER_SEC * dt
    );

  }

  else {

    meterDisplay = max(
      meterTarget,
      meterDisplay - METER_FALL_PER_SEC * dt
    );

  }


  let full = meterDisplay >= 0.999;

  if (full) {

    if (meterFullSince === 0) {
      meterFullSince = millis();
    }

  }

  else {

    meterFullSince = 0;

  }


  // celebrate while full / counting down

  if ((full || countdownActive) && random() < 0.3) {

    particles.push({
      x: 60 + random(-50, 50),
      y: 75 + random(0, 15),
      vx: random(-0.4, 0.4),
      vy: random(-1.6, -0.8),
      life: 255,
      size: random(12, 20)
    });

  }


  // start the countdown

  if (
    full &&
    !countdownActive &&
    !sessionComplete &&
    photoStrip.length < MAX_PHOTOS &&
    millis() - meterFullSince >= FULL_HOLD_TIME &&
    millis() - lastCountdownTime > COUNTDOWN_COOLDOWN
  ) {

    startCountdown();

  }

}


function drawParticles() {

  push();

  noStroke();

  textAlign(CENTER, CENTER);


  for (let i = particles.length - 1; i >= 0; i--) {

    let p = particles[i];

    p.x += p.vx;
    p.y += p.vy;
    p.life -= 4;


    if (p.life <= 0) {

      particles.splice(i, 1);

      continue;

    }


    fill(PINK[0], PINK[1], PINK[2], p.life);

    textSize(p.size);

    text("<3", p.x, p.y);

  }

  pop();

}


// =======================================================
// MAIN DRAW LOOP
// =======================================================

function draw() {

  background(20);


  // -----------------------
  // START SCREEN
  // -----------------------

  if (!hasStarted) {

    drawStartScreen();

    return;

  }


  // -----------------------
  // FINISHED SESSION
  // -----------------------

  if (sessionComplete) {

    drawFinishedScreen();

    return;

  }


  const cameraWidth =
    640;


  const stripWidth =
    160;


  // -----------------------
  // CAMERA
  // -----------------------

  push();


  translate(
    cameraWidth,
    0
  );


  scale(
    -1,
    1
  );


  image(
    video,
    0,
    0,
    cameraWidth,
    height
  );


  pop();


  // -----------------------
  // CONFIDENCE HEART
  // -----------------------

  updateMeter();

  drawHeartConfidence();

  drawParticles();


  // -----------------------
  // COUNTDOWN
  // -----------------------

  if (countdownActive) {

    updateCountdown();


    if (
      countdownValue > 0
    ) {

      fill(PINK[0], PINK[1], PINK[2]);


      textSize(TYPE_COUNTDOWN);


      textAlign(
        CENTER,
        CENTER
      );


      text(
        countdownValue,
        cameraWidth / 2,
        height / 2
      );

    }

  }


  // -----------------------
  // LABEL
  // -----------------------

  fill(PINK[0], PINK[1], PINK[2]);


  noStroke();


  textSize(TYPE_SMALL);


  textAlign(
    CENTER,
    CENTER
  );


  text(
    label,
    cameraWidth / 2,
    height - 25
  );


  // -----------------------
  // PHOTO STRIP PREVIEW
  // -----------------------

  drawPhotoStrip(
    cameraWidth,
    stripWidth
  );


  // -----------------------
  // FLASH
  // -----------------------

  if (
    flashAlpha > 0
  ) {

    noStroke();


    fill(
      255,
      flashAlpha
    );


    rect(
      0,
      0,
      cameraWidth,
      height
    );


    flashAlpha -= 10;

  }

}


// =======================================================
// PHOTO STRIP PREVIEW
// =======================================================

function drawPhotoStrip(
  startX,
  stripWidth
) {


  fill(PINK[0], PINK[1], PINK[2]);

  noStroke();


  rect(
    startX,
    0,
    stripWidth,
    height
  );


  // -----------------------
  // TITLE
  // -----------------------

  fill(BG_DARK);


  textAlign(
    CENTER,
    CENTER
  );


  // stacked title:  HE<3RT / 2 / HE<3RT

  noStroke();

  let tcx = startX + stripWidth / 2;

  textSize(15);
  text("HE<3RT", tcx, 15);

  textSize(15);
  text("HE<3RT", tcx, 43);


  // the "2" sits on a little heart,
  // nested between the two lines

  fill(BG_DARK);
  drawHeart(tcx, 18, 22);

  fill(PINK[0], PINK[1], PINK[2]);
  textSize(11);
  textStyle(BOLD);
  text("2", tcx, 27);
  textStyle(NORMAL);

  fill(BG_DARK);


  // little finger hearts on both sides

  let fh = poseImages["Finger Heart"];

  if (fh) {

    push();

    imageMode(CENTER);

    image(fh, startX + 22, 29, 30, 30);
    image(fh, startX + stripWidth - 22, 29, 30, 30);

    pop();

  }


  const STRIP_TOP = 60;


  let photoHeight =
    (height - STRIP_TOP) /
    MAX_PHOTOS;


  // -----------------------
  // FOUR SLOTS
  // -----------------------

  for (
    let i = 0;
    i < MAX_PHOTOS;
    i++
  ) {


    let y =
      STRIP_TOP +
      i *
      photoHeight;


    // -----------------------
    // CAPTURED PHOTO
    // -----------------------

    if (
      i <
      photoStrip.length
    ) {


      // smaller photo so the strip
      // border shows around it

      let pad = 10;

      let pw = stripWidth - pad * 2;

      let ph = min(pw * 0.75, photoHeight - 12);

      let px = startX + (stripWidth - pw) / 2;

      let py = y + (photoHeight - ph) / 2;


      image(
        photoStrip[i].img,
        px,
        py,
        pw,
        ph
      );


      noFill();


      stroke(BG_DARK);


      strokeWeight(3);


      rect(
        px,
        py,
        pw,
        ph
      );

    }


    // -----------------------
    // CURRENT POSE
    // -----------------------

    else if (
      i ===
      photoStrip.length
    ) {


      let poseImg =
        poseImages[
          randomizedPoseOrder[i]
        ];


      if (poseImg) {

        push();


        imageMode(CENTER);


        let imgSize =
          min(
            stripWidth - 40,
            photoHeight - 40
          );


        image(
          poseImg,

          startX +
          stripWidth / 2,

          y +
          photoHeight / 2,

          imgSize,
          imgSize
        );


        pop();

      }


      noFill();


      stroke(BG_DARK);


      strokeWeight(2);


      rect(
        startX + 10,
        y + 10,
        stripWidth - 20,
        photoHeight - 20
      );


      fill(BG_DARK);


      noStroke();


      textSize(11);


      textAlign(
        CENTER,
        TOP
      );


      text(
        `Photo ${i + 1}`,
        startX +
        stripWidth / 2,
        y + 15
      );

    }


    // -----------------------
    // FUTURE SLOT
    // -----------------------

    else {


      fill(20, 20, 20, 40);


      noStroke();


      rect(
        startX + 10,
        y + 10,
        stripWidth - 20,
        photoHeight - 20
      );


      fill(BG_DARK);


      textSize(11);


      textAlign(
        CENTER,
        CENTER
      );


      text(
        `Photo ${i + 1}`,
        startX +
        stripWidth / 2,
        y +
        photoHeight / 2
      );

    }

  }

}


// =======================================================
// FINISHED / QR SCREEN
// =======================================================

function drawFinishedScreen() {

  background(20);


  textAlign(
    CENTER,
    CENTER
  );


  // -----------------------
  // UPLOADING
  // -----------------------

  if (
    uploadState ===
    "uploading"
  ) {


    fill(PINK[0], PINK[1], PINK[2]);


    noStroke();


    textSize(TYPE_TITLE);


    text(
      "Preparing your HE<3RTs...",
      width / 2,
      height / 2 - 30
    );


    fill(PINK[0], PINK[1], PINK[2]);


    textSize(TYPE_BODY);


    text(
      "One moment <3",
      width / 2,
      height / 2 + 35
    );


    return;

  }


  // -----------------------
  // QR READY
  // -----------------------

  if (
    uploadState ===
    "ready"
  ) {


    noStroke();

    fill(PINK[0], PINK[1], PINK[2]);


    textSize(TYPE_TITLE);


    text(
      "Collect your photostrip!",
      width / 2,
      112
    );


    // -----------------------
    // QR BUILT INTO A PIXEL HEART
    // -----------------------

    if (qrHeartGfx) {

      image(
        qrHeartGfx,
        0,
        0,
        width,
        height
      );

    }

    else if (qrImage) {

      // fallback: plain QR on a pink heart

      fill(PINK[0], PINK[1], PINK[2]);

      drawHeart(width / 2, 70, 440);

      rectMode(CENTER);

      rect(width / 2, 280, 220, 220, 12);

      rectMode(CORNER);

      imageMode(CENTER);

      image(qrImage, width / 2, 280, 190, 190);

      imageMode(CORNER);

    }




    // -----------------------
    // RESET TIMER
    // -----------------------

    let elapsed =
      millis() -
      qrReadyTime;


    let secondsLeft =
      ceil(
        (
          RESET_DELAY -
          elapsed
        )
        /
        1000
      );


    secondsLeft =
      max(
        0,
        secondsLeft
      );


    fill(PINK[0], PINK[1], PINK[2]);


    textSize(TYPE_SMALL);


    textStyle(ITALIC);

    text(
      "Photobooth rebooting in " +
      secondsLeft +
      "s",
      width / 2,
      486
    );

    textStyle(NORMAL);


    if (
      elapsed >=
      RESET_DELAY
    ) {

      resetBooth();

    }


    return;

  }


  // -----------------------
  // ERROR
  // -----------------------

  if (
    uploadState ===
    "error"
  ) {


    fill(PINK[0], PINK[1], PINK[2]);


    textSize(TYPE_TITLE);


    text(
      "Your HE<3RTs were captured!",
      width / 2,
      height / 2 - 45
    );


    fill(PINK[0], PINK[1], PINK[2]);


    textSize(TYPE_BODY);


    text(
      "QR download is temporarily unavailable.",
      width / 2,
      height / 2 + 10
    );


    textSize(TYPE_SMALL);


    fill(PINK[0], PINK[1], PINK[2]);





    // Reset after 15 seconds
    // if upload failed

    if (
      millis() -
      qrReadyTime >
      15000
    ) {

      resetBooth();

    }

  }

}


// =======================================================
// RESET BOOTH
// =======================================================

function resetBooth() {

  console.log(
    "Resetting booth..."
  );


  // photos

  photoStrip = [];


  // new poses

  randomizePoses();


  // ML values

  label = "";

  confidence = 0;

  confidenceHistory = {};

  lastLabel = "";

  stableStartTime = 0;


  // countdown

  countdownActive = false;

  countdownValue = 0;

  countdownStartTime = 0;

  lastCountdownValue = -1;

  lastCountdownTime = 0;


  // flash

  flashAlpha = 0;


  // upload / QR

  sessionComplete = false;

  uploadState = "none";

  photoURL = "";

  qrImage = null;

  qrMatrix = null;

  if (qrHeartGfx) {
    qrHeartGfx.remove();
  }

  qrHeartGfx = null;

  meterTarget = 0;

  meterDisplay = 0;

  meterFullSince = 0;

  particles = [];

  qrReadyTime = 0;


  // return to start screen

  hasStarted = false;

}


// =======================================================
// HEART CONFIDENCE DISPLAY
// =======================================================

function drawHeartConfidence() {

  // Pixel heart, same "<3" shape as the QR heart.
  // Squares fill up from the bottom.

  let heartSize = 84;   // height in px

  let cx = 60;

  let top = 66;

  let cells = 15;       // squares across


  let celebrating =
    meterDisplay >= 0.999 || countdownActive;


  push();

  noStroke();


  // heartbeat pulse when the pose is right

  if (celebrating) {

    let beat =
      1 + 0.1 * abs(sin(millis() * 0.008));

    translate(cx, top + heartSize / 2);
    scale(beat);
    translate(-cx, -(top + heartSize / 2));

  }


  let u = heartSize / 2.236;

  let m = (2 * 1.223 * u) / cells;

  let rows = Math.ceil(heartSize / m);

  let left = cx - (cells * m) / 2;


  // glow squares around the heart

  if (celebrating) {

    fill(PINK[0], PINK[1], PINK[2], 45);

    for (let r = -1; r <= rows; r++) {

      for (let c = -1; c <= cells; c++) {

        let near = false;

        for (let dr = -1; dr <= 1 && !near; dr++) {

          for (let dc = -1; dc <= 1 && !near; dc++) {

            let X = (left + (c + dc + 0.5) * m - cx) / u;
            let Y = 1.236 - ((r + dr + 0.5) * m) / u;

            if (insideHeartShape(X, Y)) {
              near = true;
            }

          }

        }

        if (near) {
          rect(left + c * m, top + r * m, m - 1, m - 1);
        }

      }

    }

  }


  // heart squares: pink up to the fill line, slate above

  let filledRows = meterDisplay * rows;

  for (let r = 0; r < rows; r++) {

    for (let c = 0; c < cells; c++) {

      let X = (left + (c + 0.5) * m - cx) / u;
      let Y = 1.236 - ((r + 0.5) * m) / u;

      if (!insideHeartShape(X, Y)) {
        continue;
      }

      let fromBottom = rows - r;

      if (fromBottom <= filledRows) {
        fill(PINK[0], PINK[1], PINK[2]);
      }

      else {
        fill(50, 50, 60, 200);
      }

      rect(left + c * m, top + r * m, m - 1, m - 1);

    }

  }


  // percent

  fill(255);

  textAlign(CENTER, CENTER);

  textSize(TYPE_BODY);

  text(
    `${int(meterDisplay * 100)}%`,
    cx,
    top + heartSize * 0.42
  );


  if (meterDisplay >= 0.999 && !countdownActive) {

    fill(PINK[0], PINK[1], PINK[2]);

    textSize(TYPE_SMALL);

    text("hold it <3", cx, top + heartSize + 18);

  }


  pop();

}


// =======================================================
// HEART SHAPE
// =======================================================

function drawHeart(
  x,
  y,
  size,
  g
) {

  // Same "<3" shape as the QR heart and meter.
  // x = center, y = top, size = height.
  // g = optional graphics buffer (like the photostrip)

  let t = g || window;

  let u = size / 2.236;

  let sx = (X) => x + X * u;
  let sy = (Y) => y + (1.236 - Y) * u;


  // the "<" point
  t.quad(
    sx(0), sy(HEART_C + HEART_D),
    sx(HEART_D), sy(HEART_C),
    sx(0), sy(HEART_C - HEART_D),
    sx(-HEART_D), sy(HEART_C)
  );


  // the "3" bumps
  let by = HEART_C + HEART_D / 2;

  t.circle(sx(-HEART_D / 2), sy(by), HEART_R * 2 * u);
  t.circle(sx(HEART_D / 2), sy(by), HEART_R * 2 * u);

}


// =======================================================
// START SCREEN
// =======================================================

function drawStartScreen() {


  let spacing =
    width /
    (
      poseOrder.length +
      1
    );


  // -----------------------
  // POSE ICONS
  // -----------------------

  for (
    let i = 0;
    i < poseOrder.length;
    i++
  ) {


    let img =
      poseImages[
        poseOrder[i]
      ];


    if (!img) {
      continue;
    }


    let x =
      spacing *
      (
        i + 1
      );


    let y =
      height / 2 -
      80;


    let tilt =
      sin(
        millis() *
        0.002 +
        i * 1.2
      )
      *
      0.15;


    push();


    translate(
      x,
      y
    );


    rotate(
      tilt
    );


    imageMode(CENTER);


    image(
      img,
      0,
      0,
      100,
      100
    );


    pop();

  }


  // -----------------------
  // TITLE
  // -----------------------

  fill(PINK[0], PINK[1], PINK[2]);


  noStroke();


  textAlign(
    CENTER,
    CENTER
  );


  textSize(TYPE_TITLE);


  text(
    "HE<3RT 2 HE<3RT",
    width / 2,
    height / 2 + 100
  );


  textSize(TYPE_BODY);


  text(
    "Give your best heart pose! PRESS THE BUTTON when ready.",
    width / 2,
    height / 2 + 140
  );

}


// =======================================================
// CLICK OR BUTTON (ENTER) TO START
// =======================================================

function mousePressed() {

  startSession();

}


// The one-button keyboard sends ENTER.
// (SHIFT also works, just in case.)

function keyPressed() {

  if (keyCode === ENTER || keyCode === SHIFT) {

    startSession();

  }

}


function startSession() {


  if (
    !hasStarted &&
    !sessionComplete
  ) {


    // Browser audio needs
    // user interaction first.

    userStartAudio();


    hasStarted = true;


    // Start classifier only once.

    classifyVideo();

  }

}
  