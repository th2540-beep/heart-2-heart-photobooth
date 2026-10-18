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

// one of your hand hearts, picked at random each session,
// shown as a matching pair beside the logo on the strip
let logoPose = "";


// Photostrip colors take turns every session:
//   "pink"  = pink strip, black words
//   "black" = black strip, pink words
//   "white" = white strip, pink words

// (a function, so it can use PINK / BG_DARK defined further down)
function stripThemes() {
  return {
    pink:  { bg: PINK,                        fg: [BG_DARK, BG_DARK, BG_DARK] },
    black: { bg: [BG_DARK, BG_DARK, BG_DARK], fg: PINK },
    white: { bg: [255, 255, 255],             fg: PINK }
  };
}

const STRIP_THEME_ORDER = ["pink", "black", "white"];

let stripThemeIndex = -1;

let stripTheme = "pink";

function stripBG() {
  return stripThemes()[stripTheme].bg;
}

function stripFG() {
  return stripThemes()[stripTheme].fg;
}


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


// The Teachable Machine model names some labels a little
// differently ("Not A Heart", "Hold Hands Heart"). This
// matches them to the names used in this code.

function matchLabel(name) {

  let key = String(name || "").trim().toLowerCase();

  let names = {
    "not a heart": "Not a Heart",
    "hold hands heart": "Holding Hands Heart",
    "holding hands heart": "Holding Hands Heart",
    "finger heart": "Finger Heart",
    "classic hand heart": "Classic Hand Heart",
    "claw heart": "Claw Heart",
    "pyramid heart": "Pyramid Heart"
  };

  return names[key] || name;

}


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


// Outline color around the hand stickers (255 = white, 20 = black)
const STICKER_OUTLINE = 255;


// Saying + date at the bottom of the photostrip
// Sayings -- one of each is picked at random every session.
// Add, remove or edit lines freely.

// ending screen title AND bottom of the photostrip
// (each session uses two different ones)
const END_SAYINGS = [
  "Glad we had this talk <3",
  "Thanks for the heart to heart!",
  "Good talk <3"
];

const STRIP_SAYINGS = END_SAYINGS;

// the ending screen also gets these longer ones
// (too long to fit on the photostrip)
const END_TITLES = END_SAYINGS.concat([
  "Hope this inspires your poses in the future!",
  "Use these as a reference for future photoshoots!"
]);

// line on the "Preparing your HE<3RTs..." screen
const LOADING_LINES = [
  "You really gave your best heart poses!",
  "Those were some interesting poses!",
  "You're weirdly good at that!",
  "Hands down, that was great!",
  "Your hands have range.",
  "You're very creative!"
];

let STRIP_SAYING = STRIP_SAYINGS[0];
let endTitle = END_TITLES[0];
let loadingLine = LOADING_LINES[0];


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

let poseGoodEnough = false;

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

const REQUIRE_HANDS = false;  // hand check turned off

let handTracker = null;
let handTrackerReady = false;
let lastHandSeen = 0;

// true  = only the pose shown in the strip counts
// false = any heart pose counts
const REQUIRE_PROMPTED_POSE = true;


// QR will stay visible for 45 seconds

const RESET_DELAY = 45000;

let qrReadyTime = 0;


// The "Preparing your HE<3RTs..." screen always shows at
// least this long, even if the upload finishes sooner.
const MIN_LOADING_MS = 6000;

let finishStartTime = 0;


// when the QR / error screen actually appears
function resultShownTime() {
  return max(qrReadyTime, finishStartTime + MIN_LOADING_MS);
}


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
// FULL-SCREEN SIZING
// =======================================================

const DESIGN_H = 600;


// design width that matches the window's shape
function designWidth() {

  return Math.round(DESIGN_H * windowWidth / windowHeight);

}


// stretch the canvas over the whole window, rendered sharp
function fitToScreen() {

  let pd = min(4, (windowHeight * window.devicePixelRatio) / DESIGN_H);

  pixelDensity(pd);

  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = "#141414";

  // style THE booth canvas (not any other canvas on the page),
  // and win over any CSS in index.html
  let c = drawingContext && drawingContext.canvas;

  if (c) {
    let st = c.style;
    st.setProperty("position", "fixed", "important");
    st.setProperty("left", "0", "important");
    st.setProperty("top", "0", "important");
    st.setProperty("width", "100vw", "important");
    st.setProperty("height", "100vh", "important");
    st.setProperty("margin", "0", "important");
    st.setProperty("z-index", "10", "important");
  }

  document.documentElement.style.background = "#141414";

}


