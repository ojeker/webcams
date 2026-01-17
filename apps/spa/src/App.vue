<template>
  <main>
    <h1>Webcam Sunline</h1>
    <p>Loaded from the repo root configuration.</p>

    <div v-if="error" class="error">{{ error }}</div>

    <template v-else>
      <p v-if="!config">Loading webcams…</p>
      <ul v-else class="webcam-grid">
        <li v-for="webcam in config.webcams" :key="webcam.id">
          <strong>{{ webcam.name }}</strong>
          <span class="badge">Elevation: {{ webcam.elevation_m_asl }} m</span>
        </li>
      </ul>
    </template>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { RootConfig } from '@webcam-sunline/config';
import { loadConfig } from './services/configLoader';
import { WorkerClient } from './services/workerClient';

const config = ref<RootConfig | null>(null);
const error = ref<string | null>(null);
const workerClient = ref<WorkerClient | null>(null);

onMounted(async () => {
  try {
    const data = await loadConfig();
    config.value = data;
    workerClient.value = new WorkerClient(data.settings.worker_base_url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load configuration.';
  }
});
</script>
