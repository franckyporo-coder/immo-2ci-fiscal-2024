/* ============================================================================
   tables.js — Onglet « Tables » : consultation et édition des tables de référence
   (catégories SYSCOHADA, services, paramètres, sociétés) + vues en lecture seule
   (immobilisations de l'exercice affiché, historique des clôtures).
   Chargé après app.js et acces.js.
   ========================================================================== */

let TABLE_ACTIVE = "categories";

const TABLES_DEF = {
  categories: {
    titre: "Table : Catégories SYSCOHADA", icone: "C", editable: true, libelleAjout: "Ajouter une Catégorie",
    description: "Comptes généraux, durées standard et taux d'amortissement selon le plan SYSCOHADA.",
    source: () => appState.categories,
    colonnes: [["code", "Code"], ["libelle", "Libellé"], ["compte_immo", "Compte immo."], ["compte_amort", "Compte amort."],
               ["compte_dotation", "Compte dotation"], ["duree_defaut", "Durée (ans)"], ["taux_defaut", "Taux %"]],
  },
  services: {
    titre: "Table : Services", icone: "S", editable: true, libelleAjout: "Ajouter un Service",
    description: "Services / départements auxquels les immobilisations peuvent être affectées.",
    source: () => appState.services,
    colonnes: [["code", "Code"], ["nom", "Nom"], ["responsable", "Responsable"]],
  },
  clients: {
    titre: "Table : Sociétés (dossiers clients)", icone: "D", editable: true, libelleAjout: "Ajouter une Société",
    description: "Sociétés gérées par l'application. Les droits d'accès se règlent dans « Utilisateurs & Droits ».",
    source: () => appState.clients,
    colonnes: [["code", "Code"], ["nom", "Société"], ["nif_ncc", "N° contribuable"], ["regime_fiscal", "Régime"], ["secteur", "Secteur"]],
  },
  immobilisations: {
    titre: "Table : Immobilisations (exercice affiché)", icone: "I", editable: false,
    description: "Lecture seule : immobilisations de la société et de l'exercice actuellement ouverts.",
    source: () => appState.immobilisations,
    colonnes: [["code_inventaire", "Code"], ["designation", "Désignation"], ["cat_code", "Catégorie"], ["date_acquisition", "Acquisition"],
               ["valeur_brute", "Valeur brute"], ["cumul_amort_anterieur", "Amort. antérieur"], ["statut", "Statut"]],
  },
  exercices_historique: {
    titre: "Table : Historique des clôtures", icone: "H", editable: false,
    description: "Lecture seule : exercices clôturés de la société active.",
    source: () => appState.historiqueClotures,
    colonnes: [["exercice", "Exercice"], ["date_cloture", "Date de clôture"], ["nb_biens", "Biens"], ["total_valeur_brute", "Valeur brute"],
               ["total_dotations", "Dotations"], ["total_vnc", "V.N.C."]],
  },
  parametres: {
    titre: "Table : Paramètres", icone: "P", editable: true, libelleAjout: "Ajouter un Paramètre",
    description: "Paramètres généraux de l'application (clé / valeur).",
    source: () => appState.parametres,
    colonnes: [["cle", "Clé"], ["valeur", "Valeur"]],
  },
};
const COLONNES_NOMBRES = new Set(["valeur_brute", "cumul_amort_anterieur", "total_valeur_brute", "total_dotations", "total_vnc"]);

function initialiserFormulaires() {
  // Les listes déroulantes sont remplies par remplirSelecteursFormulaire() ; rien d'autre à initialiser.
  TABLE_ACTIVE = TABLE_ACTIVE || "categories";
}

function rendreExplorateurTables() {
  selectionnerTableActive(TABLE_ACTIVE, true);
}

function selectionnerTableActive(nom, conserverRecherche) {
  if (!TABLES_DEF[nom]) return;
  TABLE_ACTIVE = nom;
  if (!conserverRecherche) { const r = document.getElementById("recherche-table-input"); if (r) r.value = ""; }
  Object.keys(TABLES_DEF).forEach(t => {
    const pill = document.getElementById("pill-table-" + t);
    if (pill) ["ring-2", "ring-indigo-500", "shadow-md"].forEach(c => pill.classList.toggle(c, t === nom));
  });
  rendreContenuTableActive();
}

function filtrerLignesTableActive() { rendreContenuTableActive(); }

function _valeurCellule(col, v) {
  if (v === null || v === undefined || v === "") return '<span class="text-slate-300">—</span>';
  if (COLONNES_NOMBRES.has(col)) return `<span class="font-mono">${esc(nombreFr(v))}</span>`;
  return esc(v);
}