// if the window changes size, refit
function windowResized() {

  resizeCanvas(designWidth(), DESIGN_H);

  fitToScreen();

  // QR heart is drawn for a specific size; rebuild if showing
  if (qrMatrix) {
    if (qrHeartGfx) qrHeartGfx.remove();
    qrHeartGfx = buildQRHeart(qrMatrix);
  }

}


// =======================================================
// SETUP
// =======================================================

function setup() {

  // -----------------------
  // FULL SCREEN
  // -----------------------
  // The design is always 600 units tall. Its width matches
  // the screen's shape (2560x1440 -> about 1067 x 600), and
  // the canvas is stretched to fill the whole window, sharp.

  createCanvas(designWidth(), DESIGN_H);

  fitToScreen();


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


  // (hand cropping is off -- the corners use your own
  //  hand pictures instead)

}


// =======================================================
// RANDOMIZE POSES
// =======================================================

function randomizePoses() {

  // new sayings for this session
  endTitle = random(END_TITLES);
  STRIP_SAYING = random(STRIP_SAYINGS.filter((t) => t !== endTitle));
  loadingLine = random(LOADING_LINES);

  logoPose = random(poseOrder);

  // next strip colors for the next session
  stripThemeIndex = (stripThemeIndex + 1) % STRIP_THEME_ORDER.length;

  stripTheme = STRIP_THEME_ORDER[stripThemeIndex];

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
          matchLabel(results[0].label);


        let rawConfidence =
          results[0].confidence;


        label =
          rawLabel;


        confidence =
          smoothConfidence(
            rawLabel,
            rawConfidence
          );


        if (IGNORE_LABELS.includes(rawLabel)) {
          confidence = 0;
        }


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

  // photos are always 4:3, cropped from the camera
  const PHOTO_W = 960;
  const PHOTO_H = 720;

  let photo =
    createGraphics(
      PHOTO_W,
      PHOTO_H
    );

  photo.pixelDensity(1);


  // Mirror photo

  photo.push();


  photo.translate(
    PHOTO_W,
    0
  );


  photo.scale(
    -1,
    1
  );


  drawVideoCover(
    photo.drawingContext,
    0,
    0,
    PHOTO_W,
    PHOTO_H
  );


  photo.pop();


  // -----------------------
  // ADD TO STRIP
  // -----------------------

  let entry = {

    img: photo,

    label: label,

    // the pose this photo was for (its corner pictures)
    pose: randomizedPoseOrder[photoStrip.length]

  };

  photoStrip.push(entry);


  // (no live hand cropping)
  entry.handDone = true;


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

  finishStartTime = millis();

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


  // hand stickers (from each photo) for the bottom

  let hands =
    photoStrip
      .map((p) => p.hand)
      .filter((h) => h);


  // room at the bottom for the stickers + saying + date
  const stickerRow = 0;  // stickers now sit on the photo corners

  // room for "Good talk <3" + the date
  const footerHeight =
    130 + stickerRow;


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

  strip.pixelDensity(2);


  // -----------------------
  // BACKGROUND
  // -----------------------

  strip.background(stripBG());


  // -----------------------
  // TITLE
  // -----------------------

  strip.fill(stripFG());


  strip.noStroke();


  strip.textAlign(
    CENTER,
    CENTER
  );


  // stacked title:  HE<3RT / 2 / HE<3RT

  strip.textStyle(BOLD);

  strip.textSize(64);
  strip.text("HE<3RT", stripWidth / 2, 58);

  strip.textSize(64);
  strip.text("HE<3RT", stripWidth / 2, 206);


  // the "2" sits on a little heart,
  // nested between the two lines

  strip.fill(stripFG());
  drawPixelHeart(stripWidth / 2, 88, 80, 15, strip);

  // thick "2", centered in the heart

  strip.fill(stripBG());
  strip.stroke(stripBG());
  strip.strokeWeight(4);
  strip.strokeJoin(ROUND);
  strip.textSize(46);
  strip.textStyle(BOLD);
  strip.textAlign(CENTER, BASELINE);
  strip.text("2", stripWidth / 2, 141);
  strip.textAlign(CENTER, CENTER);
  strip.textStyle(NORMAL);
  strip.noStroke();


  // matching hand hearts beside the logo

  drawLogoHands(stripWidth / 2, 127, 200, 110, strip);





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


    // (no photo borders)

    strip.noStroke();



  }


  // -----------------------
  // SAYING + DATE
  // -----------------------

  let footerTop =
    titleHeight +
    photoHeight * MAX_PHOTOS +
    gap * (MAX_PHOTOS - 1);

  strip.noStroke();

  strip.fill(stripFG());

  strip.textAlign(CENTER, CENTER);

  // the saying

  strip.textStyle(BOLD);

  strip.textSize(34);

  strip.text(
    STRIP_SAYING,
    stripWidth / 2,
    footerTop + stickerRow + 52
  );


  // the date

  strip.textStyle(NORMAL);

  strip.textSize(22);

  strip.text(
    nf(month(), 2) + "." + nf(day(), 2) + "." + nf(year() % 100, 2),
    stripWidth / 2,
    footerTop + stickerRow + 94
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
// =======================================================
// EVEN SPACING ON THE BIG SCREENS
// =======================================================

// Same gap between every graphic and text on the home,
// processing, QR and error screens.
const SCREEN_GAP = 36;


// Stacks items of the given heights with SCREEN_GAP between
// them, centered on the screen. Returns each item's center y.

function stackCenters(heights) {

  let total =
    heights.reduce((a, b) => a + b, 0) +
    SCREEN_GAP * (heights.length - 1);

  let y = (DESIGN_H - total) / 2;

  let centers = [];

  for (let h of heights) {
    centers.push(y + h / 2);
    y += h + SCREEN_GAP;
  }

  return centers;

}


// visual height of a line of text at a given size
function textH(size) {
  return size * 0.75;
}


// QR screen: title, QR heart, countdown
function qrLayout() {

  let heartH = QR_HEART_SCALE * 2.236;

  let c = stackCenters([textH(TYPE_TITLE), heartH, textH(TYPE_SMALL)]);

  return {
    titleY: c[0],
    heartTop: c[1] - heartH / 2,
    rebootY: c[2]
  };

}
const QR_HEART_SCALE = 120;  // px per heart unit (size)
const QR_QUIET = 1;          // plain pink squares around QR


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
    qrLayout().heartTop + (1.236 - Y) * k;


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

  let jMin = Math.floor((qrLayout().heartTop - gridY0) / m) - pad;
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
      let Y = 1.236 - (py - qrLayout().heartTop) / k;

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

  // Meter shows the accuracy directly (like before).

  meterDisplay = confidence;


  // Is the pose good enough to take a photo?

  poseGoodEnough =
    label in THRESHOLDS &&
    confidence >= THRESHOLDS[label];


  // celebrate while the pose is right / counting down

  if ((poseGoodEnough || countdownActive) && random() < 0.3) {

    particles.push({
      x: 84 + random(-50, 50),
      y: 75 + random(0, 15),
      vx: random(-0.4, 0.4),
      vy: random(-1.6, -0.8),
      life: 255,
      size: random(12, 20)
    });

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

    // turned so the <3 stands upright like a heart
    push();
    translate(p.x, p.y);
    rotate(-HALF_PI);
    text("<3", 0, 0);
    pop();

  }

  pop();

}


