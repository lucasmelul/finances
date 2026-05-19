/**
 * Sync de la DB del portfolio con un GitHub Gist privado.
 *
 * Flujo:
 *  - El usuario genera un Personal Access Token de GitHub con scope `gist`.
 *  - El token se guarda en localStorage (nunca en la DB ni en el servidor).
 *  - "Push": serializa la DB a JSON y crea/actualiza el Gist.
 *  - "Pull": descarga el Gist e importa con modo 'replace'.
 *
 * El Gist se identifica por su descripción (`GIST_DESCRIPTION`), así ambos
 * dispositivos lo encuentran automáticamente con solo compartir el PAT.
 *
 * Límite de Gist: 1 MB por archivo. Portfolios típicos: < 200 KB.
 */

const GIST_FILENAME    = 'portfolio-tracker.json';
const GIST_DESCRIPTION = 'Portfolio Tracker — sync';
const PAT_KEY          = 'pt_github_pat';
const LAST_SYNC_KEY    = 'pt_last_sync';
const API_BASE         = 'https://api.github.com';

// ─── PAT helpers ──────────────────────────────────────────────────────────

export function getStoredPat(): string | null {
  return localStorage.getItem(PAT_KEY);
}

export function savePat(token: string): void {
  localStorage.setItem(PAT_KEY, token.trim());
}

export function clearPat(): void {
  localStorage.removeItem(PAT_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

export function getLastSync(): Date | null {
  const s = localStorage.getItem(LAST_SYNC_KEY);
  return s ? new Date(s) : null;
}

function setLastSync(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

// ─── GitHub Gist API ──────────────────────────────────────────────────────

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** Encuentra el Gist del portfolio buscando por descripción. */
async function findGistId(token: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/gists?per_page=100`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub API ${res.status}: ${msg.slice(0, 120)}`);
  }
  const list = await res.json() as Array<{ id: string; description: string }>;
  const found = list.find((g) => g.description === GIST_DESCRIPTION);
  return found?.id ?? null;
}

/**
 * Sube el portfolio a GitHub Gist. Si no existe, lo crea (privado).
 * Si ya existe, lo actualiza (PATCH).
 */
export async function pushToGist(
  token: string,
  data: object,
): Promise<{ gistUrl: string }> {
  const content = JSON.stringify(data, null, 2);
  const payload = {
    description: GIST_DESCRIPTION,
    public: false,
    files: { [GIST_FILENAME]: { content } },
  };

  const gistId = await findGistId(token);

  let res: Response;
  if (gistId) {
    res = await fetch(`${API_BASE}/gists/${gistId}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify(payload),
    });
  } else {
    res = await fetch(`${API_BASE}/gists`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Error al guardar en Gist (${res.status}): ${msg.slice(0, 120)}`);
  }

  const json = await res.json() as { html_url: string };
  setLastSync();
  return { gistUrl: json.html_url };
}

/**
 * Descarga el portfolio desde el Gist y devuelve el JSON parseado.
 * El caller es responsable de hacer el import.
 */
export async function pullFromGist(token: string): Promise<unknown> {
  const gistId = await findGistId(token);
  if (!gistId) {
    throw new Error(
      'No se encontró un Gist del portfolio con este token. Hacé Push desde el otro dispositivo primero.',
    );
  }

  const res = await fetch(`${API_BASE}/gists/${gistId}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Error al leer el Gist (${res.status}): ${msg.slice(0, 120)}`);
  }

  const gist = await res.json() as {
    files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
  };

  const file = gist.files[GIST_FILENAME];
  if (!file) {
    throw new Error(`El Gist no contiene el archivo "${GIST_FILENAME}".`);
  }

  // Si el contenido está truncado (> 1 MB), leer desde raw_url.
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: headers(token) });
    content = await raw.text();
  }

  if (!content) throw new Error('El Gist está vacío.');

  setLastSync();
  return JSON.parse(content);
}

/**
 * Valida el PAT haciendo una llamada a /user. Devuelve el username si ok.
 */
export async function validatePat(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error('Token inválido o sin permisos de gist.');
  const user = await res.json() as { login: string };
  return user.login;
}
