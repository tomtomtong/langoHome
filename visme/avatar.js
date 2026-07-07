import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { LipsyncPlayer, clearBlend } from "./lipsync.js";
import { loadMixamoIdleClip } from "./mixamo-idle.js";
import {
  BLENDSHAPE_COUNT,
  BLENDSHAPE_LABELS,
  buildBlendshapeTestTimeline,
  defaultBlendshapeWeights,
  hasFaceMorphTargets,
  normalizeBlendshapes,
} from "./blendshapes.js";

export {
  BLENDSHAPE_COUNT,
  BLENDSHAPE_LABELS,
  normalizeBlendshapes,
};

// Default framing — face/upper body centered higher in the viewport.
export const DEFAULT_AVATAR = {
  cameraX: 0,
  cameraY: 1.3,
  cameraZ: 1.6,
  targetX: 0,
  targetY: 1.42,
  targetZ: 0,
};

const DISTANCE_MIN = 0.8;
const DISTANCE_MAX = 3.5;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;

// Non-color data maps must stay in linear/no color space.
const NON_COLOR_TEXTURE_KEYS = new Set([
  "normalMap",
  "bumpMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "displacementMap",
  "lightMap",
  "uvAnimationMaskTexture",
]);

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

export const DEFAULT_LIPSYNC = {
  exaggerate: 1,
  msPerPhone: 120,
  crossfadeMs: 50,
  blendshapes: defaultBlendshapeWeights(),
};

export function normalizeLipsync(raw) {
  const l = raw && typeof raw === "object" ? raw : {};
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    exaggerate: num(l.exaggerate, 0.2, 1.8, DEFAULT_LIPSYNC.exaggerate),
    msPerPhone: num(l.msPerPhone, 50, 280, DEFAULT_LIPSYNC.msPerPhone),
    crossfadeMs: num(l.crossfadeMs, 0, 120, DEFAULT_LIPSYNC.crossfadeMs),
    blendshapes: normalizeBlendshapes(l.blendshapes),
  };
}

