/* ============================================================================
   acces.js — Connexion, droits d'accès, navigation Sociétés × Années, utilisateurs.
   Chargé après app.js. Les vraies règles de sécurité sont appliquées par le serveur ;
   ici on masque simplement ce que l'utilisateur n'a pas le droit de faire.
   ========================================================================== */

let SESSION = { token: sessionStorage.getItem("sagi_token") || null, utilisateur: null };
let NAV_DATA = null;                 // { annees, clients }
let NAV_SEL = null;                  // { clientId, annee }
let USERS = [];                      // liste des utilisateurs (admin)
let DROITS_CIBLE = null;             // { user, etat: {"cid:annee": niveau} }

let _loginResolve = null;
let _mdpResolve = null;
let _horsServeurResolve = null;

const NIVEAU_LABEL = { AUCUN: "Aucun", LECTURE: "Lecture", ECRITURE: "Écriture", GESTION: "Gestion" };
const NIVEAU_ICONE = { LECTURE: "fa-eye", ECRITURE: "fa-pen", GESTION: "fa-key" };

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function nombreFr(n) {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ");
}

/* ----------------------------------------------------------------- appels API */
async function apiFetch(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (SESSION.token) opts.headers["Authorization"] = "Bearer " + SESSION.token;
  const res = await fetch(url, opts);
  if (res.status === 401 && !url.includes("/api/login")) {
    SESSION.token = null;
    sessionStorage.removeItem("sagi_token");
    afficherLogin("Votre session a expiré, veuillez vous reconnecter.");
    throw new Error("Session expirée");
  }
  if (res.status === 403) {
    const copie = res.clone();
    try {
      const j = await copie.json();
      if (j.code === "MDP_A_CHANGER") ouvrirChangementMdp(true);
    } catch (e) { /* ignore */ }
  }
  return res;
}

async function verifierReponse(res) {
  if (res.ok) return res;
  let msg = "Erreur serveur (" + res.status + ")";
  try { const j = await res.clone().json(); if (j.message) msg = j.message; } catch (e) { /* ignore */ }
  throw new Error(msg);
}

/* ----------------------------------------------------------------- session / connexion */
async function demarrerSession() {
  // 1. session existante ?
  if (SESSION.token) {
    try {
      const res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: "Bearer " + SESSION.token } });
      if (res.ok) SESSION.utilisateur = await res.json();
      else { SESSION.token = null; sessionStorage.removeItem("sagi_token"); }
    } catch (e) { SESSION.token = null; }
  }
  // 2. sinon : écran de connexion, on attend la connexion réussie
  if (!SESSION.utilisateur) {
    await new Promise(resolve => { _loginResolve = resolve; afficherLogin(); });
  }
  // 3. mot de passe temporaire : changement obligatoire
  if (SESSION.utilisateur && SESSION.utilisateur.doit_changer_mdp) {
    await new Promise(resolve => { _mdpResolve = resolve; ouvrirChangementMdp(true); });
  }
}

function afficherLogin(message) {
  document.getElementById("modal-login").classList.remove("hidden");
  document.getElementById("login-bloc-form").classList.remove("hidden");
  document.getElementById("login-bloc-horsserveur").classList.add("hidden");
  const err = document.getElementById("login-erreur");
  if (message) { err.innerText = message; err.classList.remove("hidden"); } else { err.classList.add("hidden"); }
  // On remplit le dernier identifiant utilisé : il ne reste que le mot de passe à taper
  let dernier = "";
  try { dernier = localStorage.getItem("sagi_dernier_login") || ""; } catch (e) { /* ignore */ }
  const champId = document.getElementById("login-id");
  if (!champId.value) champId.value = dernier;
  setTimeout(() => document.getElementById(champId.value ? "login-mdp" : "login-id").focus(), 50);
}

function chargementConnexion(enCours) {
  const bouton = document.getElementById("login-bouton");
  bouton.disabled = enCours;
  document.getElementById("login-bouton-texte").innerText = enCours ? "Connexion…" : "Se connecter";
  document.getElementById("login-bouton-icone").className = enCours ? "fa-solid fa-spinner fa-spin mr-2" : "fa-solid fa-right-to-bracket mr-2";
}

