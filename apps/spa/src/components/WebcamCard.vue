<template>
  <article class="card">
    <div class="card__image">
      <img
        v-if="previewUrl"
        :src="previewUrl"
        :alt="`${webcam.name} preview`"
        class="card__image-preview"
        @error="handleImageError"
        @load="handleImageLoad"
      />
      <div v-else class="card__image-placeholder">Preview unavailable</div>
      <button
        v-if="previewUrl"
        type="button"
        class="card__image-action"
        aria-label="View fullscreen"
        @click="openFullscreen"
      ></button>
    </div>

    <div class="card__body">
      <strong>{{ webcam.name }}</strong>
      <div class="stats">
        <div class="stat">
          <span class="stat__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M3 19h18l-6.5-11-4.5 7-3-4z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span class="stat__value">{{ elevationRounded }} m</span>
        </div>
        <div class="stat">
          <span class="stat__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="stat__value">{{ distanceKmRounded }} km</span>
        </div>
        <div class="stat">
          <span
            class="stat__icon stat__icon--rotate"
            :style="arrowStyle"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M12 4l6 8h-4v8h-4v-8H6z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span class="stat__value">{{ compass }}</span>
        </div>
      </div>
      <span v-if="statusMessage" class="badge badge--warning">{{ statusMessage }}</span>
    </div>
  </article>

  <div
    v-if="isFullscreen"
    class="fullscreen"
    role="dialog"
    aria-modal="true"
    aria-label="Webcam fullscreen"
    @click="handleBackdropClick"
  >
    <div class="fullscreen__toolbar">
      <button type="button" class="fullscreen__close" @click="closeFullscreen">Close</button>
    </div>
    <div
      ref="fullscreenStage"
      class="fullscreen__stage"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <img
        :src="previewUrl"
        :alt="`${webcam.name} fullscreen`"
        class="fullscreen__image"
        :style="fullscreenTransform"
        draggable="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { RootConfig } from '@webcam-sunline/config/parse';
import { compass8FromBearing, planarBearingDeg, planarDistanceKm } from '@webcam-sunline/domain';
import {
  isWorkerBypass,
  nextRetryDelayMs,
  resolvePreviewBaseUrl,
  shouldRetry
} from '../services/previewResolver';

type Webcam = RootConfig['webcams'][number];
type Coord = RootConfig['settings']['user_coord_ch2056'];

const props = defineProps<{
  webcam: Webcam;
  userCoord: Coord;
  workerBaseUrl: string;
  refreshMinutes: number;
  paused: boolean;
}>();

const refreshToken = ref(Date.now());
const loadError = ref<string | null>(null);
const retryAttempt = ref(0);
const retryTimeoutId = ref<number | null>(null);
const isFullscreen = ref(false);
const fullscreenStage = ref<HTMLDivElement | null>(null);
const scale = ref(1);
const translate = ref({ x: 0, y: 0 });
const pointerMap = new Map<number, { x: number; y: number }>();
const gesture = ref<
  | {
      mode: 'pan';
      startPoint: { x: number; y: number };
      startTranslate: { x: number; y: number };
    }
  | {
      mode: 'pinch';
      startDistance: number;
      startMid: { x: number; y: number };
      startTranslate: { x: number; y: number };
      startScale: number;
    }
  | null
>(null);

const distanceKm = computed(() => planarDistanceKm(props.userCoord, props.webcam.coord_ch2056));
const distanceKmRounded = computed(() => Math.round(distanceKm.value));
const elevationRounded = computed(() => Math.round(props.webcam.elevation_m_asl / 10) * 10);
const bearingDeg = computed(() => planarBearingDeg(props.userCoord, props.webcam.coord_ch2056));
const compass = computed(() => compass8FromBearing(bearingDeg.value));
const arrowStyle = computed(() => ({
  transform: `rotate(${bearingDeg.value}deg)`
}));

const isBypass = computed(() => isWorkerBypass(props.webcam));

const previewBaseUrl = computed(() => {
  return resolvePreviewBaseUrl(props.webcam, props.workerBaseUrl);
});

const previewUrl = computed(() => {
  if (!previewBaseUrl.value) {
    return null;
  }
  const url = new URL(previewBaseUrl.value);
  url.searchParams.set('t', refreshToken.value.toString());
  return url.toString();
});

const fullscreenTransform = computed(() => ({
  transform: `translate3d(${translate.value.x}px, ${translate.value.y}px, 0) scale(${scale.value})`
}));

const statusMessage = computed(() => {
  if (loadError.value) {
    return loadError.value;
  }
  if (!previewBaseUrl.value) {
    return 'Preview unsupported';
  }
  return null;
});