// =======================================================
// SOLID PIXEL HEART (same squares as the meter)
// =======================================================

// cx = center, top = top edge, size = height,
// cells = squares across, g = optional graphics buffer.
// Uses the current fill color.

function drawPixelHeart(cx, top, size, cells, g, solid) {

  let t = g || window;

  let u = size / 2.236;

  let m = (2 * 1.223 * u) / cells;

  let rows = Math.ceil(size / m);

  let left = cx - (cells * m) / 2;

  // solid = no gaps between squares
  let gapPx = solid ? -0.5 : max(0.5, m * 0.12);

  t.noStroke();

  for (let r = 0; r < rows; r++) {

    for (let c = 0; c < cells; c++) {

      let X = (left + (c + 0.5) * m - cx) / u;
      let Y = 1.236 - ((r + 0.5) * m) / u;

      if (insideHeartShape(X, Y)) {

        t.rect(left + c * m, top + r * m, m - gapPx, m - gapPx);

      }

    }

  }

}


// =======================================================
// HAND STICKERS: crop each guest's hands from their photo
// =======================================================

let handModel = null;
let handModelKind = "";


function loadHandModel() {

  try {

    if (ml5.handpose) {

      // ml5 version 0.x
      handModel = ml5.handpose(() => {
        console.log("Hand model ready");
      });

      handModelKind = "v0";

    }

    else if (ml5.handPose) {

      // ml5 version 1.x
      handModel = ml5.handPose();

      handModelKind = "v1";

    }

  }

  catch (e) {

    console.warn("No hand stickers (hand model unavailable):", e);

    handModel = null;

  }

}