function basculerVisibiliteMdp() {
  const champ = document.getElementById("login-mdp");
  const visible = champ.type === "password";
  champ.type = visible ? "text" : "password";
  document.querySelector("#login-oeil i").className = visible ? "fa-solid fa-eye-slash text-sm" : "fa-solid fa-eye text-sm";
  champ.focus();
}

function majAlerteMajuscules(e) {
  const actif = e.getModifierState && e.getModifierState("CapsLock");
  document.getElementById("login-majuscules").classList.toggle("hidden", !actif);
}

async function soumettreConnexion(e) {
  e.preventDefault();
  const err = document.getElementById("login-erreur");
  err.classList.add("hidden");
  const login = document.getElementById("login-id").value.trim();
  chargementConnexion(true);
  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, mot_de_passe: document.getElementById("login-mdp").value })
    });
    let j = {};
    try { j = await res.json(); } catch (ex) { /* réponse non JSON */ }
    if (!res.ok) throw new Error(j.message || "Connexion impossible (erreur " + res.status + ").");
    SESSION.token = j.token;
    SESSION.utilisateur = j.utilisateur;
    sessionStorage.setItem("sagi_token", j.token);
    try { localStorage.setItem("sagi_dernier_login", login); } catch (ex) { /* ignore */ }
    document.getElementById("login-mdp").value = "";
    document.getElementById("modal-login").classList.add("hidden");
    if (_loginResolve) { const r = _loginResolve; _loginResolve = null; r(); }
    else location.reload();    // session expirée en cours d'utilisation : on repart proprement
  } catch (ex) {
    // fetch() lève « Failed to fetch » quand le serveur est arrêté : on parle français
    err.innerText = ex instanceof TypeError ? "Le serveur ne répond pas. Vérifiez qu'il est bien lancé." : ex.message;
    err.classList.remove("hidden");
    document.getElementById("login-mdp").select();
  } finally {
    chargementConnexion(false);
  }
}

/* ----------------------------------------------------------------- serveur injoignable */
// Appelée au démarrage quand /api/status ne répond pas : on ne bascule jamais en silence en mode autonome.
async function choisirModeHorsServeur() {
  while (!isBackendOnline) {
    document.getElementById("modal-login").classList.remove("hidden");
    document.getElementById("login-bloc-form").classList.add("hidden");
    document.getElementById("login-bloc-horsserveur").classList.remove("hidden");
    const choix = await new Promise(resolve => { _horsServeurResolve = resolve; });
    if (choix === "autonome") { document.getElementById("modal-login").classList.add("hidden"); return; }
    await testerConnexionAPI();           // « Réessayer »
  }
  document.getElementById("modal-login").classList.add("hidden");
}
function reessayerServeur() {
  const b = document.getElementById("login-reessayer");
  b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Recherche du serveur…';
  setTimeout(() => { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-rotate mr-2"></i>Réessayer'; }, 1700);
  if (_horsServeurResolve) { const r = _horsServeurResolve; _horsServeurResolve = null; r("reessayer"); }
}
function continuerModeAutonome() {
  if (_horsServeurResolve) { const r = _horsServeurResolve; _horsServeurResolve = null; r("autonome"); }
}

async function deconnexion() {
  try { await apiFetch(`${API_BASE}/api/logout`, { method: "POST" }); } catch (e) { /* ignore */ }
  sessionStorage.removeItem("sagi_token");
  location.reload();
}

/* ----------------------------------------------------------------- changement de mot de passe */
function ouvrirChangementMdp(obligatoire) {
  ["mdp-actuel", "mdp-nouveau", "mdp-confirm"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("mdp-erreur").classList.add("hidden");
  document.getElementById("mdp-annuler").classList.toggle("hidden", !!obligatoire);
  document.getElementById("mdp-info").innerText = obligatoire
    ? "Votre mot de passe est temporaire : choisissez-en un nouveau pour continuer."
    : "Choisissez un nouveau mot de passe.";
  document.getElementById("modal-mdp").classList.remove("hidden");
}
function fermerChangementMdp() { document.getElementById("modal-mdp").classList.add("hidden"); }

async function soumettreChangementMdp(e) {
  e.preventDefault();
  const err = document.getElementById("mdp-erreur");
  const nouveau = document.getElementById("mdp-nouveau").value;
  const fail = m => { err.innerText = m; err.classList.remove("hidden"); };
  if (nouveau !== document.getElementById("mdp-confirm").value) return fail("La confirmation ne correspond pas au nouveau mot de passe.");
  try {
    const res = await apiFetch(`${API_BASE}/api/changer-mot-de-passe`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actuel: document.getElementById("mdp-actuel").value, nouveau })
    });
    await verifierReponse(res);
    if (SESSION.utilisateur) SESSION.utilisateur.doit_changer_mdp = false;
    fermerChangementMdp();
    afficherToast("Mot de passe modifié.", "success");
    if (_mdpResolve) { const r = _mdpResolve; _mdpResolve = null; r(); }
  } catch (ex) { fail(ex.message); }
}

