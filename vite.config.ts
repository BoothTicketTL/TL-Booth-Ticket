import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function googleSheetsPlugin(): Plugin {
  return {
    name: 'google-sheets-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/sheets/tabs')) {
          try {
            const urlObj = new URL(req.url, 'http://localhost:3000');
            const sheetId = urlObj.searchParams.get('sheetId');
            if (!sheetId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing sheetId' }));
              return;
            }

            const urlsToTry = [
              `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
              `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
              `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml`,
            ];

            const tabs: { name: string; gid: string }[] = [];

            for (const targetUrl of urlsToTry) {
              try {
                const response = await fetch(targetUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  }
                });

                if (!response.ok) continue;
                const html = await response.text();

                // 1. topsnapshot / DOCS_modelChunk
                const topSnapshotRegex = /\[\s*[0-9]+\s*,\s*[0-9]+\s*,\\+?"([0-9]{1,15})\\+?",\s*\[\{\\+?"1\\+?":\s*\[\[\s*[0-9]+\s*,\s*[0-9]+\s*,\\+?"([^"\\]+)/g;
                let match;
                while ((match = topSnapshotRegex.exec(html)) !== null) {
                  const gid = match[1];
                  let cleanName = match[2].trim();
                  try { cleanName = JSON.parse(`"${cleanName}"`); } catch {}
                  if (cleanName && !tabs.some(t => t.gid === gid || t.name.toLowerCase() === cleanName.toLowerCase())) {
                    tabs.push({ gid, name: cleanName });
                  }
                }

                // 2. items.push
                const regex = /items\.push\(\{[^}]*name:\s*"((?:\\.|[^"\\])*)"[^}]*gid:\s*"([0-9]+)"/g;
                while ((match = regex.exec(html)) !== null) {
                  let name = match[1];
                  try { name = JSON.parse(`"${name}"`); } catch {}
                  if (!tabs.some(t => t.gid === match[2] || t.name.toLowerCase() === name.toLowerCase())) {
                    tabs.push({ name, gid: match[2] });
                  }
                }

                // 3. docs-sheet-tab-caption
                const captionRegex = /docs-sheet-tab-caption[^>]*>([^<]+)<\/div>/g;
                while ((match = captionRegex.exec(html)) !== null) {
                  const cleanName = match[1].replace(/<[^>]+>/g, '').trim();
                  if (cleanName && !tabs.some(t => t.name.toLowerCase() === cleanName.toLowerCase())) {
                    tabs.push({ gid: '', name: cleanName });
                  }
                }

                // 4. sheet buttons
                const sheetBtnRegex = /id="sheet-button-([0-9]+)"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/g;
                while ((match = sheetBtnRegex.exec(html)) !== null) {
                  const cleanName = match[2].replace(/<[^>]+>/g, '').trim();
                  if (cleanName && !tabs.some(t => t.gid === match[1] || t.name.toLowerCase() === cleanName.toLowerCase())) {
                    tabs.push({ gid: match[1], name: cleanName });
                  }
                }

                if (tabs.length >= 6) break;
              } catch {}
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, sheetId, tabs }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.url && req.url.startsWith('/api/sheets/fetch-csv')) {
          try {
            const urlObj = new URL(req.url, 'http://localhost:3000');
            const sheetId = urlObj.searchParams.get('sheetId');
            const gid = urlObj.searchParams.get('gid');
            const sheetName = urlObj.searchParams.get('sheetName');
            if (!sheetId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing sheetId' }));
              return;
            }

            const params = ['tqx=out:csv'];
            if (gid) {
              params.push(`gid=${gid}`);
            } else if (sheetName) {
              params.push(`sheet=${encodeURIComponent(sheetName)}`);
            }

            const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.join('&')}`;
            const response = await fetch(gvizUrl);
            const text = await response.text();

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(text);
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), googleSheetsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