// Finds the hands in one photo (runs once per photo,
// so it doesn't slow down the booth) and saves a
// square crop around them as entry.hand.

function findHandCrop(entry) {

  entry.handDone = false;

  if (!handModel) {
    entry.handDone = true;
    return;
  }


  let photo = entry.img;

  let scaleF = photo.elt.width / photo.width;


  let done = (results) => {

    try {

      let pts = [];

      for (let h of results || []) {

        if (h.landmarks) {
          for (let lm of h.landmarks) pts.push([lm[0], lm[1]]);
        }

        if (h.keypoints) {
          for (let k of h.keypoints) pts.push([k.x, k.y]);
        }

      }

      if (pts.length > 0) {

        let xs = pts.map((p) => p[0] / scaleF);
        let ys = pts.map((p) => p[1] / scaleF);

        let x0 = min(xs), x1 = max(xs);
        let y0 = min(ys), y1 = max(ys);

        let side = max(x1 - x0, y1 - y0) * 1.4;

        let cx = (x0 + x1) / 2;
        let cy = (y0 + y1) / 2;

        side = min(side, photo.width, photo.height);

        let sx = constrain(cx - side / 2, 0, photo.width - side);
        let sy = constrain(cy - side / 2, 0, photo.height - side);

        entry.hand = photo.get(sx, sy, side, side);

      }

    }

    catch (e) {

      console.warn("Hand crop failed:", e);

    }

    entry.handDone = true;

  };


  try {

    if (handModelKind === "v0") {

      let result = handModel.predict(photo.elt);

      if (result && result.then) {
        result.then(done).catch(() => (entry.handDone = true));
      }

      else {
        entry.handDone = true;
      }

    }

    else {

      handModel.detect(photo.elt, done);

    }

  }

  catch (e) {

    console.warn("Hand search failed:", e);

    entry.handDone = true;

  }


  // never wait forever
  setTimeout(() => (entry.handDone = true), 2500);

}


// Wait (up to a moment) for the hand crops to finish.

async function waitForHandCrops(maxMs) {

  let start = millis();

  while (
    millis() - start < maxMs &&
    photoStrip.some((p) => !p.handDone)
  ) {

    await new Promise((r) => setTimeout(r, 100));

  }

}


// Two hand stickers on opposite (diagonal) corners of a photo.
// Even photos: top-left + bottom-right.
// Odd photos:  top-right + bottom-left (flipped).