/* ----------------------------------------------------------------- droits dans l'interface */
function droitCourant() {
  const u = SESSION.utilisateur;
  if (!u) return "GESTION";
  if (u.role === "ADMIN") return "GESTION";
  const d = (appState.exercicesDetail || []).find(x => x.annee === EXERCICE_COURANT);
  return d ? d.droit : "AUCUN";
}

function appliquerDroitsUI() {
  const u = SESSION.utilisateur;
  const enLigne = isBackendOnline && u;
  document.getElementById("tab-navigation").classList.toggle("hidden", !enLigne);
  const hu = document.getElementById("header-user");
  hu.classList.toggle("hidden", !enLigne);
  hu.classList.toggle("flex", !!enLigne);
  const b = document.body;
  if (!enLigne) {
    b.classList.remove("non-admin", "droit-lecture", "droit-gestion");
    document.getElementById("tab-utilisateurs").classList.add("hidden");
    document.getElementById("bandeau-dossier").classList.add("hidden");
    return;
  }
  document.getElementById("header-user-nom").innerText = u.nom;
  document.getElementById("header-user-role").innerText = u.role === "ADMIN" ? "Administrateur" : "Utilisateur";
  const admin = u.role === "ADMIN";
  b.classList.toggle("non-admin", !admin);
  document.getElementById("tab-utilisateurs").classList.toggle("hidden", !admin);

  const droit = droitCourant();
  const detExercice = (appState.exercicesDetail || []).find(x => x.annee === EXERCICE_COURANT) || {};
  b.classList.toggle("exercice-fige", detExercice.statut === "CLOTURE");   // exercice clôturé : plus de modification
  b.classList.toggle("droit-lecture", droit === "LECTURE");
  b.classList.toggle("droit-gestion", droit === "GESTION");
  b.classList.toggle("hidden-actions", droit === "AUCUN");

  // Bandeau du dossier ouvert
  const ban = document.getElementById("bandeau-dossier");
  const cl = appState.clientActif;
  if (!cl) { ban.classList.add("hidden"); return; }
  const det = (appState.exercicesDetail || []).find(x => x.annee === EXERCICE_COURANT) || {};
  const style = { OUVERT: "bg-emerald-50 border-emerald-200 text-emerald-800", CLOTURE: "bg-slate-100 border-slate-300 text-slate-700", HISTORIQUE: "bg-amber-50 border-amber-200 text-amber-800" }[det.statut] || "bg-slate-50 border-slate-200 text-slate-700";
  const libelleStatut = { OUVERT: "Exercice ouvert", CLOTURE: "Exercice clôturé", HISTORIQUE: "Exercice historique (importé d'Access)" }[det.statut] || "";
  ban.className = `no-print mb-4 rounded-xl border px-4 py-2.5 text-xs font-semibold flex flex-wrap items-center gap-x-4 gap-y-1 ${style}`;
  ban.innerHTML = `<span><i class="fa-solid fa-building mr-1"></i>${esc(cl.nom)}</span>
    <span><i class="fa-solid fa-calendar mr-1"></i>${esc(EXERCICE_COURANT)} · ${esc(libelleStatut)}</span>
    <span><i class="fa-solid ${NIVEAU_ICONE[droit] || "fa-lock"} mr-1"></i>Votre droit : ${esc(NIVEAU_LABEL[droit] || droit)}</span>`;
}