function handleImageError() {
  loadError.value = isBypass.value
    ? 'Direct image failed (worker bypass enabled)'
    : 'Preview failed';
  scheduleRetry();
}

function handleImageLoad() {
  loadError.value = null;
  retryAttempt.value = 0;
  clearRetryTimer();
}

function openFullscreen() {
  if (!previewUrl.value) return;
  resetTransform();
  isFullscreen.value = true;
}

function closeFullscreen() {
  isFullscreen.value = false;
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    closeFullscreen();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function resetTransform() {
  scale.value = 1;
  translate.value = { x: 0, y: 0 };
}

function handlePointerDown(event: PointerEvent) {
  if (!fullscreenStage.value) return;
  if (typeof fullscreenStage.value.setPointerCapture === 'function') {
    fullscreenStage.value.setPointerCapture(event.pointerId);
  }
  pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointerMap.size === 1) {
    gesture.value = {
      mode: 'pan',
      startPoint: { x: event.clientX, y: event.clientY },
      startTranslate: { ...translate.value }
    };
  } else if (pointerMap.size === 2) {
    const [a, b] = Array.from(pointerMap.values());
    gesture.value = {
      mode: 'pinch',
      startDistance: distance(a, b),
      startMid: midpoint(a, b),
      startTranslate: { ...translate.value },
      startScale: scale.value
    };
  }
}

function handlePointerMove(event: PointerEvent) {
  if (!pointerMap.has(event.pointerId)) return;
  pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (!gesture.value) return;
  if (gesture.value.mode === 'pan' && pointerMap.size === 1) {
    const dx = event.clientX - gesture.value.startPoint.x;
    const dy = event.clientY - gesture.value.startPoint.y;
    translate.value = {
      x: gesture.value.startTranslate.x + dx,
      y: gesture.value.startTranslate.y + dy
    };
    return;
  }

  if (pointerMap.size >= 2 && gesture.value.mode === 'pinch') {
    const [a, b] = Array.from(pointerMap.values());
    const nextDistance = distance(a, b);
    const nextMid = midpoint(a, b);
    const nextScale = clamp(
      gesture.value.startScale * (nextDistance / gesture.value.startDistance),
      1,
      4
    );
    scale.value = nextScale;
    translate.value = {
      x: gesture.value.startTranslate.x + (nextMid.x - gesture.value.startMid.x),
      y: gesture.value.startTranslate.y + (nextMid.y - gesture.value.startMid.y)
    };
  }
}

function handlePointerUp(event: PointerEvent) {
  pointerMap.delete(event.pointerId);
  if (pointerMap.size === 1) {
    const [remaining] = Array.from(pointerMap.values());
    gesture.value = {
      mode: 'pan',
      startPoint: { ...remaining },
      startTranslate: { ...translate.value }
    };
    return;
  }

  if (pointerMap.size === 0) {
    gesture.value = null;
  }
}

let intervalId: number | null = null;

function clearRetryTimer() {
  if (retryTimeoutId.value !== null) {
    window.clearTimeout(retryTimeoutId.value);
    retryTimeoutId.value = null;
  }
}

function clearIntervalTimer() {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

function startRefresh(triggerImmediate = false) {
  clearIntervalTimer();
  if (props.paused || !Number.isFinite(props.refreshMinutes) || props.refreshMinutes <= 0) {
    return;
  }
  if (triggerImmediate) {
    refreshToken.value = Date.now();
  }
  const intervalMs = props.refreshMinutes * 60 * 1000;
  intervalId = window.setInterval(() => {
    refreshToken.value = Date.now();
  }, intervalMs);
}

function stopRefresh() {
  clearIntervalTimer();
  clearRetryTimer();
}

function scheduleRetry() {
  if (props.paused || !previewBaseUrl.value || !shouldRetry(retryAttempt.value)) {
    return;
  }

  const delayMs = nextRetryDelayMs(retryAttempt.value);
  retryAttempt.value += 1;
  clearRetryTimer();
  retryTimeoutId.value = window.setTimeout(() => {
    refreshToken.value = Date.now();
  }, delayMs);
}

onMounted(() => {
  startRefresh();
});

onUnmounted(() => {
  stopRefresh();
});

watch(
  () => props.paused,
  paused => {
    if (paused) {
      stopRefresh();
    } else {
      startRefresh(true);
      if (loadError.value) {
        refreshToken.value = Date.now();
      }
    }
  }
);

watch(
  () => props.refreshMinutes,
  () => {
    startRefresh();
  }
);

watch(
  () => isFullscreen.value,
  active => {
    if (active) {
      document.body.style.overflow = 'hidden';
      return;
    }
    document.body.style.overflow = '';
    pointerMap.clear();
    gesture.value = null;
  }
);

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeFullscreen();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>
