import { parseWebcamsYaml, type RootConfig } from '@webcam-sunline/config/parse';

export async function loadConfig(): Promise<RootConfig> {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const response = await fetch(`${baseUrl}webcams.yml`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load webcams.yml (${response.status})`);
  }

  const content = await response.text();
  return parseWebcamsYaml(content);
}