/* ----------------------------------------------------------------- navigation Sociétés × Années */
async function chargerNavigation() {
  if (!isBackendOnline) return;
  try {
    const res = await apiFetch(`${API_BASE}/api/navigation`);
    await verifierReponse(res);
    NAV_DATA = await res.json();
  } catch (e) {
    document.getElementById("nav-table").innerHTML = `<tbody><tr><td class="p-4 text-rose-600 font-semibold">${esc(e.message)}</td></tr></tbody>`;
    return;
  }
  const sel = document.getElementById("nav-filtre-annee");
  const courant = sel.value;
  sel.innerHTML = `<option value="">Toutes les années</option>` + NAV_DATA.annees.map(a => `<option value="${a}">${a}</option>`).join("");
  sel.value = NAV_DATA.annees.map(String).includes(courant) ? courant : "";
  rendreNavigation();
}

function rendreNavigation() {
  if (!NAV_DATA) return;
  const q = document.getElementById("nav-recherche").value.trim().toLowerCase();
  const filtreAnnee = document.getElementById("nav-filtre-annee").value;
  const annees = filtreAnnee ? [parseInt(filtreAnnee)] : NAV_DATA.annees;
  const clients = NAV_DATA.clients.filter(c => !q || (c.nom + " " + c.code + " " + (c.nif_ncc || "")).toLowerCase().includes(q))
    .filter(c => !filtreAnnee || c.cases[filtreAnnee]);

  const couleurs = {
    OUVERT: "bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200",
    CLOTURE: "bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300",
    HISTORIQUE: "bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200"
  };
  let html = `<thead class="bg-slate-50 sticky top-0 z-10"><tr><th class="py-2 px-3 text-[10px] uppercase text-slate-500 min-w-[220px] sticky left-0 bg-slate-50">Société</th>` +
    annees.map(a => `<th class="py-2 px-2 text-center text-[10px] uppercase text-slate-500">${a}</th>`).join("") + `</tr></thead><tbody class="divide-y divide-slate-100">`;
  if (clients.length === 0) {
    html += `<tr><td class="p-6 text-center text-slate-400" colspan="${annees.length + 1}">Aucune société accessible avec vos droits.</td></tr>`;
  }
  clients.forEach(c => {
    html += `<tr class="hover:bg-slate-50"><td class="py-2 px-3 sticky left-0 bg-white"><span class="font-bold text-slate-800">${esc(c.nom)}</span>
      <span class="block text-[10px] text-slate-400">${esc(c.nif_ncc || c.code)}</span></td>`;
    annees.forEach(a => {
      const cs = c.cases[String(a)];
      if (!cs) { html += `<td class="py-2 px-2 text-center text-slate-300">—</td>`; return; }
      if (cs.verrou) {
        html += `<td class="py-2 px-2 text-center"><span class="inline-block px-2 py-1 rounded-md text-slate-400 bg-slate-50 border border-dashed border-slate-200" title="Année non accessible avec vos droits"><i class="fa-solid fa-lock"></i></span></td>`;
        return;
      }
      const actif = NAV_SEL && NAV_SEL.clientId === c.id && NAV_SEL.annee === a ? " ring-2 ring-indigo-500" : "";
      html += `<td class="py-2 px-2 text-center"><button onclick="selectionnerCaseNavigation(${c.id}, ${a})"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold ${couleurs[cs.statut] || couleurs.CLOTURE}${actif}"
          title="${esc(NIVEAU_LABEL[cs.droit])} · ${nombreFr(cs.total_vb)} FCFA en service">
          <i class="fa-solid ${NIVEAU_ICONE[cs.droit] || "fa-eye"} text-[9px] opacity-70"></i>${cs.nb_biens}</button></td>`;
    });
    html += `</tr>`;
  });
  document.getElementById("nav-table").innerHTML = html + `</tbody>`;
}

