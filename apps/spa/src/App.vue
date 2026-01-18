<template>
  <main>
    <h1>Sunfinder</h1>

    <div v-if="error" class="error">{{ error }}</div>

    <template v-else>
      <p v-if="!config">Loading webcams…</p>
      <ul v-else class="webcam-grid">
        <li v-for="webcam in sortedWebcams" :key="webcam.id">
          <WebcamCard
            :webcam="webcam"
            :user-coord="config.settings.user_coord_ch2056"
            :worker-base-url="config.settings.worker_base_url"
            :refresh-minutes="config.settings.refresh_minutes"
            :paused="isPaused"
          />
        </li>
      </ul>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { RootConfig } from '@webcam-sunline/config/parse';
import { loadConfig } from './services/configLoader';
import WebcamCard from './components/WebcamCard.vue';

const config = ref<RootConfig | null>(null);
const error = ref<string | null>(null);
const isPaused = ref(false);

const sortedWebcams = computed(() => {
  if (!config.value) {
    return [];
  }
  return [...config.value.webcams].sort((a, b) => a.elevation_m_asl - b.elevation_m_asl);
});

function updateVisibility() {
  isPaused.value = document.hidden;
}

onMounted(async () => {
  updateVisibility();
  document.addEventListener('visibilitychange', updateVisibility);
  try {
    const data = await loadConfig();
    config.value = data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load configuration.';
  }
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', updateVisibility);
});
</script>