function rendreContenuTableActive() {
  const def = TABLES_DEF[TABLE_ACTIVE];
  if (!def) return;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
  set("table-active-titre", def.titre);
  set("table-active-badge-nom", TABLE_ACTIVE);
  set("table-active-description", def.description);
  set("table-active-icon", def.icone);
  const btn = document.getElementById("btn-ajouter-ligne-table");
  const admin = !SESSION || !SESSION.utilisateur || SESSION.utilisateur.role === "ADMIN";
  if (btn) {
    btn.classList.toggle("hidden", !def.editable || !admin);
    set("btn-txt-ajouter-table", def.libelleAjout || "Ajouter");
  }
  const q = (document.getElementById("recherche-table-input")?.value || "").trim().toLowerCase();
  const toutes = def.source() || [];
  const lignes = toutes.filter(l => !q || def.colonnes.some(([c]) => String(l[c] ?? "").toLowerCase().includes(q)));
  const MAX = 500;
  const avecActions = def.editable && admin;

  document.getElementById("entete-table-active").innerHTML = `<tr>` +
    def.colonnes.map(([, l]) => `<th class="py-2.5 px-3 text-left">${esc(l)}</th>`).join("") +
    (avecActions ? `<th class="py-2.5 px-3 text-center">Actions</th>` : "") + `</tr>`;

  const cle = l => TABLE_ACTIVE === "parametres" ? l.cle : l.id;
  document.getElementById("body-table-active").innerHTML = lignes.slice(0, MAX).map(l => `<tr class="hover:bg-slate-50">` +
    def.colonnes.map(([c]) => `<td class="py-2 px-3">${_valeurCellule(c, l[c])}</td>`).join("") +
    (avecActions ? `<td class="py-2 px-3 text-center whitespace-nowrap">
        <button onclick="modifierLigneTable(${JSON.stringify(cle(l)).replace(/"/g, "&quot;")})" class="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        <button onclick="supprimerLigneTable(${JSON.stringify(cle(l)).replace(/"/g, "&quot;")})" class="px-2 py-1 rounded border border-slate-200 hover:bg-rose-50 text-rose-600" title="Supprimer"><i class="fa-solid fa-trash"></i></button></td>` : "") +
    `</tr>`).join("") ||
    `<tr><td colspan="${def.colonnes.length + 1}" class="p-6 text-center text-slate-400">Aucun enregistrement.</td></tr>`;

  set("statut-table-active", `Affichage de ${Math.min(lignes.length, MAX)} enregistrement(s)` +
    (lignes.length !== toutes.length ? ` sur ${toutes.length}` : "") + (lignes.length > MAX ? ` — les ${MAX} premiers` : ""));
  actualiserCompteursTables();
}

function exporterTableActiveExcel() {
  const def = TABLES_DEF[TABLE_ACTIVE];
  if (!def || typeof XLSX === "undefined") { afficherToast("Export Excel indisponible (bibliothèque non chargée).", "warning"); return; }
  const aoa = [def.colonnes.map(([, l]) => l), ...(def.source() || []).map(l => def.colonnes.map(([c]) => l[c] ?? ""))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), TABLE_ACTIVE.slice(0, 31));
  XLSX.writeFile(wb, `${TABLE_ACTIVE}.xlsx`);
}

async function rechargerDonneesTables() {
  await chargerDonnees();
  afficherToast("Données rechargées.", "info");
}

/* ---------------------------------------------------------------- ajout / modification */
function ouvrirModalAjoutLigneTable() { modifierLigneTable(null); }

function modifierLigneTable(cle) {
  if (TABLE_ACTIVE === "clients") return ouvrirFormulaireClient(cle);
  if (TABLE_ACTIVE === "categories") return _ouvrirModalCategorie(cle);
  if (TABLE_ACTIVE === "services") return _ouvrirModalService(cle);
  if (TABLE_ACTIVE === "parametres") return _ouvrirModalParametre(cle);
}

const _montrer = id => document.getElementById(id).classList.remove("hidden");
const _cacher = id => document.getElementById(id).classList.add("hidden");
const _val = (id, v) => { document.getElementById(id).value = v ?? ""; };

function _ouvrirModalCategorie(id) {
  const c = id ? appState.categories.find(x => x.id == id) : null;
  document.getElementById("form-table-categorie").reset();
  document.getElementById("modal-table-cat-titre").innerText = c ? "Modifier la catégorie" : "Nouvelle catégorie";
  _val("table-cat-id", c ? c.id : "");
  _val("table-cat-code", c ? c.code : "");
  _val("table-cat-libelle", c ? c.libelle : "");
  _val("table-cat-compte-immo", c ? c.compte_immo : "");
  _val("table-cat-compte-amort", c ? c.compte_amort : "");
  _val("table-cat-compte-dotation", c ? c.compte_dotation : "6812");
  _val("table-cat-duree", c ? c.duree_defaut : 5);
  _val("table-cat-taux", c ? c.taux_defaut : 20);
  _val("table-cat-mode", c ? c.mode_defaut : "LINEAIRE");
  _montrer("modal-table-categorie");
}
function fermerModalTableCategorie() { _cacher("modal-table-categorie"); }
function calculerTauxCatAuto() {
  const d = parseInt(document.getElementById("table-cat-duree").value) || 0;
  if (d > 0) document.getElementById("table-cat-taux").value = (100 / d).toFixed(2);
}