function drawCornerStickers(entry, index, px, py, pw, ph, size, inset, g) {

  let t = g || window;

  // corners use YOUR hand pictures: the pose this photo
  // was for (finger heart picture if missing)
  let useFallback = true;

  let fallbackImg =
    poseImages[entry.pose] || poseImages["Finger Heart"];

  if (useFallback && !fallbackImg) {
    return;
  }


  // make (and remember) the sticker + its mirror image

  let key = "sticker" + size;

  if (useFallback) {
    key = "fallback" + size;
  }

  if (!entry[key]) {

    // no hands found -> use your finger heart picture instead
    let st = useFallback
      ? fallbackImg
      : heartSticker(entry.hand, size);

    let flip = createGraphics(size, size);

    flip.translate(size, 0);
    flip.scale(-1, 1);
    flip.image(st, 0, 0, size, size);

    entry[key] = [st, flip.get()];

    flip.remove();

  }


  let [st, stFlip] = entry[key];


  let corners =
    index % 2 === 0
      ? [["L", "T"], ["R", "B"]]
      : [["R", "T"], ["L", "B"]];


  corners.forEach(([hx, vy], k) => {

    let cx = hx === "L" ? px + inset : px + pw - inset;
    let cy = vy === "T" ? py + inset : py + ph - inset;


    // dark outline heart behind (only for real hand crops)

    if (!useFallback) {

      t.fill(STICKER_OUTLINE);

      drawPixelHeart(cx, cy - size / 2 - size * 0.05, size * 1.1, 15, g, true);

    }


    // tilt each picture a little, like stuck-on stickers
    // (different angle on each corner)

    let tilts = [-18, 14, 16, -12, -10, 20, 12, -16];

    let angle = tilts[(index * 2 + k) % tilts.length];


    t.push();

    t.translate(cx, cy);

    t.rotate(radians(angle));

    t.imageMode(CENTER);

    t.image(
      k === 0 ? st : stFlip,
      0,
      0,
      size,
      size
    );


    // pink border around your hand picture

    t.noFill();

    t.stroke(PINK[0], PINK[1], PINK[2]);

    t.strokeWeight(max(1, size * 0.04));

    t.rectMode(CENTER);

    t.rect(0, 0, size, size, size * 0.08);

    t.pop();

    t.noStroke();

  });

}


// Cut an image into the pixel-heart shape.

function heartSticker(img, size) {

  let pic = createGraphics(size, size);

  pic.image(img, 0, 0, size, size);

  let shape = createGraphics(size, size);

  shape.fill(255);

  drawPixelHeart(size / 2, size * 0.04, size * 0.92, 13, shape, true);

  let out = pic.get();

  out.mask(shape.get());

  pic.remove();
  shape.remove();

  return out;

}


// =======================================================
// CAMERA DRAWING (fills the area, no gaps, no stretching)
// =======================================================

// Draws the webcam into a box, cropping the middle so it
// fills the box completely whatever shape the camera is.

function drawVideoCover(ctx, dx, dy, dw, dh) {

  let el = video.elt;

  let vw = el.videoWidth || video.width;
  let vh = el.videoHeight || video.height;

  if (!vw || !vh) {
    return;
  }

  let boxRatio = dw / dh;

  let sw = vw;
  let sh = vh;

  if (sw / sh > boxRatio) {
    sw = sh * boxRatio;
  }
  else {
    sh = sw / boxRatio;
  }

  try {

    ctx.drawImage(
      el,
      (vw - sw) / 2,
      (vh - sh) / 2,
      sw,
      sh,
      dx,
      dy,
      dw,
      dh
    );

  }

  catch (e) {
    // camera not ready yet
  }

}


// Matching pair of your hand hearts on either side of
// the logo (the right one is mirrored so they face in).

function drawLogoHands(cx, cy, offset, size, g) {

  let t = g || window;

  let img = poseImages[logoPose];

  if (!img) {
    return;
  }

  t.push();
  t.imageMode(CENTER);
  t.translate(cx - offset, cy);
  t.rotate(-0.15);
  t.image(img, 0, 0, size, size);
  t.pop();

  t.push();
  t.imageMode(CENTER);
  t.translate(cx + offset, cy);
  t.rotate(0.15);
  t.scale(-1, 1);
  t.image(img, 0, 0, size, size);
  t.pop();

}


// Draws a row of all your hand-heart pictures, centered at
// (cx, cy), spread across `rowWidth`, each `size` big.

function drawHandRow(cx, cy, rowWidth, size, g) {

  let t = g || window;

  let n = poseOrder.length;

  let step = rowWidth / n;

  t.push();

  t.imageMode(CENTER);

  for (let i = 0; i < n; i++) {

    let img = poseImages[poseOrder[i]];

    if (!img) {
      continue;
    }

    t.image(
      img,
      cx - rowWidth / 2 + step * (i + 0.5),
      cy,
      size,
      size
    );

  }

  t.pop();

}


// Hand hearts floating in a ring around the QR heart.

