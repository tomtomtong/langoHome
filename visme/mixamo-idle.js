import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { retargetAnimation } from "vrm-mixamo-retarget";

/** Mixamo FBX exports use either mixamorig:Hips or mixamorigHips naming. */
export function normalizeMixamoAsset(fbx) {
  fbx.traverse((obj) => {
    if (obj.name.startsWith("mixamorig:")) {
      obj.name = obj.name.replace("mixamorig:", "mixamorig");
    }
  });

  for (const clip of fbx.animations) {
    clip.tracks = clip.tracks.map((track) => {
      const newName = track.name.replace(/^mixamorig:/, "mixamorig");
      if (newName === track.name) return track;

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        return new THREE.QuaternionKeyframeTrack(newName, track.times.slice(), track.values.slice());
      }
      if (track instanceof THREE.VectorKeyframeTrack) {
        return new THREE.VectorKeyframeTrack(newName, track.times.slice(), track.values.slice());
      }
      return track;
    });
  }
}

export async function loadMixamoIdleClip(url, vrm) {
  const fbx = await new FBXLoader().loadAsync(url);
  normalizeMixamoAsset(fbx);
  return retargetAnimation(fbx, vrm, { logWarnings: true });
}