function _ouvrirModalService(id) {
  const s = id ? appState.services.find(x => x.id == id) : null;
  document.getElementById("form-table-service").reset();
  document.getElementById("modal-table-srv-titre").innerText = s ? "Modifier le service" : "Nouveau service";
  _val("table-srv-id", s ? s.id : "");
  _val("table-srv-code", s ? s.code : "");
  _val("table-srv-nom", s ? s.nom : "");
  _val("table-srv-responsable", s ? s.responsable : "");
  _montrer("modal-table-service");
}
function fermerModalTableService() { _cacher("modal-table-service"); }

function _ouvrirModalParametre(cle) {
  const p = cle ? appState.parametres.find(x => x.cle === cle) : null;
  document.getElementById("form-table-parametre").reset();
  document.getElementById("modal-table-par-titre").innerText = p ? "Modifier le paramètre" : "Nouveau paramètre";
  _val("table-par-cle-old", p ? p.cle : "");
  _val("table-par-cle", p ? p.cle : "");
  _val("table-par-valeur", p ? p.valeur : "");
  _montrer("modal-table-parametre");
}
function fermerModalTableParametre() { _cacher("modal-table-parametre"); }

async function _enregistrerTable(ressource, id, corps, modalId) {
  if (isBackendOnline) {
    try {
      await verifierReponse(await apiFetch(`${API_BASE}/api/${ressource}${id ? "/" + encodeURIComponent(id) : ""}`, {
        method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps)
      }));
    } catch (e) { alert("Enregistrement impossible : " + e.message); return false; }
    _cacher(modalId);
    await chargerDonnees();
  } else {
    const liste = appState[ressource === "categories" ? "categories" : "services"];
    if (id) Object.assign(liste.find(x => x.id == id), corps);
    else liste.push({ id: Math.max(0, ...liste.map(x => x.id)) + 1, ...corps });
    sauvegarderLocalement();
    _cacher(modalId);
    mettreAJourInterface();
  }
  afficherToast("Enregistré.", "success");
  return true;
}

async function soumettreTableCategorie(e) {
  e.preventDefault();
  const g = id => document.getElementById(id).value.trim();
  await _enregistrerTable("categories", g("table-cat-id"), {
    code: g("table-cat-code"), libelle: g("table-cat-libelle"), compte_immo: g("table-cat-compte-immo"),
    compte_amort: g("table-cat-compte-amort"), compte_dotation: g("table-cat-compte-dotation") || "6812",
    duree_defaut: parseInt(g("table-cat-duree")) || 5, taux_defaut: parseFloat(g("table-cat-taux")) || 20,
    mode_defaut: document.getElementById("table-cat-mode").value
  }, "modal-table-categorie");
}

async function soumettreTableService(e) {
  e.preventDefault();
  const g = id => document.getElementById(id).value.trim();
  await _enregistrerTable("services", g("table-srv-id"),
    { code: g("table-srv-code").toUpperCase(), nom: g("table-srv-nom"), responsable: g("table-srv-responsable") }, "modal-table-service");
}

async function soumettreTableParametre(e) {
  e.preventDefault();
  const ancienne = document.getElementById("table-par-cle-old").value;
  const cle = document.getElementById("table-par-cle").value.trim();
  const valeur = document.getElementById("table-par-valeur").value.trim();
  if (isBackendOnline) {
    try {
      if (ancienne && ancienne !== cle)
        await verifierReponse(await apiFetch(`${API_BASE}/api/parametres/${encodeURIComponent(ancienne)}`, { method: "DELETE" }));
      await verifierReponse(await apiFetch(`${API_BASE}/api/parametres`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cle, valeur })
      }));
    } catch (ex) { alert("Enregistrement impossible : " + ex.message); return; }
    _cacher("modal-table-parametre");
    await chargerDonnees();
  } else {
    appState.parametres = appState.parametres.filter(p => p.cle !== ancienne && p.cle !== cle);
    appState.parametres.push({ cle, valeur });
    sauvegarderLocalement();
    _cacher("modal-table-parametre");
    mettreAJourInterface();
  }
  afficherToast("Paramètre enregistré.", "success");
}

/* ---------------------------------------------------------------- suppression */
async function supprimerLigneTable(cle) {
  if (TABLE_ACTIVE === "clients") return supprimerClient(cle);
  if (!confirm("Supprimer définitivement cette ligne ?")) return;
  const ressource = TABLE_ACTIVE;
  if (isBackendOnline) {
    try {
      await verifierReponse(await apiFetch(`${API_BASE}/api/${ressource}/${encodeURIComponent(cle)}`, { method: "DELETE" }));
    } catch (e) { alert("Suppression impossible : " + e.message); return; }
    await chargerDonnees();
  } else {
    if (ressource === "parametres") appState.parametres = appState.parametres.filter(p => p.cle !== cle);
    else appState[ressource] = appState[ressource].filter(x => x.id != cle);
    sauvegarderLocalement();
    mettreAJourInterface();
  }
  afficherToast("Ligne supprimée.", "success");
}