function drawHandsAroundQR(size) {

  let cx = width / 2;

  // middle of the QR heart
  let cy = qrLayout().heartTop + QR_HEART_SCALE * 1.118;

  let rx = QR_HEART_SCALE * 2.2;
  let ry = QR_HEART_SCALE * 1.6;

  // 3 on the left, 3 on the right (degrees)
  let angles = [150, 180, 210, 30, 0, -30];

  for (let i = 0; i < angles.length; i++) {

    let img = poseImages[poseOrder[i % poseOrder.length]];

    if (!img) {
      continue;
    }

    let a = radians(angles[i]);

    let tilt = sin(millis() * 0.002 + i * 1.2) * 0.15;

    let bob = sin(millis() * 0.0025 + i * 0.9) * 6;

    push();

    translate(cx + cos(a) * rx, cy - sin(a) * ry + bob);

    rotate(tilt);

    imageMode(CENTER);

    image(img, 0, 0, size, size);

    pop();

  }

}


// =======================================================
// FLOATING, ROCKING HAND HEARTS (QR screen)
// =======================================================

function drawFloatingHands(y, size) {

  let n = poseOrder.length;

  let spacing = width / (n + 1);

  for (let i = 0; i < n; i++) {

    let img = poseImages[poseOrder[i]];

    if (!img) {
      continue;
    }

    // same gentle rocking as the start screen, plus a little bob
    let tilt = sin(millis() * 0.002 + i * 1.2) * 0.15;

    let bob = sin(millis() * 0.0025 + i * 0.9) * 6;

    push();

    translate(spacing * (i + 1), y + bob);

    rotate(tilt);

    imageMode(CENTER);

    image(img, 0, 0, size, size);

    pop();

  }

}


// Pixel heart that fills from the bottom (0..1),
// same look as the accuracy meter.

function drawFillingPixelHeart(cx, top, size, cells, amount) {

  let u = size / 2.236;

  let m = (2 * 1.223 * u) / cells;

  let rows = Math.ceil(size / m);

  let left = cx - (cells * m) / 2;

  let filledRows = amount * rows;

  push();

  noStroke();

  for (let r = 0; r < rows; r++) {

    for (let c = 0; c < cells; c++) {

      let X = (left + (c + 0.5) * m - cx) / u;
      let Y = 1.236 - ((r + 0.5) * m) / u;

      if (!insideHeartShape(X, Y)) {
        continue;
      }

      if (rows - r <= filledRows) {
        fill(PINK[0], PINK[1], PINK[2]);
      }
      else {
        fill(50, 50, 60, 200);
      }

      rect(left + c * m, top + r * m, m - 1, m - 1);

    }

  }

  pop();

}


// =======================================================
// MAIN DRAW LOOP
// =======================================================

