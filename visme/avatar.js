import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { LipsyncPlayer } from "./lipsync.js";

// Default framing — face/upper body centered higher in the viewport.
export const DEFAULT_AVATAR = {
  cameraX: 0,
  cameraY: 1.3,
  cameraZ: 1.6,
  targetX: 0,
  targetY: 1.42,
  targetZ: 0,
};

const CAMERA_Y_MIN = 0.4;
const CAMERA_Y_MAX = 2.8;
const CAMERA_Z_MIN = 0.8;
const CAMERA_Z_MAX = 3.5;
const HEIGHT_DRAG_SENSITIVITY = 0.004;
const ZOOM_WHEEL_SENSITIVITY = 0.002;

export function normalizeAvatar(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    cameraX: num(a.cameraX, DEFAULT_AVATAR.cameraX),
    cameraY: num(a.cameraY, DEFAULT_AVATAR.cameraY),
    cameraZ: num(a.cameraZ, DEFAULT_AVATAR.cameraZ),
    targetX: num(a.targetX, DEFAULT_AVATAR.targetX),
    targetY: num(a.targetY, DEFAULT_AVATAR.targetY),
    targetZ: num(a.targetZ, DEFAULT_AVATAR.targetZ),
  };
}

export class TommyAvatar {
  constructor(canvas, {
    vrmUrl = "/visme/Tommyv4.vrm",
    interactiveCamera = true,
    ...settings
  } = {}) {
    const av = normalizeAvatar(settings);
    this.canvas = canvas;
    this.vrmUrl = vrmUrl;
    this.morphMeshes = [];
    this.lipsync = null;
    this.loaded = false;
    this.speaking = false;
    this.speechElapsedMs = 0;
    this.onStatus = null;
    this.onCameraChange = null;

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1222);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    this.lookAtTarget = new THREE.Vector3(av.targetX, av.targetY, av.targetZ);
    this.interactiveCamera = interactiveCamera;
    this._heightDrag = { active: false, lastY: 0 };
    this.applyCameraSettings(av);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(1, 2, 2);
    this.scene.add(dir);

    if (interactiveCamera) this._bindHeightDrag();

    this.lastFrameT = performance.now();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._tick = () => this._renderFrame();
    requestAnimationFrame(this._tick);
  }

  setStatus(msg) {
    if (this.onStatus) this.onStatus(msg);
  }

  _emitCameraChange() {
    if (this.onCameraChange) this.onCameraChange(this.getCameraSettings());
  }

  _syncCameraLookAt() {
    this.camera.lookAt(this.lookAtTarget);
  }

  _bindHeightDrag() {
    const canvas = this.canvas;

    this._onPointerDown = (e) => {
      if (!this.interactiveCamera) return;
      this._heightDrag.active = true;
      this._heightDrag.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    this._onPointerMove = (e) => {
      if (!this._heightDrag.active) return;
      const deltaY = e.clientY - this._heightDrag.lastY;
      this._heightDrag.lastY = e.clientY;
      this.camera.position.y = THREE.MathUtils.clamp(
        this.camera.position.y - deltaY * HEIGHT_DRAG_SENSITIVITY,
        CAMERA_Y_MIN,
        CAMERA_Y_MAX,
      );
      this._syncCameraLookAt();
      this._emitCameraChange();
    };

    this._onPointerUp = (e) => {
      if (!this._heightDrag.active) return;
      this._heightDrag.active = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };

    this._onWheel = (e) => {
      if (!this.interactiveCamera) return;
      e.preventDefault();
      this.camera.position.z = THREE.MathUtils.clamp(
        this.camera.position.z + e.deltaY * ZOOM_WHEEL_SENSITIVITY,
        CAMERA_Z_MIN,
        CAMERA_Z_MAX,
      );
      this._syncCameraLookAt();
      this._emitCameraChange();
    };

    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointercancel", this._onPointerUp);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
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

  getCameraSettings() {
    return {
      cameraX: this.camera.position.x,
      cameraY: this.camera.position.y,
      cameraZ: this.camera.position.z,
      targetX: this.lookAtTarget.x,
      targetY: this.lookAtTarget.y,
      targetZ: this.lookAtTarget.z,
    };
  }

  applyCameraSettings(raw) {
    const av = normalizeAvatar(raw);
    this.camera.position.set(av.cameraX, av.cameraY, av.cameraZ);
    this.lookAtTarget.set(av.targetX, av.targetY, av.targetZ);
    this._syncCameraLookAt();
    this._emitCameraChange();
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

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    if (this._onPointerDown) {
      this.canvas.removeEventListener("pointerdown", this._onPointerDown);
      this.canvas.removeEventListener("pointermove", this._onPointerMove);
      this.canvas.removeEventListener("pointerup", this._onPointerUp);
      this.canvas.removeEventListener("pointercancel", this._onPointerUp);
      this.canvas.removeEventListener("wheel", this._onWheel);
    }
    this.lipsync?.stop();
  }
}
