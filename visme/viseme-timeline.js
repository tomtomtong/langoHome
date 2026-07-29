import { VISEME_TO_BLEND } from "./blendshapes.js";

function visemeToBlend(visemeSymbol) {
  if (!visemeSymbol) return 0;
  const key = String(visemeSymbol).toLowerCase();
  return VISEME_TO_BLEND[key] ?? 0;
}

function readPhones(detail) {
  return detail?.phones || detail?.Phones || [];
}

function readPhoneField(phone, camel, snake) {
  if (phone == null) return undefined;
  return phone[camel] ?? phone[snake];
}

/** Convert Inworld REST or realtime timestamp_info into a lipsync timeline (ms). */
export function inworldTimestampToTimeline(timestampInfo) {
  if (!timestampInfo) return [];

  const alignment =
    timestampInfo.word_alignment
    || timestampInfo.wordAlignment
    || timestampInfo.character_alignment
    || timestampInfo.characterAlignment;
  if (!alignment) return [];

  const phoneticDetails =
    alignment.phoneticDetails
    || alignment.phonetic_details
    || [];

  const entries = [];
  for (const detail of phoneticDetails) {
    for (const phone of readPhones(detail)) {
      const viseme = readPhoneField(phone, "visemeSymbol", "viseme_symbol");
      const phoneSymbol = readPhoneField(phone, "phoneSymbol", "phone_symbol");
      const startSec = Number(readPhoneField(phone, "startTimeSeconds", "start_time_seconds") ?? 0);
      const durSec = Number(readPhoneField(phone, "durationSeconds", "duration_seconds") ?? 0);
      const startMs = startSec * 1000;
      const endMs = (startSec + durSec) * 1000;
      const isSilence = phoneSymbol === "[silence]" || !viseme;

      entries.push({
        phoneme: isSilence ? "SIL" : viseme,
        start: startMs,
        end: Math.max(endMs, startMs + (isSilence ? 10 : 25)),
        blendId: isSilence ? 0 : visemeToBlend(viseme),
      });
    }
  }

  // Character-level alignment has no phonetic details — skip (no viseme data).
  if (!entries.length && (alignment.characters || alignment.characterStartTimeSeconds)) {
    return [];
  }

  return entries;
}

/** Merge streaming viseme chunks; timestamps are absolute from utterance start. */
export function mergeVisemeTimelines(existing, incoming) {
  if (!incoming?.length) return existing?.slice() || [];
  if (!existing?.length) return incoming.slice();

  const byStart = new Map();
  for (const entry of [...existing, ...incoming]) {
    byStart.set(`${entry.start.toFixed(3)}:${entry.phoneme}`, entry);
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}
