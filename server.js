const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const { Octokit } = require('@octokit/rest');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const ITENS_PATH = path.join(__dirname, 'itens.json');

// Optional GitHub integration: if these env vars are set, the server will
// update itens.json in the GitHub repo instead of only writing locally.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

const hasGitHub = Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
const octokit = hasGitHub ? new Octokit({ auth: GITHUB_TOKEN }) : null;
// Optional Cloudflare Worker that will perform the commit/update on GitHub.
// If provided, server will POST the file content to the worker which should
// handle authentication and commit to the repository.
const CF_WORKER_URL = process.env.CF_WORKER_URL || '';
const CF_WORKER_SECRET = process.env.CF_WORKER_SECRET || '';
const hasWorker = Boolean(CF_WORKER_URL);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function readItens() {
  if (hasGitHub) {
    // Read from GitHub repo
    try {
      const pathName = 'itens.json';
      const resp = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: pathName,
        ref: GITHUB_BRANCH,
      });
      const content = Buffer.from(resp.data.content, 'base64').toString('utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('GitHub read error', err);
      // Fall back to local file if available
      const raw = await fs.readFile(ITENS_PATH, 'utf8');
      return JSON.parse(raw);
    }
  }

  const raw = await fs.readFile(ITENS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeItens(itens) {
  const content = JSON.stringify(itens, null, 2);
  // 1) If a Cloudflare Worker URL is configured, try to ask it to update the file.
  if (hasWorker) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (CF_WORKER_SECRET) headers['X-Worker-Secret'] = CF_WORKER_SECRET;
      const resp = await fetch(CF_WORKER_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: 'itens.json', content }),
      });
      if (resp.ok) return;
      console.error('Worker returned non-ok status', resp.status);
      // fall through to GitHub/local fallback
    } catch (err) {
      console.error('Cloudflare worker error', err);
      // fall through to next fallback
    }
  }

  // 2) If configured, try to update via GitHub API
  if (hasGitHub) {
    // Update file in GitHub repository via API
    try {
      const pathName = 'itens.json';
      // Try to get the current file to obtain SHA (if exists)
      let sha;
      try {
        const getResp = await octokit.repos.getContent({
          owner: GITHUB_OWNER,
          repo: GITHUB_REPO,
          path: pathName,
          ref: GITHUB_BRANCH,
        });
        sha = getResp.data.sha;
      } catch (e) {
        if (e.status === 404) {
          sha = undefined;
        } else {
          throw e;
        }
      }

      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: pathName,
        message: `Atualiza itens.json - marca reserva`,
        content: Buffer.from(content).toString('base64'),
        branch: GITHUB_BRANCH,
        sha,
      });
      return;
    } catch (err) {
      console.error('GitHub write error', err);
      // Fall through to write local file as fallback
    }
  }

  await fs.writeFile(ITENS_PATH, content, 'utf8');
}

// Retorna apenas itens não reservados (reservado === false)
app.get('/api/itens', async (req, res) => {
  try {
    const itens = await readItens();
    const disponiveis = itens.filter(i => !i.reservado);
    res.json(disponiveis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'read_error' });
  }
});

// Endpoint para reservar um item: encaminha para WEBHOOK_URL (se configurado)
// e, em caso de sucesso, marca o item como reservado no itens.json
app.post('/api/reservar', async (req, res) => {
  const { id, nomeConvidado, emailConvidado, telefoneConvidado } = req.body;
  if (!id || !nomeConvidado || !emailConvidado) {
    return res.status(400).json({ success: false, error: 'missing_fields' });
  }

  try {
    // Forward to webhook if configured
    let webhookOk = true;
    if (WEBHOOK_URL) {
      const payload = { ...req.body };
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Try parse JSON response if possible
      try {
        const json = await resp.json();
        webhookOk = !!json.success;
      } catch (e) {
        // If webhook doesn't return JSON, consider 2xx as success
        webhookOk = resp.ok;
      }
    }

    if (!webhookOk) {
      return res.status(502).json({ success: false, error: 'webhook_failed' });
    }

    // Mark item as reserved in file
    const itens = await readItens();
    const idx = itens.findIndex(i => i.id === id || i.id === Number(id));
    if (idx === -1) return res.status(404).json({ success: false, error: 'item_not_found' });
    if (itens[idx].reservado) return res.status(400).json({ success: false, error: 'already_reserved' });

    itens[idx].reservado = true;
    await writeItens(itens);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

// Marca um item como reservado localmente (sem encaminhar ao webhook).
// Espera { id }
app.post('/api/marcar', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'missing_id' });

  try {
    const itens = await readItens();
    const idx = itens.findIndex(i => i.id === id || i.id === Number(id));
    if (idx === -1) return res.status(404).json({ success: false, error: 'item_not_found' });
    if (itens[idx].reservado) return res.status(400).json({ success: false, error: 'already_reserved' });

    itens[idx].reservado = true;
    await writeItens(itens);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (WEBHOOK_URL) console.log(`Forwarding reservations to: ${WEBHOOK_URL}`);
});
