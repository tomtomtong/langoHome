import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { LipsyncPlayer } from "./lipsync.js";
import { loadMixamoIdleClip } from "./mixamo-idle.js";

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

export class TommyAvatar {
  constructor(canvas, {
    vrmUrl = "/visme/Tommyv4.vrm",
    idleAnimationUrl = "/visme/Idle.fbx",
    backgroundUrl = "/bg.png",
    interactiveCamera = true,
    ...settings
  } = {}) {
    const av = normalizeAvatar(settings);
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
    } catch (e) {
      console.warn("Failed to load speech background:", e);
    }
  }

  _applySpeechBackground(active) {
    if (active && this.backgroundTexture) {
      this.scene.background = this.backgroundTexture;
    } else {
      this.scene.background = this.defaultBackground;
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
        if (o.morphTargetDictionary["0"] !== undefined && o.morphTargetDictionary["21"] !== undefined) {
          this.morphMeshes.push(o);
        }
      });

      if (this.morphMeshes.length === 0) {
        this.setStatus("VRM loaded but no viseme morph targets found.");
        return false;
      }

      this.lipsync = new LipsyncPlayer(this.morphMeshes);
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

  beginSpeech() {
    this.speaking = true;
    this.speechElapsedMs = 0;
    this._applySpeechBackground(true);
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
    this._applySpeechBackground(false);
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

    if (this.speaking && this.lipsync) {
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
    this.lipsync?.stop();
    this._stopDanceAnimation?.();
    this.idleAction?.stop();
    this.mixer?.stopAllAction();
  }
}
