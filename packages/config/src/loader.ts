import { readFile } from 'node:fs/promises';
import { type RootConfig } from './schema';
import { ConfigError, parseWebcamsYaml } from './parse';

export { ConfigError, parseWebcamsYaml } from './parse';

export async function loadWebcamsYaml(path: string): Promise<RootConfig> {
  try {
    const content = await readFile(path, 'utf8');
    return parseWebcamsYaml(content);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(`Failed to load config at ${path}.`);
  }
}
