import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { LipsyncPlayer } from "./lipsync.js";

export class TommyAvatar {
  constructor(canvas, { vrmUrl = "/visme/Tommyv4.vrm" } = {}) {
    this.canvas = canvas;
    this.vrmUrl = vrmUrl;
    this.morphMeshes = [];
    this.lipsync = null;
    this.loaded = false;
    this.speaking = false;
    this.speechElapsedMs = 0;
    this.onStatus = null;

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1222);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    this.camera.position.set(0, 1.4, 1.6);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(1, 2, 2);
    this.scene.add(dir);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.25, 0);
    this.controls.enablePan = false;
    this.controls.update();

    this.lastFrameT = performance.now();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._tick = () => this._renderFrame();
    requestAnimationFrame(this._tick);
  }

  setStatus(msg) {
    if (this.onStatus) this.onStatus(msg);
  }

  async load() {
    this.setStatus("Loading Tommyv4.vrm…");

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    try {
      const gltf = await loader.loadAsync(this.vrmUrl);
      const vrm = gltf.userData.vrm;
      if (!vrm) {
        this.setStatus("No VRM data found in file.");
        return false;
      }

      VRMUtils.rotateVRM0(vrm);
      this.scene.add(vrm.scene);
      this.vrm = vrm;

      vrm.scene.traverse((o) => {
        if ((!o.isSkinnedMesh && !o.isMesh) || !o.morphTargetDictionary) return;
        if (o.morphTargetDictionary["0"] !== undefined && o.morphTargetDictionary["21"] !== undefined) {
          this.morphMeshes.push(o);
        }
      });

      if (this.morphMeshes.length === 0) {
        this.setStatus("VRM loaded but no viseme morph targets found.");
        return false;
      }

      this.lipsync = new LipsyncPlayer(this.morphMeshes);
      this.loaded = true;
      this.setStatus("Avatar ready");
      return true;
    } catch (e) {
      console.error(e);
      this.setStatus(`Failed to load avatar: ${e.message}`);
      return false;
    }
  }

  beginSpeech() {
    this.speaking = true;
    this.speechElapsedMs = 0;
    this.lipsync?.start();
  }

  updateSpeechText(text, durationMs) {
    if (!this.lipsync) return;
    this.lipsync.setText(text, durationMs);
  }

  setSpeechElapsedMs(ms) {
    this.speechElapsedMs = ms;
  }

  endSpeech() {
    this.speaking = false;
    this.lipsync?.stop();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width) || window.innerWidth);
    const ch = Math.max(1, Math.round(rect.height) || window.innerHeight);
    this.camera.aspect = cw / ch;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(cw, ch, false);
  }

  resize() {
    this._resize();
  }

  /** Call after the canvas becomes visible so WebGL gets real dimensions. */
  refreshAfterVisible() {
    requestAnimationFrame(() => {
      this._resize();
      requestAnimationFrame(() => this._resize());
    });
  }

  _renderFrame() {
    requestAnimationFrame(this._tick);

    const now = performance.now();
    const dtSec = Math.min(0.1, (now - this.lastFrameT) / 1000);
    this.lastFrameT = now;

    if (this.speaking && this.lipsync) {
      this.lipsync.update(this.speechElapsedMs);
    }

    if (this.vrm) {
      this.vrm.update(dtSec);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.lipsync?.stop();
  }
}
