import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

type WebcamsPluginOptions = {
  workspaceRoot: string;
  filename: string;
};

const workspaceRoot = path.resolve(__dirname, '../..');
const webcamsPath = path.join(workspaceRoot, 'webcams.yml');

function webcamsYamlPlugin(options: WebcamsPluginOptions) {
  return {
    name: 'webcams-yaml-plugin',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(async (req: { url?: string }, res: any, next: Function) => {
        const pathname = req.url?.split('?')[0];
        if (pathname !== `/${options.filename}`) {
          return next();
        }

        try {
          const content = await readFile(path.join(options.workspaceRoot, options.filename), 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/yaml');
          res.end(content);
        } catch (error) {
          res.statusCode = 404;
          res.end('webcams.yml not found');
        }
      });
    },
    async generateBundle() {
      const content = await readFile(path.join(options.workspaceRoot, options.filename), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: options.filename,
        source: content
      });
    }
  };
}

const workerDevUrl = process.env.WORKER_DEV_URL || 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [vue(), webcamsYamlPlugin({ workspaceRoot, filename: 'webcams.yml' })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    fs: {
      allow: [workspaceRoot]
    },
    proxy: {
      '/api': {
        target: workerDevUrl,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
