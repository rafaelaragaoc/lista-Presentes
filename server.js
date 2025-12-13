const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const ITENS_PATH = path.join(__dirname, 'itens.json');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function readItens() {
  const raw = await fs.readFile(ITENS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeItens(itens) {
  await fs.writeFile(ITENS_PATH, JSON.stringify(itens, null, 2), 'utf8');
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
