import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { textToPhonemeTimeline, timelineToIpaString } from "./phonetics.js";
import { clearBlend, smoothMorphTowardTargets } from "./lipsync.js";

const canvas = document.getElementById("vrm-canvas");
const form = document.getElementById("speak-form");
const input = document.getElementById("text-input");
const speakBtn = document.getElementById("speak-btn");
const ipaEl = document.getElementById("ipa-display");
const timelineEl = document.getElementById("timeline");
const statusEl = document.getElementById("status");
const speedSlider = document.getElementById("speed-slider");
const speedValueEl = document.getElementById("speed-value");
const exaggerateSlider = document.getElementById("exaggerate-slider");
const exaggerateValueEl = document.getElementById("exaggerate-value");
const transitionSlider = document.getElementById("transition-slider");
const transitionValueEl = document.getElementById("transition-value");

function updateSpeedLabel() {
  const ms = Number(speedSlider.value);
  speedValueEl.textContent = `${ms} ms per sound`;
  speedSlider.setAttribute("aria-valuetext", `${ms} milliseconds per sound`);
}

function updateExaggerateLabel() {
  const x = Number(exaggerateSlider.value);
  exaggerateValueEl.textContent = `${x.toFixed(2)}×`;
  exaggerateSlider.setAttribute("aria-valuetext", `${x.toFixed(2)} times baseline mouth strength`);
}

function updateTransitionLabel() {
  const ms = Number(transitionSlider.value);
  transitionValueEl.textContent = ms === 0 ? "Off (snap)" : `${ms} ms`;
  transitionSlider.setAttribute("aria-valuetext", ms === 0 ? "instant" : `${ms} milliseconds blend`);
}

speedSlider.addEventListener("input", updateSpeedLabel);
exaggerateSlider.addEventListener("input", updateExaggerateLabel);
transitionSlider.addEventListener("input", updateTransitionLabel);
updateSpeedLabel();
updateExaggerateLabel();
updateTransitionLabel();

let morphMeshes = [];
let playing = false;

// ── Three.js setup ──
const w = canvas.clientWidth || 640;
const h = canvas.clientHeight || 480;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(w, h, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1222);

const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
camera.position.set(0, 1.3, 1.6);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(1, 2, 2);
scene.add(dir);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.42, 0);
controls.update();

window.addEventListener("resize", () => {
  const cw = canvas.clientWidth || 640;
  const ch = canvas.clientHeight || 480;
  camera.aspect = cw / ch;
  camera.updateProjectionMatrix();
  renderer.setSize(cw, ch, false);
});

(function tick() {
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
})();

// ── Load VRM on page open ──
async function loadVrm() {
  statusEl.textContent = "Loading Tommyv4.vrm…";

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  try {
    const gltf = await loader.loadAsync("./Tommyv4.vrm");
    const vrm = gltf.userData.vrm;
    if (!vrm) { statusEl.textContent = "No VRM data found in file."; return; }

    VRMUtils.rotateVRM0(vrm);
    scene.add(vrm.scene);

    vrm.scene.traverse((o) => {
      if ((!o.isSkinnedMesh && !o.isMesh) || !o.morphTargetDictionary) return;
      if (o.morphTargetDictionary["0"] !== undefined && o.morphTargetDictionary["21"] !== undefined) {
        morphMeshes.push(o);
      }
    });

    if (morphMeshes.length === 0) {
      statusEl.textContent = "VRM loaded but no 0–21 morph targets found.";
    } else {
      statusEl.textContent = `Ready — ${morphMeshes.length} mesh(es). Type a word and hit Speak.`;
    }
  } catch (e) {
    console.error(e);
    statusEl.textContent = `Failed: ${e.message}`;
  }
}

loadVrm();

// ── Speak handler ──
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || playing || morphMeshes.length === 0) return;

  playing = true;
  speakBtn.disabled = true;
  speedSlider.disabled = true;
  exaggerateSlider.disabled = true;
  transitionSlider.disabled = true;

  const msPerPhone = Number(speedSlider.value);
  const exaggerate = Number(exaggerateSlider.value);
  const crossfadeMs = Number(transitionSlider.value);
  const timeline = textToPhonemeTimeline(text, msPerPhone);
  const ipa = timelineToIpaString(timeline);

  // show IPA
  ipaEl.hidden = false;
  ipaEl.innerHTML = `<span class="label">IPA</span><span class="ipa">${ipa}</span>`;

  // build timeline pills
  timelineEl.hidden = false;
  timelineEl.innerHTML = "";
  const pills = [];
  for (const entry of timeline) {
    if (entry.phoneme === "SIL") continue;
    const span = document.createElement("span");
    span.className = "phone";
    span.textContent = entry.phoneme;
    timelineEl.appendChild(span);
    pills.push({ el: span, entry });
  }

  statusEl.textContent = "Playing…";

  // play through timeline using real timestamps
  const t0 = performance.now();
  const totalDuration = timeline[timeline.length - 1].end;
  let lastStepT = performance.now();
  const target22 = new Array(22).fill(0);

  await new Promise((resolve) => {
    function step() {
      const now = performance.now();
      const dtSec = Math.min(0.1, (now - lastStepT) / 1000);
      lastStepT = now;

      const elapsed = now - t0;
      if (elapsed >= totalDuration) {
        clearBlend(morphMeshes);
        pills.forEach((p) => p.el.classList.remove("active"));
        resolve();
        return;
      }

      // find active entry
      let activeEntry = null;
      for (const entry of timeline) {
        if (elapsed >= entry.start && elapsed < entry.end) { activeEntry = entry; break; }
      }

      for (let i = 0; i < 22; i++) target22[i] = 0;
      if (activeEntry) {
        target22[activeEntry.blendId] = exaggerate;
      }
      smoothMorphTowardTargets(morphMeshes, target22, dtSec, crossfadeMs);

      // highlight pill
      for (const p of pills) {
        const on = p.entry === activeEntry;
        p.el.classList.toggle("active", on);
      }

      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });

  statusEl.textContent = "Done. Enter another word.";
  playing = false;
  speakBtn.disabled = false;
  speedSlider.disabled = false;
  exaggerateSlider.disabled = false;
  transitionSlider.disabled = false;
});