function draw() {

  background(20);

  // titles are bold; smaller text is regular
  textStyle(NORMAL);


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
    width - 160;


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


  drawVideoCover(
    drawingContext,
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


      textStyle(BOLD);

      text(
        countdownValue,
        cameraWidth / 2,
        height / 2
      );

      textStyle(NORMAL);

    }

  }


  // -----------------------
  // LABEL
  // -----------------------

  fill(255);


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


  // margin so the strip doesn't touch the screen edges

  const EDGE = 0;   // strip fills its whole column (no black space)

  startX += EDGE;

  stripWidth -= EDGE * 2;

  let stripH = height - EDGE * 2;


  push();

  translate(0, EDGE);


  // strip colors alternate each session (no outline)
  fill(stripBG());

  noStroke();


  // full-height pink strip
  rect(
    startX,
    0,
    stripWidth,
    stripH
  );

  noStroke();


  // -----------------------
  // TITLE
  // -----------------------

  fill(stripFG());


  textAlign(
    CENTER,
    CENTER
  );


  // stacked title:  HE<3RT / 2 / HE<3RT

  noStroke();

  let tcx = startX + stripWidth / 2;


  // layout: title at the top, then 4 photos that
  // fill the rest of the strip with small even gaps

  const BOX_GAP = 8;
  const TITLE_H = 50;
  const TITLE_GAP = 12;
  const BOTTOM_PAD = 10;

  let top0 = 12;

  let ty = top0 + 6;   // first title line

  let boxW = stripWidth - 20;

  let boxH =
    (stripH - top0 - TITLE_H - TITLE_GAP - BOTTOM_PAD -
      (MAX_PHOTOS - 1) * BOX_GAP) / MAX_PHOTOS;

  textStyle(BOLD);

  textSize(15);
  text("HE<3RT", tcx, ty);

  textSize(15);
  text("HE<3RT", tcx, ty + 38);

  textStyle(NORMAL);


  // the "2" sits on a little heart,
  // nested between the two lines

  fill(stripFG());
  drawPixelHeart(tcx, ty + 9, 21, 9);

  // thick "2", centered in the heart

  fill(stripBG());
  stroke(stripBG());
  strokeWeight(1.2);
  textSize(12);
  textStyle(BOLD);
  textAlign(CENTER, BASELINE);
  text("2", tcx, ty + 23);
  textAlign(CENTER, CENTER);
  textStyle(NORMAL);
  noStroke();


  // (the matching hand hearts only appear on the
  //  final saved photostrip, not this preview)

  fill(BG_DARK);





  const STRIP_TOP = top0 + TITLE_H + TITLE_GAP;


  // distance from one photo to the next
  let photoHeight =
    boxH + BOX_GAP;


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


    // every slot uses the same box, so photos and
    // empty slots are exactly the same size

    let pad = 10;

    let pw = stripWidth - pad * 2;

    let ph = boxH;

    let px = startX + (stripWidth - pw) / 2;

    let py = y;




    // -----------------------
    // CAPTURED PHOTO
    // -----------------------

    if (
      i <
      photoStrip.length
    ) {


      // smaller photo so the strip
      // border shows around it



      // crop the photo to fill the box (no stretching)

      let img = photoStrip[i].img;

      let boxRatio = pw / ph;

      let sw = img.width;
      let sh = img.height;

      if (sw / sh > boxRatio) {
        sw = sh * boxRatio;
      }
      else {
        sh = sw / boxRatio;
      }

      image(
        img,
        px,
        py,
        pw,
        ph,
        (img.width - sw) / 2,
        (img.height - sh) / 2,
        sw,
        sh
      );


      // (no photo borders)

      noStroke();

      // (hand hearts now sit between the photos)

    }


    // -----------------------
    // CURRENT POSE
    // -----------------------

    else if (
      i ===
      photoStrip.length
    ) {


      // light grey card (like before)

      fill(240);

      noStroke();

      rect(
        px,
        py,
        pw,
        ph
      );


      let poseImg =
        poseImages[
          randomizedPoseOrder[i]
        ];


      if (poseImg) {

        push();


        imageMode(CENTER);


        let imgSize =
          ph - 26;


        image(
          poseImg,

          startX +
          stripWidth / 2,

          py + ph / 2 + 6,

          imgSize,
          imgSize
        );


        pop();

      }


      // (no border on the next-pose slot)

      fill(stripFG());


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
        py + 4
      );

    }


    // -----------------------
    // FUTURE SLOT
    // -----------------------

    else {


      fill(220);


      noStroke();


      rect(
        px,
        py,
        pw,
        ph
      );


      fill(stripFG());


      textSize(11);


      textAlign(
        CENTER,
        CENTER
      );


      text(
        `Photo ${i + 1}`,
        startX +
        stripWidth / 2,
        py + ph / 2
      );

    }

  }

  pop();

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
    "uploading" ||
    millis() - finishStartTime < MIN_LOADING_MS
  ) {


    // heart graphic + title + line, evenly spaced
    let loadC = stackCenters([84, textH(TYPE_TITLE), textH(TYPE_BODY)]);


    // pixel heart that fills up like a loading bar
    // (holds just under full until the upload is done)
    let progress = (millis() - finishStartTime) / MIN_LOADING_MS;

    if (uploadState === "uploading") {
      progress = min(progress, 0.95);
    }

    drawFillingPixelHeart(width / 2, loadC[0] - 42, 84, 15, constrain(progress, 0, 1));


    fill(PINK[0], PINK[1], PINK[2]);


    noStroke();


    textSize(TYPE_TITLE);


    textStyle(BOLD);

    text(
      loadingLine,
      width / 2,
      loadC[1]
    );

    textStyle(NORMAL);


    fill(255);


    textSize(TYPE_BODY);


    text(
      "Preparing your HE<3RTs...",
      width / 2,
      loadC[2]
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

    fill(255);


    textSize(TYPE_TITLE);


    textStyle(BOLD);

    text(
      endTitle,
      width / 2,
      qrLayout().titleY
    );

    textStyle(NORMAL);


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
      resultShownTime();


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


    // your hand hearts floating + rocking around the QR heart

    drawHandsAroundQR(78);


    fill(255);


    textSize(TYPE_SMALL);


    textStyle(ITALIC);

    text(
      "Photobooth rebooting in " +
      secondsLeft +
      "s",
      width / 2,
      qrLayout().rebootY
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


    textStyle(BOLD);

    text(
      "Your HE<3RTs were captured!",
      width / 2,
      stackCenters([textH(TYPE_TITLE), textH(TYPE_BODY)])[0]
    );

    textStyle(NORMAL);


    fill(255);


    textSize(TYPE_BODY);


    text(
      "QR download is temporarily unavailable.",
      width / 2,
      stackCenters([textH(TYPE_TITLE), textH(TYPE_BODY)])[1]
    );


    textSize(TYPE_SMALL);


    fill(PINK[0], PINK[1], PINK[2]);





    // Reset after 15 seconds
    // if upload failed

    if (
      millis() -
      resultShownTime() >
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

  let cx = 84;   // moved in from the screen edge

  let top = 66;

  let cells = 15;       // squares across


  let celebrating =
    poseGoodEnough || countdownActive;


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


  if (poseGoodEnough && !countdownActive) {

    fill(255);

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

// home screen: hand hearts row, logo, instructions
function homeLayout() {
  return stackCenters([64, 84, textH(TYPE_BODY)]);
}


function drawStartScreen() {


  // hand hearts: smaller, and the row is as wide as the
  // instruction line underneath

  const ICON = 64;

  push();
  textSize(TYPE_BODY);
  textStyle(NORMAL);
  let rowW = textWidth("Give your best heart pose! PRESS THE BUTTON when ready.");
  pop();

  let rowLeft = width / 2 - rowW / 2 + ICON / 2;

  let spacing =
    (rowW - ICON) / (poseOrder.length - 1);


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
      rowLeft + spacing * i;


    let y =
      homeLayout()[0];


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
      ICON,
      ICON
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


  // big logo: HE<3RT [heart with 2] HE<3RT in one row

  let ly = homeLayout()[1];   // middle of the row

  textStyle(BOLD);

  textSize(72);

  let tw = textWidth("HE<3RT");

  let heartH = 84;
  let heartW = heartH * 1.094;
  let gap = 22;

  let total = tw * 2 + heartW + gap * 2;
  let left = width / 2 - total / 2;

  textAlign(LEFT, CENTER);
  text("HE<3RT", left, ly);
  text("HE<3RT", left + tw + gap * 2 + heartW, ly);
  textAlign(CENTER, CENTER);

  drawPixelHeart(width / 2, ly - heartH * 0.48, heartH, 15);

  fill(BG_DARK);
  stroke(BG_DARK);
  strokeWeight(4);
  strokeJoin(ROUND);
  textSize(48);
  textAlign(CENTER, BASELINE);
  text("2", width / 2, ly - heartH * 0.48 + heartH * 0.66);
  textAlign(CENTER, CENTER);
  noStroke();



  textStyle(NORMAL);


  fill(255);

  textSize(TYPE_BODY);


  text(
    "Give your best heart pose! PRESS THE BUTTON when ready.",
    width / 2,
    homeLayout()[2]
  );


  // little version tag (so you can tell which file is running)

  textSize(10);

  textAlign(RIGHT, BOTTOM);

  text("v58", width - 8, height - 6);

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


    // go full screen (hides the browser bar) on the first
    // press -- browsers only allow this after a click/key

    try {
      let el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        let req = el.requestFullscreen();
        if (req && req.catch) req.catch(() => {});
      }
    }
    catch (e) {}


    hasStarted = true;


    // Start classifier only once.

    classifyVideo();

  }

}
  