async function selectionnerCaseNavigation(clientId, annee) {
  NAV_SEL = { clientId, annee };
  rendreNavigation();
  const c = NAV_DATA.clients.find(x => x.id === clientId);
  const cs = c.cases[String(annee)];
  document.getElementById("nav-apercu").classList.remove("hidden");
  document.getElementById("nav-apercu-titre").innerText = `${c.nom} — exercice ${annee}`;
  document.getElementById("nav-apercu-sous-titre").innerText =
    `${cs.nb_biens} immobilisation(s) · ${nombreFr(cs.total_vb)} FCFA en service · ${{ OUVERT: "exercice ouvert", CLOTURE: "clôturé", HISTORIQUE: "historique Access" }[cs.statut] || ""} · droit : ${NIVEAU_LABEL[cs.droit]}`;
  const corps = document.getElementById("nav-apercu-body");
  corps.innerHTML = `<tr><td colspan="8" class="p-4 text-slate-400">Chargement…</td></tr>`;
  try {
    const res = await apiFetch(`${API_BASE}/api/immobilisations?client_id=${clientId}&exercice=${annee}`);
    await verifierReponse(res);
    const immos = await res.json();
    const MAX = 300;
    const badge = { EN_SERVICE: "bg-emerald-100 text-emerald-700", CEDE: "bg-amber-100 text-amber-700", REBUT: "bg-rose-100 text-rose-700", ARCHIVE: "bg-slate-200 text-slate-600" };
    corps.innerHTML = immos.slice(0, MAX).map(i => {
      const s = i.situation_2024 || {};
      return `<tr><td class="py-1.5 px-3 font-mono text-[11px]">${esc(i.code_inventaire)}</td><td class="py-1.5 px-3">${esc(i.designation)}</td>
        <td class="py-1.5 px-3 text-slate-500">${esc(i.cat_code || "")}</td><td class="py-1.5 px-3">${esc((i.date_acquisition || "").slice(0, 10))}</td>
        <td class="py-1.5 px-3 text-right">${nombreFr(i.valeur_brute)}</td><td class="py-1.5 px-3 text-right">${nombreFr(s.dotation)}</td>
        <td class="py-1.5 px-3 text-right font-semibold">${nombreFr(s.vnc_fin)}</td>
        <td class="py-1.5 px-3 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${badge[i.statut] || badge.ARCHIVE}">${esc(i.statut)}</span></td></tr>`;
    }).join("") + (immos.length > MAX ? `<tr><td colspan="8" class="p-3 text-center text-slate-400">… ${immos.length - MAX} autres lignes : ouvrez le registre pour les voir toutes.</td></tr>` : "")
      || `<tr><td colspan="8" class="p-4 text-slate-400">Aucune immobilisation pour cet exercice.</td></tr>`;
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="8" class="p-4 text-rose-600 font-semibold">${esc(e.message)}</td></tr>`;
  }
}

async function ouvrirSelectionNavigation(vue) {
  if (!NAV_SEL) return;
  appState.clientActifId = NAV_SEL.clientId;
  localStorage.setItem("sagi_client_actif_id", String(NAV_SEL.clientId));
  EXERCICE_COURANT = NAV_SEL.annee;
  await chargerDonnees();
  changerOnglet(vue);
}

/* ----------------------------------------------------------------- utilisateurs (admin) */
async function chargerUtilisateurs() {
  try {
    const res = await apiFetch(`${API_BASE}/api/utilisateurs`);
    await verifierReponse(res);
    USERS = await res.json();
  } catch (e) { afficherToast(e.message, "warning"); return; }
  document.getElementById("table-utilisateurs").innerHTML = USERS.map(u => `
    <tr class="hover:bg-slate-50">
      <td class="py-2 px-3 font-mono font-bold">${esc(u.login)}</td>
      <td class="py-2 px-3">${esc(u.nom)}</td>
      <td class="py-2 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}">${u.role === "ADMIN" ? "Administrateur" : "Utilisateur"}</span></td>
      <td class="py-2 px-3">${u.actif ? '<span class="text-emerald-600 font-bold">Actif</span>' : '<span class="text-rose-600 font-bold">Désactivé</span>'}${u.doit_changer_mdp ? ' <span class="text-[10px] text-amber-600">(mot de passe temporaire)</span>' : ""}</td>
      <td class="py-2 px-3 text-center whitespace-nowrap">
        <button onclick="ouvrirDroits(${u.id})" class="px-2 py-1 rounded border border-slate-200 hover:bg-indigo-50 text-indigo-700 font-bold" title="Droits d'accès"><i class="fa-solid fa-user-lock"></i> Droits</button>
        <button onclick="ouvrirFormUtilisateur(${u.id})" class="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100" title="Modifier / réinitialiser le mot de passe"><i class="fa-solid fa-pen"></i></button>
        <button onclick="supprimerUtilisateur(${u.id})" class="px-2 py-1 rounded border border-slate-200 hover:bg-rose-50 text-rose-600" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </td></tr>`).join("");
}

function ouvrirFormUtilisateur(id = null) {
  const u = id ? USERS.find(x => x.id === id) : null;
  document.getElementById("user-form-titre").innerText = u ? "Modifier l'utilisateur" : "Nouvel utilisateur";
  document.getElementById("user-id").value = u ? u.id : "";
  document.getElementById("user-login").value = u ? u.login : "";
  document.getElementById("user-nom").value = u ? u.nom : "";
  document.getElementById("user-role").value = u ? u.role : "UTILISATEUR";
  document.getElementById("user-actif").value = u ? String(u.actif) : "1";
  document.getElementById("user-mdp").value = "";
  document.getElementById("user-mdp").required = !u;
  document.getElementById("user-mdp-label").innerText = u ? "Nouveau mot de passe (laisser vide pour ne pas le changer)" : "Mot de passe initial";
  document.getElementById("modal-utilisateur").classList.remove("hidden");
}
function fermerFormUtilisateur() { document.getElementById("modal-utilisateur").classList.add("hidden"); }

async function soumettreFormUtilisateur(e) {
  e.preventDefault();
  const id = document.getElementById("user-id").value;
  const corps = {
    login: document.getElementById("user-login").value.trim(),
    nom: document.getElementById("user-nom").value.trim(),
    role: document.getElementById("user-role").value,
    actif: parseInt(document.getElementById("user-actif").value),
    mot_de_passe: document.getElementById("user-mdp").value
  };
  try {
    await verifierReponse(await apiFetch(`${API_BASE}/api/utilisateurs${id ? "/" + id : ""}`, {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps)
    }));
    fermerFormUtilisateur();
    afficherToast(id ? "Utilisateur mis à jour." : "Utilisateur créé.", "success");
    chargerUtilisateurs();
  } catch (ex) { alert(ex.message); }
}

async function supprimerUtilisateur(id) {
  const u = USERS.find(x => x.id === id);
  if (!u || !confirm(`Supprimer définitivement l'utilisateur « ${u.login} » et ses droits ?`)) return;
  try {
    await verifierReponse(await apiFetch(`${API_BASE}/api/utilisateurs/${id}`, { method: "DELETE" }));
    afficherToast("Utilisateur supprimé.", "success");
    if (DROITS_CIBLE && DROITS_CIBLE.user.id === id) { DROITS_CIBLE = null; document.getElementById("droits-panel").classList.add("hidden"); }
    chargerUtilisateurs();
  } catch (ex) { alert(ex.message); }
}

/* ----------------------------------------------------------------- éditeur de droits */
async function ouvrirDroits(id) {
  try {
    const [rd, rn] = await Promise.all([apiFetch(`${API_BASE}/api/utilisateurs/${id}/droits`), apiFetch(`${API_BASE}/api/navigation`)]);
    await verifierReponse(rd); await verifierReponse(rn);
    const d = await rd.json();
    NAV_DATA = await rn.json();
    const etat = {};
    d.droits.forEach(x => { etat[`${x.client_id}:${x.exercice || 0}`] = x.niveau; });
    DROITS_CIBLE = { user: d.utilisateur, etat };
  } catch (ex) { alert(ex.message); return; }
  document.getElementById("droits-nom").innerText = `${DROITS_CIBLE.user.nom} (${DROITS_CIBLE.user.login})`;
  document.getElementById("droits-note-admin").classList.toggle("hidden", DROITS_CIBLE.user.role !== "ADMIN");
  document.getElementById("droits-recherche").value = "";
  document.getElementById("droits-panel").classList.remove("hidden");
  rendreEditeurDroits();
  document.getElementById("droits-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function rendreEditeurDroits() {
  if (!DROITS_CIBLE || !NAV_DATA) return;
  const q = document.getElementById("droits-recherche").value.trim().toLowerCase();
  const annees = NAV_DATA.annees;
  const opt = (val, cle, inclureHerite) => {
    const choix = inclureHerite ? [["", "(hérite)"], ["AUCUN", "Aucun"]] : [["", "Aucun"]];
    ["LECTURE", "ECRITURE", "GESTION"].forEach(n => choix.push([n, NIVEAU_LABEL[n]]));
    return choix.map(([v, l]) => `<option value="${v}"${(val || "") === v ? " selected" : ""}>${l}</option>`).join("");
  };
  let html = `<thead class="bg-slate-50 sticky top-0"><tr><th class="py-2 px-2 text-left text-[10px] uppercase text-slate-500 min-w-[200px]">Société</th>
    <th class="py-2 px-2 text-[10px] uppercase text-indigo-600">Toutes années</th>` +
    annees.map(a => `<th class="py-2 px-2 text-[10px] uppercase text-slate-500">${a}</th>`).join("") + `</tr></thead><tbody class="divide-y divide-slate-100">`;
  NAV_DATA.clients.filter(c => !q || (c.nom + c.code).toLowerCase().includes(q)).forEach(c => {
    html += `<tr><td class="py-1.5 px-2 font-semibold text-slate-700">${esc(c.nom)}</td>
      <td class="py-1 px-1"><select onchange="majDroit(${c.id}, 0, this.value)" class="w-full px-1 py-1 border border-indigo-200 rounded bg-indigo-50/40 font-semibold">${opt(DROITS_CIBLE.etat[`${c.id}:0`], 0, false)}</select></td>`;
    annees.forEach(a => {
      if (!c.cases[String(a)]) { html += `<td class="py-1 px-1 text-center text-slate-300">·</td>`; return; }
      html += `<td class="py-1 px-1"><select onchange="majDroit(${c.id}, ${a}, this.value)" class="w-full px-1 py-1 border border-slate-200 rounded bg-white">${opt(DROITS_CIBLE.etat[`${c.id}:${a}`], a, true)}</select></td>`;
    });
    html += `</tr>`;
  });
  document.getElementById("droits-table").innerHTML = html + `</tbody>`;
}

function majDroit(clientId, annee, valeur) {
  const cle = `${clientId}:${annee}`;
  if (valeur) DROITS_CIBLE.etat[cle] = valeur; else delete DROITS_CIBLE.etat[cle];
}

function appliquerDroitsEnMasse() {
  const v = document.getElementById("droits-masse").value;
  if (!v || !DROITS_CIBLE) return;
  if (!confirm(`Donner le niveau « ${NIVEAU_LABEL[v]} » sur TOUTES les sociétés (toutes années) à ${DROITS_CIBLE.user.nom} ?`)) return;
  NAV_DATA.clients.forEach(c => { DROITS_CIBLE.etat[`${c.id}:0`] = v; });
  rendreEditeurDroits();
}

async function enregistrerDroits() {
  if (!DROITS_CIBLE) return;
  const droits = Object.entries(DROITS_CIBLE.etat).map(([cle, niveau]) => {
    const [cid, annee] = cle.split(":").map(Number);
    return { client_id: cid, exercice: annee || null, niveau };
  });
  try {
    const res = await apiFetch(`${API_BASE}/api/utilisateurs/${DROITS_CIBLE.user.id}/droits`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ droits })
    });
    await verifierReponse(res);
    afficherToast("Droits enregistrés.", "success");
  } catch (ex) { alert(ex.message); }
}