export class TommyAvatar {
  constructor(canvas, {
    vrmUrl = "/visme/Tommyv4.vrm",
    idleAnimationUrl = "/visme/Idle.fbx",
    backgroundUrl = "/bg.png",
    interactiveCamera = true,
    lipsync: lipsyncRaw,
    ...settings
  } = {}) {
    const av = normalizeAvatar(settings);
    this.lipsyncSettings = normalizeLipsync(lipsyncRaw);
    this.canvas = canvas;
    this.vrmUrl = vrmUrl;
    this.idleAnimationUrl = idleAnimationUrl;
    this.backgroundUrl = backgroundUrl;
    this.backgroundTexture = null;
    this.defaultBackground = new THREE.Color(0x0b1222);
    this.morphMeshes = [];
    this.lipsync = null;
    this.mixer = null;
    this.idleAction = null;
    this.danceAction = null;
    this._danceFinishedHandler = null;
    this._clipCache = new Map();
    this.loaded = false;
    this.speaking = false;
    this._previewPlaying = false;
    this._previewRaf = null;
    this._blendshapeTestStep = null;
    this._lastBlendshapeIndex = -1;
    this._manualBlendIndex = null;
    this._manualBlendValue = 0;
    this.speechElapsedMs = 0;
    this.onStatus = null;
    this.onCameraChange = null;

    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    canvas.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
    canvas.addEventListener("webglcontextrestored", () => this._syncGpuTextures(), false);

    this.scene = new THREE.Scene();
    this.scene.background = this.defaultBackground;

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    this.lookAtTarget = new THREE.Vector3(av.targetX, av.targetY, av.targetZ);
    this.interactiveCamera = interactiveCamera;
    this._pointers = new Map();
    this._pan = { active: false, lastX: 0, lastY: 0 };
    this._pinch = { active: false, lastDistance: 0 };
    this._scratch = {
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      offset: new THREE.Vector3(),
    };
    this.applyCameraSettings(av);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(1, 2, 2);
    this.scene.add(dir);

    this._bindFramingGestures();

    this.lastFrameT = performance.now();
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);
    this._tick = () => this._renderFrame();
    requestAnimationFrame(this._tick);
  }

  setStatus(msg) {
    if (this.onStatus) this.onStatus(msg);
  }

  setInteractiveCamera(enabled) {
    this.interactiveCamera = !!enabled;
    if (!this.interactiveCamera) {
      this._pointers.clear();
      this._pan.active = false;
      this._pinch.active = false;
      this._pinch.lastDistance = 0;
    }
  }

  _emitCameraChange() {
    if (this.onCameraChange) this.onCameraChange(this.getCameraSettings());
  }

  _syncCameraLookAt() {
    this.camera.lookAt(this.lookAtTarget);
  }

  _cameraDistance() {
    return this.camera.position.distanceTo(this.lookAtTarget);
  }

  _panSensitivity() {
    const h = Math.max(1, this.canvas.clientHeight || 1);
    const fovRad = (this.camera.fov * Math.PI) / 180;
    return (this._cameraDistance() * Math.tan(fovRad / 2) * 2) / h;
  }

  _panByScreenDelta(deltaX, deltaY) {
    const sens = this._panSensitivity();
    const { forward, right, up, offset } = this._scratch;

    this.camera.getWorldDirection(forward);
    right.crossVectors(forward, this.camera.up).normalize();
    up.copy(this.camera.up).normalize();

    offset.copy(right).multiplyScalar(-deltaX * sens);
    offset.addScaledVector(up, deltaY * sens);

    this.camera.position.add(offset);
    this.lookAtTarget.add(offset);
    this._syncCameraLookAt();
  }

  _zoomByFactor(factor) {
    const { offset } = this._scratch;
    offset.subVectors(this.camera.position, this.lookAtTarget);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      DISTANCE_MIN,
      DISTANCE_MAX,
    );
    offset.normalize().multiplyScalar(distance);
    this.camera.position.copy(this.lookAtTarget).add(offset);
    this._syncCameraLookAt();
  }

  _pinchDistance() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.hypot(dx, dy);
  }

  _bindFramingGestures() {
    const canvas = this.canvas;

    this._onPointerDown = (e) => {
      if (!this.interactiveCamera) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 1) {
        this._pan.active = true;
        this._pan.lastX = e.clientX;
        this._pan.lastY = e.clientY;
      } else if (this._pointers.size === 2) {
        this._pan.active = false;
        this._pinch.active = true;
        this._pinch.lastDistance = this._pinchDistance();
      }

      canvas.setPointerCapture(e.pointerId);
    };

    this._onPointerMove = (e) => {
      if (!this.interactiveCamera || !this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size >= 2 && this._pinch.active) {
        const dist = this._pinchDistance();
        if (this._pinch.lastDistance > 0 && dist > 0) {
          this._zoomByFactor(this._pinch.lastDistance / dist);
        }
        this._pinch.lastDistance = dist;
        this._emitCameraChange();
        return;
      }

      if (this._pointers.size === 1 && this._pan.active) {
        const deltaX = e.clientX - this._pan.lastX;
        const deltaY = e.clientY - this._pan.lastY;
        this._pan.lastX = e.clientX;
        this._pan.lastY = e.clientY;
        if (deltaX !== 0 || deltaY !== 0) {
          this._panByScreenDelta(deltaX, deltaY);
          this._emitCameraChange();
        }
      }
    };

    this._onPointerUp = (e) => {
      this._pointers.delete(e.pointerId);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}

      if (this._pointers.size < 2) {
        this._pinch.active = false;
        this._pinch.lastDistance = 0;
      }

      if (this._pointers.size === 1) {
        const pt = [...this._pointers.values()][0];
        this._pan.active = true;
        this._pan.lastX = pt.x;
        this._pan.lastY = pt.y;
      } else {
        this._pan.active = false;
      }
    };

    this._onWheel = (e) => {
      if (!this.interactiveCamera) return;
      e.preventDefault();
      this._zoomByFactor(1 + e.deltaY * ZOOM_WHEEL_SENSITIVITY);
      this._emitCameraChange();
    };

    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointercancel", this._onPointerUp);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
  }

  async _loadBackgroundTexture() {
    if (!this.backgroundUrl) return;
    try {
      const loader = new THREE.TextureLoader();
      const texture = await loader.loadAsync(this.backgroundUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.backgroundTexture = texture;
      this.scene.background = texture;
    } catch (e) {
      console.warn("Failed to load background:", e);
    }
  }

  async _loadIdleAnimation(vrm) {
    if (!this.idleAnimationUrl) return;

    try {
      const url = this.idleAnimationUrl;
      const isFbx = url.toLowerCase().endsWith(".fbx");
      let clip = null;

      if (isFbx) {
        clip = await loadMixamoIdleClip(url, vrm);
      } else {
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
        const vrmaGltf = await loader.loadAsync(url);
        const vrmAnimation = vrmaGltf.userData.vrmAnimations?.[0];
        if (!vrmAnimation) {
          console.warn("No VRMA animation data found in", url);
          return;
        }
        clip = createVRMAnimationClip(vrmAnimation, vrm);
      }

      if (!clip) {
        console.warn("Failed to create idle animation clip from", url);
        return;
      }

      this.mixer = new THREE.AnimationMixer(vrm.scene);
      this.idleAction = this.mixer.clipAction(clip);
      this.idleAction.setLoop(THREE.LoopRepeat);
      this.idleAction.play();
    } catch (e) {
      console.warn("Failed to load idle animation:", e);
    }
  }

  async load() {
    this.setStatus("Loading Tommyv4.vrm…");

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    try {
      const [, gltf] = await Promise.all([
        this._loadBackgroundTexture(),
        loader.loadAsync(this.vrmUrl),
      ]);
      const vrm = gltf.userData.vrm;
      if (!vrm) {
        this.setStatus("No VRM data found in file.");
        return false;
      }

      VRMUtils.rotateVRM0(vrm);
      this.scene.add(vrm.scene);
      this.vrm = vrm;
      this._syncGpuTextures();

      vrm.scene.traverse((o) => {
        if ((!o.isSkinnedMesh && !o.isMesh) || !o.morphTargetDictionary) return;
        if (hasFaceMorphTargets(o.morphTargetDictionary)) {
          this.morphMeshes.push(o);
        }
      });

      if (this.morphMeshes.length === 0) {
        this.setStatus("VRM loaded but no viseme morph targets found.");
        return false;
      }

      this.lipsync = new LipsyncPlayer(this.morphMeshes, this.lipsyncSettings);
      await this._loadIdleAnimation(vrm);
      this.loaded = true;
      this.setStatus("Avatar ready");
      return true;
    } catch (e) {
      console.error(e);
      this.setStatus(`Failed to load avatar: ${e.message}`);
      return false;
    }
  }

  applyLipsyncSettings(settings) {
    this.lipsyncSettings = normalizeLipsync(settings);
    if (!this.lipsync) return;
    this.lipsync.exaggerate = this.lipsyncSettings.exaggerate;
    this.lipsync.msPerPhone = this.lipsyncSettings.msPerPhone;
    this.lipsync.crossfadeMs = this.lipsyncSettings.crossfadeMs;
    this.lipsync.blendshapeWeights = this.lipsyncSettings.blendshapes.slice();
  }

  getLipsyncSettings() {
    return {
      ...this.lipsyncSettings,
      blendshapes: this.lipsyncSettings.blendshapes.slice(),
    };
  }

  previewBlendshape(index, value) {
    if (!this.morphMeshes.length) return;
    this._manualBlendIndex = index;
    this._manualBlendValue = Math.min(2, Math.max(0, Number(value) || 0));
    this._applyManualBlendshape();
  }

  clearManualBlendshapePreview() {
    this._manualBlendIndex = null;
    this._manualBlendValue = 0;
    if (!this.speaking && !this._previewPlaying) {
      clearBlend(this.morphMeshes);
    }
  }

  _applyManualBlendshape() {
    if (this._manualBlendIndex == null || !this.morphMeshes.length) return;
    clearBlend(this.morphMeshes);
    const idx = this._manualBlendIndex;
    const val = this._manualBlendValue;
    for (const mesh of this.morphMeshes) {
      const mi = mesh.morphTargetDictionary[String(idx)];
      if (mi !== undefined) mesh.morphTargetInfluences[mi] = val;
    }
  }

  _stopLipsyncPreview() {
    this._previewPlaying = false;
    this._blendshapeTestStep = null;
    this._lastBlendshapeIndex = -1;
    if (this._previewRaf) {
      cancelAnimationFrame(this._previewRaf);
      this._previewRaf = null;
    }
    this.lipsync?.stop();
    this.speechElapsedMs = 0;
  }

  _emitBlendshapeStep(index) {
    if (index === this._lastBlendshapeIndex) return;
    this._lastBlendshapeIndex = index;
    this._blendshapeTestStep?.({
      index,
      total: BLENDSHAPE_COUNT,
      label: BLENDSHAPE_LABELS[index] ?? String(index),
    });
  }

  _startPreviewTimeline(timeline, { onStep, onDone } = {}) {
    if (!this.lipsync || this._previewPlaying) return false;
    const duration = timeline[timeline.length - 1]?.end ?? 0;
    if (!duration) return false;

    this.clearManualBlendshapePreview();
    this._stopLipsyncPreview();
    this._blendshapeTestStep = onStep ?? null;
    this._lastBlendshapeIndex = -1;
    this.lipsync.timeline = timeline;
    this._previewPlaying = true;
    this.lipsync.start();
    if (onStep) this._emitBlendshapeStep(0);

    const t0 = performance.now();
    const tick = () => {
      if (!this._previewPlaying) return;
      this.speechElapsedMs = performance.now() - t0;
      if (onStep) {
        const holdMs = timeline[1]?.start ?? timeline[0]?.end ?? 1;
        const index = Math.min(BLENDSHAPE_COUNT - 1, Math.floor(this.speechElapsedMs / holdMs));
        this._emitBlendshapeStep(index);
      }
      if (this.speechElapsedMs >= duration) {
        this._stopLipsyncPreview();
        onDone?.();
        return;
      }
      this._previewRaf = requestAnimationFrame(tick);
    };
    this._previewRaf = requestAnimationFrame(tick);
    return true;
  }

  playBlendshapeTest({ holdMs = 700, onStep, onDone } = {}) {
    if (!this.lipsync) return false;
    return this._startPreviewTimeline(buildBlendshapeTestTimeline(holdMs), { onStep, onDone });
  }

  playLipsyncPreview(text = "Hello from Visme") {
    if (!this.lipsync) return;
    this.lipsync.setText(text, 0);
    this._startPreviewTimeline(this.lipsync.timeline);
  }

  beginSpeech() {
    this.clearManualBlendshapePreview();
    this._stopLipsyncPreview();
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

  async _getMixamoClip(url) {
    if (this._clipCache.has(url)) return this._clipCache.get(url);
    const clip = await loadMixamoIdleClip(url, this.vrm);
    if (clip) this._clipCache.set(url, clip);
    return clip;
  }

  _stopDanceAnimation() {
    if (this._danceFinishedHandler) {
      this.mixer.removeEventListener("finished", this._danceFinishedHandler);
      this._danceFinishedHandler = null;
    }
    if (this.danceAction) {
      this.danceAction.stop();
      this.danceAction = null;
    }
  }

  _resumeIdleAfterDance() {
    this._stopDanceAnimation();
    if (this.idleAction) {
      this.idleAction.reset().fadeIn(0.3).play();
    }
  }

  async playMixamoAnimation(url) {
    if (!this.vrm || !this.mixer) return false;

    try {
      const clip = await this._getMixamoClip(url);
      if (!clip) return false;

      this._stopDanceAnimation();

      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;

      if (this.idleAction) this.idleAction.fadeOut(0.3);

      action.reset().fadeIn(0.3).play();
      this.danceAction = action;

      this._danceFinishedHandler = (e) => {
        if (e.action !== action) return;
        this._resumeIdleAfterDance();
      };
      this.mixer.addEventListener("finished", this._danceFinishedHandler);
      return true;
    } catch (e) {
      console.warn("Failed to play animation:", e);
      return false;
    }
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

  /** Frame head and shoulders in view — for the settings-page lipsync preview. */
  frameForLipsyncPreview() {
    if (!this.vrm) return;
    this._resize();

    const box = new THREE.Box3().setFromObject(this.vrm.scene);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    let faceY = box.max.y - size.y * 0.1;
    const head = this.vrm.humanoid?.getNormalizedBoneNode?.("head");
    if (head) {
      const headWorld = new THREE.Vector3();
      head.getWorldPosition(headWorld);
      faceY = headWorld.y - size.y * 0.05;
    }

    const target = new THREE.Vector3(center.x, faceY, center.z);
    this.lookAtTarget.copy(target);

    const frameHeight = size.y * 0.45;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const distance = THREE.MathUtils.clamp(
      (frameHeight * 0.52) / Math.tan(fovRad / 2),
      DISTANCE_MIN,
      DISTANCE_MAX,
    );

    this.camera.position.set(target.x, target.y + size.y * 0.03, target.z + distance);
    this._syncCameraLookAt();
  }

  _syncGpuTextures() {
    if (!this.vrm) return;

    this.vrm.scene.traverse((obj) => {
      if (!obj.isMesh) return;

      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (!material) continue;

        for (const key of Object.keys(material)) {
          const value = material[key];
          if (!value?.isTexture || !value.image) continue;

          if (!NON_COLOR_TEXTURE_KEYS.has(key)) {
            value.colorSpace = THREE.SRGBColorSpace;
          }
          this.renderer.initTexture(value);
        }

        material.needsUpdate = true;
      }
    });
  }

  /** Call after the canvas becomes visible so WebGL gets real dimensions. */
  refreshAfterVisible() {
    const sync = () => {
      this._resize();
      this._syncGpuTextures();
      if (this.vrm) {
        this.vrm.update(0);
        this.renderer.render(this.scene, this.camera);
      }
    };

    requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
  }

  _renderFrame() {
    requestAnimationFrame(this._tick);

    const now = performance.now();
    const dtSec = Math.min(0.1, (now - this.lastFrameT) / 1000);
    this.lastFrameT = now;

    if ((this.speaking || this._previewPlaying) && this.lipsync) {
      this.lipsync.update(this.speechElapsedMs);
    }

    if (this.mixer) {
      this.mixer.update(dtSec);
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
    this._stopLipsyncPreview();
    this.lipsync?.stop();
    this._stopDanceAnimation?.();
    this.idleAction?.stop();
    this.mixer?.stopAllAction();
  }
}
