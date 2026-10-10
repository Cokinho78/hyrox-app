// Accès aux données du repo privé hyrox-data via l'API GitHub.
// Lecture : 1 appel "tree" + les blobs modifiés (cache local par sha).
// Écriture : PUT /contents (un commit par séance enregistrée).

const CFG_KEY = "hyrox:cfg";
const BLOB_PREFIX = "hyrox:blob:";
const TREE_KEY = "hyrox:tree";

export function loadConfig() {
  const params = new URLSearchParams(location.search);
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch { cfg = {}; }
  return {
    api: params.get("api") || cfg.api || "https://api.github.com",
    owner: cfg.owner || "cokinho78",
    repo: cfg.repo || "hyrox-data",
    branch: cfg.branch || "main",
    token: cfg.token || "",
  };
}

export function saveConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function clearCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(BLOB_PREFIX) || k === TREE_KEY)
    .forEach((k) => localStorage.removeItem(k));
}

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export class StoreError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class Store {
  constructor(cfg) {
    this.cfg = cfg;
    this.shas = new Map(); // path -> sha (état connu du repo)
  }

  get base() {
    const { api, owner, repo } = this.cfg;
    return `${api}/repos/${owner}/${repo}`;
  }

  async req(path, opts = {}) {
    const res = await fetch(this.base + path, {
      ...opts,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.cfg.token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      const hint = {
        401: "Token invalide ou expiré (Réglages).",
        403: "Accès refusé : vérifie les droits du token (Contents : Read and write).",
        404: "Repo introuvable : vérifie le nom du repo et les droits du token.",
        409: "Conflit : le fichier a changé entre-temps.",
        422: "Conflit : le fichier a changé entre-temps.",
      }[res.status];
      throw new StoreError(hint || `Erreur GitHub ${res.status}`, res.status);
    }
    return res.json();
  }

  // Hors réseau : on retombe sur le dernier état connu (blobs déjà en cache).
  async listFiles() {
    this.offline = false;
    let tree;
    try {
      const data = await this.req(`/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`);
      tree = data.tree.filter((n) => n.type === "blob").map((n) => [n.path, n.sha]);
      try { localStorage.setItem(TREE_KEY, JSON.stringify(tree)); } catch { /* ignore */ }
    } catch (e) {
      if (e instanceof StoreError) throw e;
      tree = JSON.parse(localStorage.getItem(TREE_KEY) || "null");
      if (!tree) throw e;
      this.offline = true;
    }
    this.shas = new Map(tree);
    return [...this.shas.keys()];
  }

  async readText(path) {
    const sha = this.shas.get(path);
    if (!sha) throw new StoreError(`Fichier absent : ${path}`, 404);
    const cached = localStorage.getItem(BLOB_PREFIX + sha);
    if (cached !== null) return cached;
    const blob = await this.req(`/git/blobs/${sha}`);
    const text = b64ToUtf8(blob.content);
    try { localStorage.setItem(BLOB_PREFIX + sha, text); } catch { /* quota plein : on ignore */ }
    return text;
  }

  async readJSON(path) {
    return JSON.parse(await this.readText(path));
  }

  // Lit plusieurs fichiers en parallèle (6 requêtes max à la fois).
  async readMany(paths) {
    const out = new Map();
    let i = 0;
    const worker = async () => {
      while (i < paths.length) {
        const p = paths[i++];
        try {
          out.set(p, await this.readJSON(p));
        } catch (e) {
          console.warn("Lecture impossible", p, e);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return out;
  }

  // onConflict(remoteObj) -> obj à écrire, appelé si le fichier a changé sur GitHub
  // entre la lecture et l'écriture (ex. le coach a ajouté une note).
  async writeJSON(path, obj, message, onConflict = (remote, mine) => mine) {
    let text = JSON.stringify(obj, null, 2) + "\n";
    const put = (sha) => this.req(`/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: utf8ToB64(text),
        branch: this.cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    let res;
    try {
      res = await put(this.shas.get(path));
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      // sha périmé : on relit l'état actuel du fichier et on réessaie une fois.
      const cur = await this.req(`/contents/${path}?ref=${encodeURIComponent(this.cfg.branch)}`)
        .catch(() => null);
      if (cur?.content) {
        const merged = onConflict(JSON.parse(b64ToUtf8(cur.content)), obj);
        text = JSON.stringify(merged, null, 2) + "\n";
      }
      res = await put(cur?.sha);
    }
    const sha = res.content.sha;
    this.shas.set(path, sha);
    try { localStorage.setItem(BLOB_PREFIX + sha, text); } catch { /* ignore */ }
    return sha;
  }
}
