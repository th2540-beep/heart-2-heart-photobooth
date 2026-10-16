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

const COUNTDOWN_COOLDOWN = 3000;

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

const SMOOTH_FRAMES = 10;

const HOLD_TIME = 600;

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


        let rawConfidence =
          results[0].confidence;


        label =
          rawLabel;


        confidence =
          smoothConfidence(
            rawLabel,
            rawConfidence
          );


        checkForPhoto(
          label,
          confidence
        );

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


  if (

    currentConfidence >= needed &&

    isPoseStable(
      currentLabel
    ) &&

    millis() -
    lastCountdownTime >
    COUNTDOWN_COOLDOWN

  ) {

    startCountdown();


    lastCountdownTime =
      millis();

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


  const titleHeight =
    160;


  const photoHeight =
    480;


  const stripHeight =
    titleHeight +
    photoHeight *
    MAX_PHOTOS;


  let strip =
    createGraphics(
      stripWidth,
      stripHeight
    );


  // -----------------------
  // BACKGROUND
  // -----------------------

  strip.background(240);


  // -----------------------
  // TITLE
  // -----------------------

  strip.fill(
    255,
    100,
    150
  );


  strip.noStroke();


  strip.textAlign(
    CENTER,
    CENTER
  );


  strip.textSize(46);


  strip.text(
    "HE<3RT 2 HE<3RT",
    stripWidth / 2,
    titleHeight / 2
  );


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
      photoHeight;


    strip.image(
      photoStrip[i].img,
      0,
      y,
      stripWidth,
      photoHeight
    );


    // pink border

    strip.noFill();


    strip.stroke(
      255,
      100,
      150
    );


    strip.strokeWeight(8);


    strip.rect(
      0,
      y,
      stripWidth,
      photoHeight
    );

  }


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
  new QRCode(qrContainer, {

    text: url,

    width: 400,
    height: 400,

    correctLevel:
      QRCode.CorrectLevel.M

  });


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

  drawHeartConfidence();


  // -----------------------
  // COUNTDOWN
  // -----------------------

  if (countdownActive) {

    updateCountdown();


    if (
      countdownValue > 0
    ) {

      fill(
        255,
        150,
        150
      );


      textSize(120);


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

  fill(255);


  noStroke();


  textSize(20);


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


  fill(240);

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

  fill(
    255,
    100,
    150
  );


  textAlign(
    CENTER,
    CENTER
  );


  textSize(16);


  text(
    "HE<3RT 2 HE<3RT",
    startX +
    stripWidth / 2,
    20
  );


  let photoHeight =
    (height - 40) /
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
      40 +
      i *
      photoHeight;


    // -----------------------
    // CAPTURED PHOTO
    // -----------------------

    if (
      i <
      photoStrip.length
    ) {


      image(
        photoStrip[i].img,
        startX,
        y,
        stripWidth,
        photoHeight
      );


      noFill();


      stroke(
        255,
        100,
        150
      );


      strokeWeight(3);


      rect(
        startX,
        y,
        stripWidth,
        photoHeight
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


      stroke(
        255,
        100,
        150
      );


      strokeWeight(2);


      rect(
        startX + 10,
        y + 10,
        stripWidth - 20,
        photoHeight - 20
      );


      fill(
        255,
        100,
        150
      );


      noStroke();


      textSize(12);


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


      fill(220);


      noStroke();


      rect(
        startX + 10,
        y + 10,
        stripWidth - 20,
        photoHeight - 20
      );


      fill(
        255,
        100,
        150
      );


      textSize(12);


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


    fill(
      255,
      150,
      180
    );


    noStroke();


    textSize(36);


    text(
      "Preparing your HE<3RTs...",
      width / 2,
      height / 2 - 30
    );


    fill(255);


    textSize(20);


    text(
      "One moment ♥",
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


    fill(
      255,
      150,
      180
    );


    textSize(34);


    text(
      "YOUR HE<3RT 2 HE<3RT PHOTOSTRIP IS READY!",
      width / 2,
      55
    );


    // QR

    if (qrImage) {


      imageMode(CENTER);


      image(
        qrImage,
        width / 2,
        275,
        300,
        300
      );


      imageMode(CORNER);

    }


    fill(255);


    textSize(23);


    text(
      "Scan to save your photostrip ♥",
      width / 2,
      465
    );


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


    fill(
      200
    );


    textSize(16);


    text(
      "Next session starts in " +
      secondsLeft +
      " seconds",
      width / 2,
      520
    );


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


    fill(
      255,
      150,
      180
    );


    textSize(32);


    text(
      "Your photos were captured ♥",
      width / 2,
      height / 2 - 45
    );


    fill(255);


    textSize(18);


    text(
      "QR download is temporarily unavailable.",
      width / 2,
      height / 2 + 10
    );


    textSize(15);


    fill(190);


    text(
      "The booth will reset automatically.",
      width / 2,
      height / 2 + 50
    );


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

  qrReadyTime = 0;


  // return to start screen

  hasStarted = false;

}


// =======================================================
// HEART CONFIDENCE DISPLAY
// =======================================================

function drawHeartConfidence() {

  let heartSize = 80;

  let x = 60;

  let y = 70;


  push();


  translate(
    x,
    y
  );


  let fillAmount =
    confidence;


  noStroke();


  // -----------------------
  // EMPTY HEART
  // -----------------------

  fill(
    50,
    50,
    60,
    150
  );


  drawHeart(
    0,
    0,
    heartSize
  );


  // -----------------------
  // FILLED HEART
  // -----------------------

  fill(
    255,
    100,
    150,
    200
  );


  push();


  let clipHeight =
    heartSize *
    (
      1 -
      fillAmount
    );


  clip(() => {


    rect(

      -heartSize,

      clipHeight -
      heartSize,

      heartSize * 2,

      heartSize * 2

    );

  });


  drawHeart(
    0,
    0,
    heartSize
  );


  pop();


  // -----------------------
  // OUTLINE
  // -----------------------

  noFill();


  stroke(
    255,
    150,
    180
  );


  strokeWeight(3);


  drawHeart(
    0,
    0,
    heartSize
  );


  // -----------------------
  // PERCENT
  // -----------------------

  fill(255);


  noStroke();


  textAlign(
    CENTER,
    CENTER
  );


  textSize(18);


  text(
    `${int(
      confidence *
      100
    )}%`,
    0,
    45
  );


  pop();

}


// =======================================================
// HEART SHAPE
// =======================================================

function drawHeart(
  x,
  y,
  size
) {


  beginShape();


  vertex(
    x,
    y +
    size * 0.3
  );


  bezierVertex(

    x,
    y,

    x -
    size * 0.5,
    y,

    x -
    size * 0.5,

    y +
    size * 0.3

  );


  bezierVertex(

    x -
    size * 0.5,

    y +
    size * 0.6,

    x,

    y +
    size * 0.9,

    x,

    y +
    size

  );


  bezierVertex(

    x,

    y +
    size * 0.9,

    x +
    size * 0.5,

    y +
    size * 0.6,

    x +
    size * 0.5,

    y +
    size * 0.3

  );


  bezierVertex(

    x +
    size * 0.5,

    y,

    x,

    y,

    x,

    y +
    size * 0.3

  );


  endShape(CLOSE);

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

  fill(
    255,
    192,
    203
  );


  noStroke();


  textAlign(
    CENTER,
    CENTER
  );


  textSize(32);


  text(
    "HE<3RT 2 HE<3RT",
    width / 2,
    height / 2 + 100
  );


  textSize(16);


  text(
    "Give your best heart pose! CLICK when ready.",
    width / 2,
    height / 2 + 140
  );

}


// =======================================================
// CLICK TO START
// =======================================================

function mousePressed() {


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
  