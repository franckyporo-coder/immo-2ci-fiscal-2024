/**
 * SAGI IMMO FISCAL 2024 - Moteur d'interface et logique client.
 * Prise en charge API REST + mode local de secours (LocalStorage).
 */

const API_BASE = "";
let EXERCICE_COURANT = 2024;
let DEVISE = "FCFA";
let isBackendOnline = false;

// État local en mémoire
let appState = {
  clients: [],
  clientActifId: 1,
  clientActif: null,
  categories: [],
  services: [],
  immobilisations: [],
  historiqueClotures: [],
  parametres: [],
  tableActive: 'categories',
  rechercheTableTerme: '',
  exercicesDisponibles: [2024],
  dashboard: null,
  tableauFiscal: null
};

const SEED_PARAMETRES = [
  { cle: 'raison_sociale', valeur: 'SAGI S.A.' },
  { cle: 'nif_ncc', valeur: '0012345-X' },
  { cle: 'devise', valeur: 'FCFA' },
  { cle: 'regime_fiscal', valeur: 'Réel Normal' },
  { cle: 'exercice_courant', valeur: '2024' },
  { cle: 'norme_comptable', valeur: 'SYSCOHADA Révisé' },
  { cle: 'systeme_source', valeur: '2CI FISCAL 2024.mdb (Microsoft Access)' }
];

// Données par défaut pour démonstration / mode hors-ligne
const SEED_CLIENTS = [
  { id: 1, code: 'SAGI', nom: 'SAGI S.A.', nif_ncc: '0012345-X', regime_fiscal: 'Réel Normal', devise: 'FCFA', secteur: 'Immobilier & Gestion d\'actifs', adresse: 'Abidjan Plateau, Tour B', contact: 'M. Kouassi - DAF', telephone: '+225 07 12 34 56', email: 'contact@sagi.ci' },
  { id: 2, code: '2CI', nom: '2CI SARL', nif_ncc: '0098765-Y', regime_fiscal: 'Réel Normal', devise: 'FCFA', secteur: 'BTP, Travaux & Prestations', adresse: 'Abidjan Cocody, Rue des Jardins', contact: 'Mme Touré - Chef Comptable', telephone: '+225 05 98 76 54', email: 'admin@2ci.ci' },
  { id: 3, code: 'AFRIC_LOG', nom: 'Afric Logistique & Transport', nif_ncc: '0044556-Z', regime_fiscal: 'Réel Simplifié', devise: 'FCFA', secteur: 'Transport de fret & transit', adresse: 'San Pedro, Zone Portuaire', contact: 'M. Diallo - Gérant', telephone: '+225 01 23 45 67', email: 'info@africlog.ci' }
];

const SEED_CATEGORIES = [
  { id: 1, code: '218', libelle: 'Logiciels, licences et brevets', compte_immo: '218000', compte_amort: '281800', duree_defaut: 3, taux_defaut: 33.33 },
  { id: 2, code: '231', libelle: 'Bâtiments et constructions', compte_immo: '231000', compte_amort: '283100', duree_defaut: 20, taux_defaut: 5.0 },
  { id: 3, code: '241', libelle: 'Matériel et outillage industriel', compte_immo: '241000', compte_amort: '284100', duree_defaut: 5, taux_defaut: 20.0 },
  { id: 4, code: '2441', libelle: 'Matériel de bureau', compte_immo: '244100', compte_amort: '284410', duree_defaut: 5, taux_defaut: 20.0 },
  { id: 5, code: '2442', libelle: 'Matériel informatique', compte_immo: '244200', compte_amort: '284420', duree_defaut: 3, taux_defaut: 33.33 },
  { id: 6, code: '2443', libelle: 'Mobilier de bureau', compte_immo: '244300', compte_amort: '284430', duree_defaut: 10, taux_defaut: 10.0 },
  { id: 7, code: '2451', libelle: 'Matériel de transport (Véhicules tourisme)', compte_immo: '245100', compte_amort: '284510', duree_defaut: 5, taux_defaut: 20.0 },
  { id: 8, code: '2452', libelle: 'Matériel de transport (Utilitaires & Camions)', compte_immo: '245200', compte_amort: '284520', duree_defaut: 4, taux_defaut: 25.0 },
  { id: 9, code: '246', libelle: 'Agencements et aménagements', compte_immo: '246000', compte_amort: '284600', duree_defaut: 10, taux_defaut: 10.0 }
];

const SEED_SERVICES = [
  { id: 1, code: 'DIR', nom: 'Direction Générale', responsable: 'Directeur Général' },
  { id: 2, code: 'ADM', nom: 'Administration & Finances', responsable: 'Responsable Financier' },
  { id: 3, code: 'COM', nom: 'Service Commercial & Marketing', responsable: 'Chef des Ventes' },
  { id: 4, code: 'EXP', nom: 'Exploitation & Opérations', responsable: 'Chef d\'Exploitation' },
  { id: 5, code: 'IT', nom: 'Systèmes d\'Information', responsable: 'Responsable IT' }
];

const SEED_IMMOBILISATIONS = [
  {
    id: 1, client_id: 1, code_inventaire: 'IMM-2021-001', designation: 'Véhicule Toyota Hilux Double Cabine',
    categorie_id: 7, service_id: 4, date_acquisition: '2021-03-15', date_mise_en_service: '2021-03-15',
    valeur_brute: 24500000, duree_annees: 5, taux_amortissement: 20.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 13883333, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'CFAO Motors', num_facture: 'FAC-2021-089', emplacement: 'Parc Auto'
  },
  {
    id: 2, client_id: 1, code_inventaire: 'IMM-2022-002', designation: 'Serveur Dell PowerEdge R740 + Baie',
    categorie_id: 5, service_id: 5, date_acquisition: '2022-01-10', date_mise_en_service: '2022-01-10',
    valeur_brute: 8200000, duree_annees: 3, taux_amortissement: 33.33, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 5466667, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'Microtec Solutions', num_facture: 'FAC-2022-012', emplacement: 'Salle Serveur'
  },
  {
    id: 3, client_id: 1, code_inventaire: 'IMM-2023-003', designation: 'Ensemble Mobilier Bureau Direction (Acajou)',
    categorie_id: 6, service_id: 1, date_acquisition: '2023-06-01', date_mise_en_service: '2023-06-01',
    valeur_brute: 3500000, duree_annees: 10, taux_amortissement: 10.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 204167, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'Mobilier Moderne CI', num_facture: 'FAC-2023-455', emplacement: 'Bureau DG'
  },
  {
    id: 4, client_id: 1, code_inventaire: 'IMM-2024-004', designation: '5 Postes PC Portables HP EliteBook i7',
    categorie_id: 5, service_id: 2, date_acquisition: '2024-02-01', date_mise_en_service: '2024-02-01',
    valeur_brute: 4750000, duree_annees: 3, taux_amortissement: 33.33, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 0, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'Afric Technologies', num_facture: 'FAC-2024-034', emplacement: 'Comptabilité'
  },
  {
    id: 5, client_id: 1, code_inventaire: 'IMM-2024-005', designation: 'Groupe Électrogène SDMO 60 kVA',
    categorie_id: 3, service_id: 4, date_acquisition: '2024-05-15', date_mise_en_service: '2024-05-15',
    valeur_brute: 12000000, duree_annees: 5, taux_amortissement: 20.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 0, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'Energie Plus', num_facture: 'FAC-2024-118', emplacement: 'Cour Centrale'
  },
  {
    id: 6, client_id: 1, code_inventaire: 'IMM-2020-006', designation: 'Photocopieur Canon ImageRunner C3520i',
    categorie_id: 4, service_id: 2, date_acquisition: '2020-01-05', date_mise_en_service: '2020-01-05',
    valeur_brute: 3800000, duree_annees: 5, taux_amortissement: 20.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 3040000, statut: 'CEDE', date_sortie: '2024-06-30', prix_cession: 500000,
    fournisseur: 'Burotic System', num_facture: 'FAC-2020-008', emplacement: 'Pool Administratif'
  },
  // Immobilisations spécifiques pour 2CI SARL
  {
    id: 101, client_id: 2, code_inventaire: '2CI-2022-001', designation: 'Bétonnière Professionnelle Altrad 350L',
    categorie_id: 3, service_id: 4, date_acquisition: '2022-04-10', date_mise_en_service: '2022-04-10',
    valeur_brute: 3200000, duree_annees: 5, taux_amortissement: 20.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 1066667, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'BTP Distribution CI', num_facture: 'FAC-2022-045', emplacement: 'Chantier Cocody'
  },
  {
    id: 102, client_id: 2, code_inventaire: '2CI-2023-002', designation: 'Camion Benne Isuzu FVR 15 Tonnes',
    categorie_id: 8, service_id: 4, date_acquisition: '2023-01-15', date_mise_en_service: '2023-01-15',
    valeur_brute: 38500000, duree_annees: 4, taux_amortissement: 25.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 9625000, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'Japan Motors CI', num_facture: 'FAC-2023-019', emplacement: 'Parc Engins'
  },
  {
    id: 103, client_id: 2, code_inventaire: '2CI-2024-003', designation: 'Station Totale Leica FlexLine TS07',
    categorie_id: 3, service_id: 5, date_acquisition: '2024-03-01', date_mise_en_service: '2024-03-01',
    valeur_brute: 6500000, duree_annees: 5, taux_amortissement: 20.0, mode_amortissement: 'LINEAIRE',
    cumul_amort_anterieur: 0, statut: 'EN_SERVICE', date_sortie: null, prix_cession: 0,
    fournisseur: 'Topo Geo Services', num_facture: 'FAC-2024-088', emplacement: 'Bureau Géomètre'
  }
];

let chartCategories = null;

// ==================== INITIALISATION ====================
document.addEventListener("DOMContentLoaded", async () => {
  await testerConnexionAPI();
  if (!isBackendOnline) await choisirModeHorsServeur();   // acces.js : serveur arrêté → Réessayer / mode autonome (choix explicite)
  if (isBackendOnline) await demarrerSession();           // acces.js : connexion obligatoire
  await chargerDonnees();
  initialiserFormulaires();
  lancerSimulation(); // Pour initialiser le simulateur
  changerOnglet(isBackendOnline ? "navigation" : "dashboard");
});

// Test si le serveur Python FastAPI / HTTP tourne
async function testerConnexionAPI() {
  const pill = document.getElementById("api-status-pill");
  const text = document.getElementById("api-status-text");
  try {
    const res = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      isBackendOnline = true;
      pill.className = "flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-800";
      text.innerText = "Connecté API SQLite";
      return;
    }
  } catch (e) {
    // Mode autonome / LocalStorage
  }
  isBackendOnline = false;
  pill.className = "flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-800";
  text.innerText = "Mode Autonome";
}

// Chargement des données globales
async function chargerDonnees() {
  if (isBackendOnline) {
    try {
      const [clientsList, cats, srv, paramsList] = await Promise.all([
        apiFetch(`${API_BASE}/api/clients`).then(r => r.json()),
        apiFetch(`${API_BASE}/api/categories`).then(r => r.json()),
        apiFetch(`${API_BASE}/api/services`).then(r => r.json()),
        apiFetch(`${API_BASE}/api/parametres`).then(r => r.json()).catch(() => SEED_PARAMETRES)
      ]);
      appState.clients = Array.isArray(clientsList) ? clientsList : [];
      appState.categories = cats;
      appState.services = srv;
      appState.parametres = (paramsList && paramsList.length > 0) ? paramsList : SEED_PARAMETRES;

      if (appState.clients.length === 0) {
        // Aucun dossier accessible avec les droits de l'utilisateur
        appState.clientActifId = null;
        appState.clientActif = null;
        appState.immobilisations = [];
        appState.exercicesDisponibles = [];
        appState.exercicesDetail = [];
        appState.historiqueClotures = [];
      } else {
        // Société active : dernier choix si toujours accessible, sinon la première de la liste
        const storedCId = localStorage.getItem("sagi_client_actif_id");
        if (appState.clientActifId && appState.clients.some(c => c.id == appState.clientActifId)) {
          // on conserve la société déjà ouverte
        } else if (storedCId && appState.clients.some(c => c.id == storedCId)) {
          appState.clientActifId = parseInt(storedCId);
        } else {
          appState.clientActifId = appState.clients[0].id;
        }
        appState.clientActif = appState.clients.find(c => c.id == appState.clientActifId) || appState.clients[0];
        DEVISE = appState.clientActif.devise || "FCFA";

        // Exercices accessibles pour cette société
        const exInfo = await apiFetch(`${API_BASE}/api/exercices?client_id=${appState.clientActifId}`).then(r => r.json());
        appState.exercicesDetail = exInfo.exercices_detail || [];
        appState.exercicesDisponibles = exInfo.exercices_disponibles || [];
        appState.historiqueClotures = exInfo.historique || [];
        if (!appState.exercicesDisponibles.includes(EXERCICE_COURANT)) {
          EXERCICE_COURANT = exInfo.exercice_courant || appState.exercicesDisponibles[0];
        }

        // Immobilisations de cette société pour l'exercice choisi
        appState.immobilisations = EXERCICE_COURANT
          ? await apiFetch(`${API_BASE}/api/immobilisations?client_id=${appState.clientActifId}&exercice=${EXERCICE_COURANT}`).then(r => r.json())
          : [];
      }
    } catch (err) {
      // Connecté au serveur : on n'affiche JAMAIS les données de démonstration à la place des vraies données
      console.warn("Erreur chargement API :", err);
      appState.clients = []; appState.clientActifId = null; appState.clientActif = null;
      appState.immobilisations = []; appState.exercicesDisponibles = []; appState.exercicesDetail = [];
      appState.historiqueClotures = [];
      if (err.message !== "Session expirée") afficherToast("Chargement impossible : " + err.message, "warning");
    }
  } else {
    chargerDepuisLocal();
  }

  mettreAJourInterface();
}

function chargerDepuisLocal() {
  const storedClients = localStorage.getItem("sagi_clients");
  const storedCats = localStorage.getItem("sagi_categories");
  const storedSrv = localStorage.getItem("sagi_services");
  const storedParams = localStorage.getItem("sagi_parametres");
  const storedAllImmos = localStorage.getItem("sagi_all_immobilisations");
  const storedHisto = localStorage.getItem("sagi_historique_clotures");
  const storedEx = localStorage.getItem("sagi_exercice_courant");
  const storedCId = localStorage.getItem("sagi_client_actif_id");

  appState.clients = storedClients ? JSON.parse(storedClients) : SEED_CLIENTS;

  if (storedCId && appState.clients.some(c => c.id == storedCId)) {
    appState.clientActifId = parseInt(storedCId);
  } else if (!appState.clientActifId || !appState.clients.some(c => c.id == appState.clientActifId)) {
    appState.clientActifId = appState.clients[0].id;
  }
  appState.clientActif = appState.clients.find(c => c.id == appState.clientActifId) || appState.clients[0];
  DEVISE = appState.clientActif.devise || "FCFA";

  if (storedEx && !appState.exercicesDisponibles.includes(parseInt(storedEx))) {
    EXERCICE_COURANT = parseInt(storedEx);
  }

  appState.categories = storedCats ? JSON.parse(storedCats) : SEED_CATEGORIES;
  appState.services = storedSrv ? JSON.parse(storedSrv) : SEED_SERVICES;
  appState.parametres = storedParams ? JSON.parse(storedParams) : SEED_PARAMETRES;

  const allImmos = storedAllImmos ? JSON.parse(storedAllImmos) : SEED_IMMOBILISATIONS;
  // Filtrer uniquement les immobilisations du client actif
  appState.immobilisations = allImmos.filter(i => (i.client_id || 1) == appState.clientActifId);

  appState.historiqueClotures = storedHisto ? JSON.parse(storedHisto) : [];

  const annees = new Set([2024, EXERCICE_COURANT]);
  appState.historiqueClotures.forEach(h => annees.add(h.exercice));
  appState.exercicesDisponibles = Array.from(annees).sort((a, b) => b - a);

  // Calculer la situation pour chaque immo en local
  appState.immobilisations.forEach(immo => {
    immo.situation_2024 = calculerSituation2024(immo);
    const cat = appState.categories.find(c => c.id == immo.categorie_id);
    if (cat) {
      immo.cat_code = cat.code;
      immo.cat_libelle = cat.libelle;
      immo.compte_immo = cat.compte_immo;
    }
  });

  sauvegarderLocalement();
}

function sauvegarderLocalement() {
  if (!isBackendOnline) {
    localStorage.setItem("sagi_clients", JSON.stringify(appState.clients));
    localStorage.setItem("sagi_categories", JSON.stringify(appState.categories));
    localStorage.setItem("sagi_services", JSON.stringify(appState.services));
    localStorage.setItem("sagi_parametres", JSON.stringify(appState.parametres));
    localStorage.setItem("sagi_client_actif_id", String(appState.clientActifId));

    // Conserver la liste globale de toutes les immos de tous les clients
    let allImmos = [];
    const stored = localStorage.getItem("sagi_all_immobilisations");
    if (stored) {
      try { allImmos = JSON.parse(stored); } catch (e) { }
    } else {
      allImmos = [...SEED_IMMOBILISATIONS];
    }

    // Remplacer les immos du client actif
    allImmos = allImmos.filter(i => (i.client_id || 1) != appState.clientActifId);
    allImmos.push(...appState.immobilisations);

    localStorage.setItem("sagi_all_immobilisations", JSON.stringify(allImmos));
    localStorage.setItem("sagi_historique_clotures", JSON.stringify(appState.historiqueClotures));
    localStorage.setItem("sagi_exercice_courant", String(EXERCICE_COURANT));
  }
}

// ==================== MOTEUR DE CALCUL CLIENT ====================
function parseDateStr(str) {
  if (!str) return null;
  return new Date(str.substring(0, 10));
}

function calculJoursProrata360(dateStr, anneeCible) {
  const d = parseDateStr(dateStr);
  if (!d || d.getFullYear() > anneeCible) return 0;
  if (d.getFullYear() < anneeCible) return 360;

  const mois = d.getMonth() + 1;
  const jour = Math.min(d.getDate(), 30);
  const joursPremierMois = (30 - jour + 1);
  const moisRestants = 12 - mois;
  return Math.min(Math.max(joursPremierMois + (moisRestants * 30), 1), 360);
}

function calculerSituation2024(immo) {
  const vb = parseFloat(immo.valeur_brute) || 0;
  const cumulAnt = parseFloat(immo.cumul_amort_anterieur) || 0;
  const duree = parseInt(immo.duree_annees) || 5;
  const taux = parseFloat(immo.taux_amortissement) || (100 / duree);
  const dtMs = parseDateStr(immo.date_mise_en_service);
  const anneeMs = dtMs ? dtMs.getFullYear() : EXERCICE_COURANT;

  const statut = immo.statut || 'EN_SERVICE';
  const dtSortie = parseDateStr(immo.date_sortie);
  const anneeSortie = dtSortie ? dtSortie.getFullYear() : null;

  const estAcq = (anneeMs === EXERCICE_COURANT);
  const estSortie = ((statut === 'CEDE' || statut === 'REBUT') && anneeSortie === EXERCICE_COURANT);
  const estSortieAnt = ((statut === 'CEDE' || statut === 'REBUT') && anneeSortie && anneeSortie < EXERCICE_COURANT);

  if (estSortieAnt) {
    return { valeur_debut: 0, acquisition: 0, cession: 0, valeur_fin: 0, amort_debut: 0, dotation: 0, amort_sorties: 0, amort_fin: 0, vnc_fin: 0 };
  }

  const valeur_debut = estAcq ? 0 : vb;
  const acquisition = estAcq ? vb : 0;
  const cession = estSortie ? vb : 0;
  const valeur_fin = estSortie ? 0 : vb;

  const amort_debut = cumulAnt;
  let dotation = 0;

  const catImmo = (appState.categories || []).find(c => c.id == immo.categorie_id);
  const nonAmortissable = String(immo.a_amortir || (catImmo && catImmo.a_amortir) || 'O').toUpperCase() === 'N';
  if (anneeMs > EXERCICE_COURANT || amort_debut >= vb || nonAmortissable) {
    dotation = 0;
  } else {
    if (estAcq) {
      const jours = calculJoursProrata360(immo.date_mise_en_service, EXERCICE_COURANT);
      dotation = Math.round(vb * (taux / 100) * (jours / 360));
    } else if (estSortie) {
      const jours = calculJoursProrata360(immo.date_sortie, EXERCICE_COURANT);
      dotation = Math.round(vb * (taux / 100) * (jours / 360));
    } else {
      dotation = Math.round(vb * (taux / 100));
    }

    if (amort_debut + dotation > vb) {
      dotation = Math.round(vb - amort_debut);
    }
  }

  const amort_sorties = estSortie ? (amort_debut + dotation) : 0;
  const amort_fin = estSortie ? 0 : Math.round(amort_debut + dotation);
  const vnc_fin = estSortie ? 0 : Math.max(valeur_fin - amort_fin, 0);

  return { valeur_debut, acquisition, cession, valeur_fin, amort_debut, dotation, amort_sorties, amort_fin, vnc_fin };
}

function genererPlanClient(vb, dateMs, duree, taux) {
  const d = parseDateStr(dateMs);
  if (!d || vb <= 0 || duree <= 0) return [];
  const anneeDebut = d.getFullYear();
  const tauxAnnuel = taux || (100 / duree);
  const jours1 = calculJoursProrata360(dateMs, anneeDebut);
  const aProrata = jours1 < 360;
  const nbExercices = duree + (aProrata ? 1 : 0);

  const plan = [];
  let cumul = 0;

  for (let i = 0; i < nbExercices; i++) {
    const annee = anneeDebut + i;
    if (cumul >= vb) break;

    let dotation = 0;
    if (i === 0 && aProrata) {
      dotation = Math.round(vb * (tauxAnnuel / 100) * (jours1 / 360));
    } else if (i === nbExercices - 1 && aProrata) {
      dotation = Math.round(vb - cumul);
    } else {
      dotation = Math.round(vb * (tauxAnnuel / 100));
    }

    if (cumul + dotation > vb || i === nbExercices - 1) {
      dotation = Math.round(vb - cumul);
    }

    cumul += dotation;
    const vnc = Math.max(vb - cumul, 0);

    plan.push({
      annee,
      base_amortissable: vb,
      taux: tauxAnnuel,
      dotation,
      cumul_amort: cumul,
      vnc_fin: vnc
    });
  }

  return plan;
}

// ==================== RENDU DE L'INTERFACE ====================
function formatFCFA(montant) {
  if (montant === undefined || montant === null || isNaN(montant)) return `0 ${DEVISE}`;
  return Math.round(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + ` ${DEVISE}`;
}

function mettreAJourInterface() {
  appliquerDroitsUI();
  actualiserBrandingClient();
  actualiserSelecteurExercices();
  rendreDashboard();
  rendreRegistre();
  rendreTableauFiscal();
  rendreCloture();
  actualiserCompteursTables();
  rendreContenuTableActive();
  remplirSelecteursFormulaire();
}

// Compteurs de lignes affichés sur les cartes de l'onglet « Tables »
function actualiserCompteursTables() {
  const compte = {
    categories: (appState.categories || []).length,
    services: (appState.services || []).length,
    clients: (appState.clients || []).length,
    immobilisations: (appState.immobilisations || []).length,
    exercices_historique: (appState.historiqueClotures || []).length,
    parametres: (appState.parametres || []).length
  };
  Object.keys(compte).forEach(t => {
    const el = document.getElementById("count-table-" + t);
    if (el) el.innerText = compte[t] + (compte[t] > 1 ? " lignes" : " ligne");
  });
}

function actualiserBrandingClient() {
  const cl = appState.clientActif || { nom: 'SAGI S.A.', code: 'SAGI', devise: 'FCFA' };
  DEVISE = cl.devise || "FCFA";

  const elNomCourt = document.getElementById("header-nom-court");
  if (elNomCourt) elNomCourt.innerText = cl.code || "SAGI";

  const elNomClient = document.getElementById("header-nom-client");
  if (elNomClient) elNomClient.innerText = cl.nom || "SAGI S.A.";

  const elAvatar = document.getElementById("header-avatar-client");
  if (elAvatar) elAvatar.innerText = (cl.code ? cl.code[0] : (cl.nom ? cl.nom[0] : "S")).toUpperCase();

  const elLogo = document.getElementById("header-logo-icon");
  if (elLogo) elLogo.innerText = (cl.code ? cl.code[0] : "S").toUpperCase();

  const elModalActuel = document.getElementById("modal-client-actuel-txt");
  if (elModalActuel) elModalActuel.innerText = `${cl.nom} (${cl.code})`;

  // Titre du tableau de bord
  const elDashTitre = document.querySelector("#view-dashboard h1");
  if (elDashTitre) {
    elDashTitre.innerText = `Synthèse des Actifs ${cl.nom} – Exercice ${EXERCICE_COURANT}`;
  }

  // Titres d'impression
  const elPrintFiscal = document.querySelector("#view-fiscal .print-only h2");
  if (elPrintFiscal) elPrintFiscal.innerText = cl.nom;
  const elPrintReg = document.querySelector("#view-registre .print-only h2");
  if (elPrintReg) elPrintReg.innerText = cl.nom;
}

// 1. Dashboard
function rendreDashboard() {
  let totalBrute = 0;
  let totalDotation = 0;
  let totalCumul = 0;
  let totalVNC = 0;
  let totalAcquisitions = 0;
  let totalCessions = 0;
  let nbAcq = 0;
  let nbSorties = 0;

  const categoriesTotal = {};

  appState.immobilisations.forEach(immo => {
    const calc = immo.situation_2024 || calculerSituation2024(immo);
    if (immo.statut === 'EN_SERVICE') {
      totalBrute += parseFloat(immo.valeur_brute);
      totalCumul += calc.amort_fin;
      totalVNC += calc.vnc_fin;

      const catLib = immo.cat_libelle || "Autre";
      categoriesTotal[catLib] = (categoriesTotal[catLib] || 0) + parseFloat(immo.valeur_brute);
    }

    totalDotation += calc.dotation;
    totalAcquisitions += calc.acquisition;
    totalCessions += calc.cession;

    if (calc.acquisition > 0) nbAcq++;
    if (calc.cession > 0) nbSorties++;
  });

  // KPIs DOM
  document.getElementById("kpi-valeur-brute").innerText = formatFCFA(totalBrute);
  document.getElementById("kpi-dotation-2024").innerText = formatFCFA(totalDotation);
  document.getElementById("kpi-cumul-amort").innerText = formatFCFA(totalCumul);
  document.getElementById("kpi-vnc-totale").innerText = formatFCFA(totalVNC);
  document.getElementById("kpi-acquisitions-2024").innerText = formatFCFA(totalAcquisitions);
  document.getElementById("kpi-cessions-2024").innerText = formatFCFA(totalCessions);
  document.getElementById("kpi-nb-acq-2024").innerText = `${nbAcq} biens`;
  document.getElementById("kpi-nb-sorties-2024").innerText = `${nbSorties} biens`;

  // Tableau récents
  const recentsBody = document.getElementById("table-dashboard-recents");
  recentsBody.innerHTML = "";
  const trisRecents = [...appState.immobilisations].sort((a, b) => new Date(b.date_acquisition) - new Date(a.date_acquisition)).slice(0, 5);

  trisRecents.forEach(item => {
    const calc = item.situation_2024 || calculerSituation2024(item);
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-2.5 px-3 font-bold text-slate-800">${item.code_inventaire}</td>
      <td class="py-2.5 px-3">${item.designation}</td>
      <td class="py-2.5 px-3 text-slate-500">${item.date_mise_en_service}</td>
      <td class="py-2.5 px-3 text-right font-bold text-slate-900">${formatFCFA(item.valeur_brute)}</td>
      <td class="py-2.5 px-3 text-right font-bold text-indigo-600">${formatFCFA(calc.dotation)}</td>
      <td class="py-2.5 px-3 text-center">${getBadgeStatut(item.statut)}</td>
    `;
    recentsBody.appendChild(tr);
  });

  // Graphique Doughnut
  actualiserGraphiqueCategories(categoriesTotal);
}

function actualiserGraphiqueCategories(dataMap) {
  const ctx = document.getElementById("chart-categories");
  if (!ctx || typeof Chart === "undefined") return;   // graphique indisponible (bibliothèque non chargée) : on n'empêche pas le reste

  const labels = Object.keys(dataMap);
  const data = Object.values(dataMap);

  if (chartCategories) {
    chartCategories.destroy();
  }

  chartCategories = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#2563eb', '#4f46e5', '#7c3aed', '#059669',
          '#d97706', '#dc2626', '#0891b2', '#475569'
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const val = context.raw || 0;
              return `${context.label}: ${formatFCFA(val)}`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

// 2. Registre des immobilisations
function rendreRegistre() {
  const tbody = document.getElementById("table-registre-body");
  tbody.innerHTML = "";

  const q = (document.getElementById("filtre-recherche").value || "").toLowerCase();
  const catFilter = document.getElementById("filtre-categorie").value;
  const statutFilter = document.getElementById("filtre-statut").value;

  let totalBrute = 0;
  let totalDotation = 0;
  let totalVNC = 0;
  let count = 0;

  appState.immobilisations.forEach(immo => {
    // Filtres
    if (catFilter && immo.categorie_id != catFilter) return;
    if (statutFilter && immo.statut !== statutFilter) return;
    if (q) {
      const match = (
        (immo.code_inventaire && immo.code_inventaire.toLowerCase().includes(q)) ||
        (immo.designation && immo.designation.toLowerCase().includes(q)) ||
        (immo.fournisseur && immo.fournisseur.toLowerCase().includes(q)) ||
        (immo.num_facture && immo.num_facture.toLowerCase().includes(q))
      );
      if (!match) return;
    }

    const calc = immo.situation_2024 || calculerSituation2024(immo);
    count++;

    if (immo.statut === 'EN_SERVICE') {
      totalBrute += parseFloat(immo.valeur_brute);
      totalVNC += calc.vnc_fin;
    }
    totalDotation += calc.dotation;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
    tr.innerHTML = `
      <td class="py-3 px-3 font-bold text-blue-700">${immo.code_inventaire}</td>
      <td class="py-3 px-3">
        <div class="font-bold text-slate-800">${immo.designation}</div>
        <div class="text-[10px] text-slate-400">${immo.emplacement || ''} ${immo.num_facture ? '• Fac: ' + immo.num_facture : ''}</div>
      </td>
      <td class="py-3 px-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border">
          ${immo.compte_immo || ''} - ${immo.cat_code || ''}
        </span>
      </td>
      <td class="py-3 px-3 text-slate-600">${immo.date_mise_en_service}</td>
      <td class="py-3 px-3 text-right font-bold text-slate-900">${formatFCFA(immo.valeur_brute)}</td>
      <td class="py-3 px-3 text-center">
        <span class="font-bold text-slate-700">${immo.duree_annees} ans</span>
        <span class="text-[10px] text-slate-400 block">(${immo.taux_amortissement}%)</span>
      </td>
      <td class="py-3 px-3 text-right font-bold text-indigo-700">${formatFCFA(calc.dotation)}</td>
      <td class="py-3 px-3 text-right text-amber-700 font-semibold">${formatFCFA(calc.amort_fin)}</td>
      <td class="py-3 px-3 text-right font-black text-emerald-700">${formatFCFA(calc.vnc_fin)}</td>
      <td class="py-3 px-3 text-center">${getBadgeStatut(immo.statut)}</td>
      <td class="py-3 px-3 text-center no-print">
        <div class="flex items-center justify-center space-x-1">
          <button onclick="afficherPlanImmo(${immo.id})" title="Voir le plan d'amortissement" class="w-7 h-7 rounded hover:bg-slate-200 text-slate-600 transition flex items-center justify-center">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button onclick="editerImmo(${immo.id})" title="Modifier" class="w-7 h-7 rounded hover:bg-blue-100 text-blue-600 transition flex items-center justify-center">
            <i class="fa-solid fa-pen"></i>
          </button>
          ${immo.statut === 'EN_SERVICE' ? `
          <button onclick="ouvrirSortie(${immo.id})" title="Sortir / Céder le bien" class="w-7 h-7 rounded hover:bg-rose-100 text-rose-600 transition flex items-center justify-center">
            <i class="fa-solid fa-right-from-bracket"></i>
          </button>` : ''}
          <button onclick="supprimerImmo(${immo.id})" title="Supprimer" class="w-7 h-7 rounded hover:bg-red-100 text-red-600 transition flex items-center justify-center">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Totaux du bas
  document.getElementById("registre-count").innerText = count;
  document.getElementById("registre-total-brute").innerText = formatFCFA(totalBrute);
  document.getElementById("registre-total-dotation").innerText = formatFCFA(totalDotation);
  document.getElementById("registre-total-vnc").innerText = formatFCFA(totalVNC);
}

function getBadgeStatut(statut) {
  if (statut === 'CEDE') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold badge-cede">Cédé</span>`;
  } else if (statut === 'REBUT') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold badge-rebut">Rebut</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold badge-service">En Service</span>`;
}

// 3. Tableau Fiscal 2024
function rendreTableauFiscal() {
  const tbody = document.getElementById("table-fiscal-body");
  const tfoot = document.getElementById("table-fiscal-foot");
  tbody.innerHTML = "";
  tfoot.innerHTML = "";

  const groupes = {};

  appState.categories.forEach(cat => {
    groupes[cat.id] = {
      code: cat.code,
      libelle: cat.libelle,
      compte_immo: cat.compte_immo,
      compte_amort: cat.compte_amort,
      valeur_debut: 0,
      acquisitions: 0,
      cessions: 0,
      valeur_fin: 0,
      amort_debut: 0,
      dotations: 0,
      amort_sorties: 0,
      amort_fin: 0,
      vnc_fin: 0
    };
  });

  appState.immobilisations.forEach(immo => {
    const grp = groupes[immo.categorie_id];
    if (!grp) return;
    const calc = immo.situation_2024 || calculerSituation2024(immo);

    grp.valeur_debut += calc.valeur_debut;
    grp.acquisitions += calc.acquisition;
    grp.cessions += calc.cession;
    grp.valeur_fin += calc.valeur_fin;
    grp.amort_debut += calc.amort_debut;
    grp.dotations += calc.dotation;
    grp.amort_sorties += calc.amort_sorties;
    grp.amort_fin += calc.amort_fin;
    grp.vnc_fin += calc.vnc_fin;
  });

  let tot = { vd: 0, acq: 0, ces: 0, vf: 0, ad: 0, dot: 0, aso: 0, af: 0, vnc: 0 };

  Object.values(groupes).forEach(g => {
    tot.vd += g.valeur_debut;
    tot.acq += g.acquisitions;
    tot.ces += g.cessions;
    tot.vf += g.valeur_fin;
    tot.ad += g.amort_debut;
    tot.dot += g.dotations;
    tot.aso += g.amort_sorties;
    tot.af += g.amort_fin;
    tot.vnc += g.vnc_fin;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 border-b";
    tr.innerHTML = `
      <td class="py-2 px-2 font-bold text-slate-800 border-r">
        <span class="text-blue-700">${g.compte_immo}</span> - ${g.libelle}
      </td>
      <td class="py-2 px-2 text-right border-r">${formatNumber(g.valeur_debut)}</td>
      <td class="py-2 px-2 text-right border-r text-blue-700 font-semibold">${formatNumber(g.acquisitions)}</td>
      <td class="py-2 px-2 text-right border-r text-rose-700 font-semibold">${formatNumber(g.cessions)}</td>
      <td class="py-2 px-2 text-right border-r font-bold bg-slate-50">${formatNumber(g.valeur_fin)}</td>
      <td class="py-2 px-2 text-right border-r">${formatNumber(g.amort_debut)}</td>
      <td class="py-2 px-2 text-right border-r text-indigo-700 font-bold">${formatNumber(g.dotations)}</td>
      <td class="py-2 px-2 text-right border-r text-rose-700 font-semibold">${formatNumber(g.amort_sorties)}</td>
      <td class="py-2 px-2 text-right border-r font-bold bg-indigo-50/50">${formatNumber(g.amort_fin)}</td>
      <td class="py-2 px-2 text-right font-black bg-emerald-50 text-emerald-800">${formatNumber(g.vnc_fin)}</td>
    `;
    tbody.appendChild(tr);
  });

  tfoot.innerHTML = `
    <tr>
      <td class="py-3 px-2 border-r text-slate-900 uppercase">TOTAUX GÉNÉRAUX (${DEVISE})</td>
      <td class="py-3 px-2 text-right border-r">${formatNumber(tot.vd)}</td>
      <td class="py-3 px-2 text-right border-r text-blue-700">${formatNumber(tot.acq)}</td>
      <td class="py-3 px-2 text-right border-r text-rose-700">${formatNumber(tot.ces)}</td>
      <td class="py-3 px-2 text-right border-r bg-slate-200 text-slate-900">${formatNumber(tot.vf)}</td>
      <td class="py-3 px-2 text-right border-r">${formatNumber(tot.ad)}</td>
      <td class="py-3 px-2 text-right border-r text-indigo-800">${formatNumber(tot.dot)}</td>
      <td class="py-3 px-2 text-right border-r text-rose-700">${formatNumber(tot.aso)}</td>
      <td class="py-3 px-2 text-right border-r bg-indigo-100 text-indigo-900">${formatNumber(tot.af)}</td>
      <td class="py-3 px-2 text-right bg-emerald-100 text-emerald-900 font-black text-xs">${formatNumber(tot.vnc)}</td>
    </tr>
  `;
}

function formatNumber(n) {
  if (!n) return "-";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// 4. Simulateur
function lancerSimulation() {
  const vb = parseFloat(document.getElementById("sim-valeur").value) || 0;
  const dt = document.getElementById("sim-date").value;
  const duree = parseInt(document.getElementById("sim-duree").value) || 5;
  const mode = document.getElementById("sim-mode").value;

  const plan = genererPlanClient(vb, dt, duree);
  const tbody = document.getElementById("table-simulation-body");
  tbody.innerHTML = "";

  plan.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-2 px-3 font-bold text-slate-800">${row.annee}</td>
      <td class="py-2 px-3 text-right">${formatFCFA(row.base_amortissable)}</td>
      <td class="py-2 px-3 text-center text-slate-600 font-semibold">${row.taux.toFixed(2)} %</td>
      <td class="py-2 px-3 text-right font-bold text-indigo-700">${formatFCFA(row.dotation)}</td>
      <td class="py-2 px-3 text-right text-amber-700">${formatFCFA(row.cumul_amort)}</td>
      <td class="py-2 px-3 text-right font-black text-emerald-700">${formatFCFA(row.vnc_fin)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==================== GESTION DES ONGLETS & ACTIONS ====================
function changerOnglet(nom) {
  window.ONGLET_ACTIF = nom;
  ["navigation", "dashboard", "registre", "fiscal", "extrait", "simulateur", "cloture", "tables", "import-export", "utilisateurs"].forEach(tab => {
    const vue = document.getElementById(`view-${tab}`);
    const btn = document.getElementById(`tab-${tab}`);
    if (!vue || !btn) return;
    if (tab === nom) {
      vue.classList.remove("hidden");
      btn.className = "tab-btn px-4 py-2.5 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 flex items-center space-x-2";
    } else {
      vue.classList.add("hidden");
      btn.className = "tab-btn px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800 border-b-2 border-transparent flex items-center space-x-2";
    }
  });

  if (nom === "registre") appliquerFiltres();
  if (nom === "fiscal") rendreTableauFiscal();
  if (nom === "extrait") rendreExtraitCompte();
  if (nom === "cloture") rendreCloture();
  if (nom === "tables") rendreExplorateurTables();
  if (nom === "navigation") chargerNavigation();
  if (nom === "utilisateurs") chargerUtilisateurs();
}

// Actualisation du sélecteur d'exercice dans la barre supérieure
function actualiserSelecteurExercices() {
  const sel = document.getElementById("select-exercice");
  if (!sel) return;
  sel.innerHTML = "";

  const options = appState.exercicesDisponibles || [EXERCICE_COURANT];
  options.forEach(annee => {
    const opt = document.createElement("option");
    opt.value = annee;
    opt.innerText = annee;
    if (annee === EXERCICE_COURANT) opt.selected = true;
    sel.appendChild(opt);
  });
}

// Changement d'exercice actif par l'utilisateur
async function changerExerciceActif(nouvelleAnnee) {
  EXERCICE_COURANT = parseInt(nouvelleAnnee);
  if (isBackendOnline) {
    try {
      const immos = await apiFetch(`${API_BASE}/api/immobilisations?client_id=${appState.clientActifId}&exercice=${EXERCICE_COURANT}`).then(r => r.json());
      appState.immobilisations = immos;
    } catch (e) {
      console.warn("Erreur rechargement immos pour exercice", e);
    }
  } else {
    appState.immobilisations.forEach(immo => {
      immo.situation_2024 = calculerSituation2024(immo);
    });
    sauvegarderLocalement();
  }

  mettreAJourInterface();
  afficherToast(`Exercice actif : ${EXERCICE_COURANT}`, "info");
}

// Rendu de la vue Clôture d'Exercice & N+1
function rendreCloture() {
  const anneeActuelle = EXERCICE_COURANT;
  const anneeSuivante = anneeActuelle + 1;

  const elActuelle = document.getElementById("cloture-annee-actuelle");
  if (elActuelle) elActuelle.innerText = anneeActuelle;
  const elSuivante = document.getElementById("cloture-annee-suivante");
  if (elSuivante) elSuivante.innerText = anneeSuivante;
  const elBtnAnnee = document.getElementById("btn-txt-annee");
  if (elBtnAnnee) elBtnAnnee.innerText = anneeActuelle;
  const elBtnSuiv = document.getElementById("btn-txt-suivante");
  if (elBtnSuiv) elBtnSuiv.innerText = anneeSuivante;
  const elTxtNouvel = document.getElementById("txt-nouvel-ex");
  if (elTxtNouvel) elTxtNouvel.innerText = anneeSuivante;

  let totalDotation = 0;
  let nbActifs = 0;
  let nbSorties = 0;
  let totalVNC = 0;

  appState.immobilisations.forEach(immo => {
    const calc = immo.situation_2024 || calculerSituation2024(immo);
    totalDotation += calc.dotation;
    if (immo.statut === 'EN_SERVICE') {
      nbActifs++;
      totalVNC += calc.vnc_fin;
    } else if (immo.statut === 'CEDE' || immo.statut === 'REBUT') {
      nbSorties++;
    }
  });

  const elDotTotal = document.getElementById("cloture-dotation-total");
  if (elDotTotal) elDotTotal.innerText = formatFCFA(totalDotation);
  const elActifs = document.getElementById("cloture-biens-actifs");
  if (elActifs) elActifs.innerText = `${nbActifs} biens`;
  const elSorties = document.getElementById("cloture-biens-sorties");
  if (elSorties) elSorties.innerText = `${nbSorties} biens`;
  const elVncRep = document.getElementById("cloture-vnc-reportee");
  if (elVncRep) elVncRep.innerText = formatFCFA(totalVNC);

  // Rendu de la table d'historique
  const tbody = document.getElementById("table-historique-clotures");
  if (!tbody) return;
  tbody.innerHTML = "";

  const histo = appState.historiqueClotures || [];
  if (histo.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-400 italic">Aucun exercice n'a encore été clôturé. L'exercice initial en cours est ${anneeActuelle}.</td></tr>`;
    return;
  }

  histo.forEach(h => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-2.5 px-3 font-bold text-indigo-700">${h.exercice}</td>
      <td class="py-2.5 px-3 text-slate-500">${h.date_cloture}</td>
      <td class="py-2.5 px-3 text-right font-bold text-slate-800">${formatFCFA(h.total_dotations)}</td>
      <td class="py-2.5 px-3 text-right font-bold text-emerald-700">${formatFCFA(h.total_vnc)}</td>
      <td class="py-2.5 px-3 text-center">${h.nb_biens} biens</td>
      <td class="py-2.5 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border">Clôturé & Figé</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function ouvrirConfirmationCloture() {
  document.getElementById("modal-conf-annee").innerText = EXERCICE_COURANT;
  document.getElementById("modal-conf-suivante").innerText = EXERCICE_COURANT + 1;
  document.getElementById("modal-btn-annee").innerText = EXERCICE_COURANT + 1;
  document.getElementById("modal-cloture").classList.remove("hidden");
}

function fermerConfirmationCloture() {
  document.getElementById("modal-cloture").classList.add("hidden");
}

async function executerClotureExercice() {
  fermerConfirmationCloture();
  const anneeACloturer = EXERCICE_COURANT;
  const nouvelleAnnee = anneeACloturer + 1;

  if (isBackendOnline) {
    try {
      const res = await apiFetch(`${API_BASE}/api/cloture-exercice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee_cloture: anneeACloturer, client_id: appState.clientActifId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur de clôture");

      EXERCICE_COURANT = nouvelleAnnee;
      await chargerDonnees();
      changerOnglet("dashboard");
      afficherToast(data.message || `Exercice ${anneeACloturer} clôturé avec succès !`, "success");
      return;
    } catch (e) {
      alert("Erreur lors de la clôture sur le serveur : " + e.message);
      return;
    }
  }

  // Traitement en mode local (hors ligne)
  let totalDot = 0;
  let totalVNC = 0;
  let totalVB = 0;

  appState.immobilisations.forEach(immo => {
    const calc = calculerSituation2024(immo);
    immo.cumul_amort_anterieur = Math.round(immo.cumul_amort_anterieur + calc.dotation);

    if (immo.statut === 'EN_SERVICE') {
      totalVB += parseFloat(immo.valeur_brute);
      totalVNC += calc.vnc_fin;
    } else if (immo.statut === 'CEDE' || immo.statut === 'REBUT') {
      immo.statut = 'ARCHIVE';
    }

    totalDot += calc.dotation;
  });

  const nowStr = new Date().toLocaleString("fr-FR");
  appState.historiqueClotures.unshift({
    exercice: anneeACloturer,
    date_cloture: nowStr,
    total_valeur_brute: totalVB,
    total_dotations: totalDot,
    total_vnc: totalVNC,
    nb_biens: appState.immobilisations.length
  });

  if (!appState.exercicesDisponibles.includes(nouvelleAnnee)) {
    appState.exercicesDisponibles.unshift(nouvelleAnnee);
  }

  EXERCICE_COURANT = nouvelleAnnee;
  sauvegarderLocalement();
  mettreAJourInterface();
  changerOnglet("dashboard");
  afficherToast(`Exercice ${anneeACloturer} clôturé ! Bienvenue dans l'exercice ${nouvelleAnnee}.`, "success");
}

function appliquerFiltres() {
  rendreRegistre();
}

async function rechargerDonnees() {
  await testerConnexionAPI();
  await chargerDonnees();
  afficherToast("Données réactualisées avec succès", "success");
}

// ==================== MODALS & FORMULAIRES ====================
function remplirSelecteursFormulaire() {
  const selCat = document.getElementById("immo-categorie");
  const selFiltreCat = document.getElementById("filtre-categorie");
  const selSrv = document.getElementById("immo-service");
  const selClient = document.getElementById("immo-client");

  if (selClient) {
    selClient.innerHTML = "";
    appState.clients.forEach(cl => {
      const opt = document.createElement("option");
      opt.value = cl.id;
      opt.innerText = `${cl.nom} (${cl.code})`;
      if (cl.id == appState.clientActifId) opt.selected = true;
      selClient.appendChild(opt);
    });
  }

  selCat.innerHTML = `<option value="">Sélectionner une catégorie...</option>`;
  selFiltreCat.innerHTML = `<option value="">Toutes les catégories</option>`;

  appState.categories.forEach(c => {
    selCat.innerHTML += `<option value="${c.id}" data-duree="${c.duree_defaut}" data-taux="${c.taux_defaut}">${c.code} - ${c.libelle} (${c.duree_defaut} ans)</option>`;
    selFiltreCat.innerHTML += `<option value="${c.id}">${c.code} - ${c.libelle}</option>`;
  });

  selSrv.innerHTML = `<option value="">Non affecté</option>`;
  appState.services.forEach(s => {
    selSrv.innerHTML += `<option value="${s.id}">${s.nom} (${s.code})</option>`;
  });
}

function ouvrirModalAjout() {
  document.getElementById("form-immo").reset();
  document.getElementById("immo-id").value = "";

  const clientNom = appState.clientActif ? appState.clientActif.nom : "SAGI";
  document.getElementById("modal-immo-titre").innerHTML = `<i class="fa-solid fa-box mr-2 text-blue-400"></i> Nouvelle Immobilisation - ${clientNom}`;

  const selClient = document.getElementById("immo-client");
  if (selClient) selClient.value = appState.clientActifId;

  // Suggestion d'un code inventaire
  const annee = new Date().getFullYear();
  const num = (appState.immobilisations.length + 1).toString().padStart(3, '0');
  document.getElementById("immo-code").value = `IMM-${annee}-${num}`;

  const today = new Date().toISOString().substring(0, 10);
  document.getElementById("immo-date-acq").value = today;
  document.getElementById("immo-date-ms").value = today;

  document.getElementById("modal-immo").classList.remove("hidden");
}

function fermerModalImmo() {
  document.getElementById("modal-immo").classList.add("hidden");
}

function autoRemplirDateService() {
  const acq = document.getElementById("immo-date-acq").value;
  const ms = document.getElementById("immo-date-ms");
  if (!ms.value) ms.value = acq;
}

function ajusterCategorieDefauts() {
  const sel = document.getElementById("immo-categorie");
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.duree) {
    document.getElementById("immo-duree").value = opt.dataset.duree;
    document.getElementById("immo-taux").value = opt.dataset.taux;
  }
}

function calculerTauxAuto() {
  const duree = parseInt(document.getElementById("immo-duree").value) || 0;
  if (duree > 0) {
    document.getElementById("immo-taux").value = (100 / duree).toFixed(2);
  }
}

function editerImmo(id) {
  const immo = appState.immobilisations.find(i => i.id == id);
  if (!immo) return;

  document.getElementById("immo-id").value = immo.id;
  const elImmoCl = document.getElementById("immo-client");
  if (elImmoCl) elImmoCl.value = immo.client_id || appState.clientActifId;
  document.getElementById("immo-code").value = immo.code_inventaire;
  document.getElementById("immo-categorie").value = immo.categorie_id;
  document.getElementById("immo-service").value = immo.service_id || "";
  document.getElementById("immo-designation").value = immo.designation;
  document.getElementById("immo-date-acq").value = immo.date_acquisition;
  document.getElementById("immo-date-ms").value = immo.date_mise_en_service;
  document.getElementById("immo-valeur").value = immo.valeur_brute;
  document.getElementById("immo-duree").value = immo.duree_annees;
  document.getElementById("immo-taux").value = immo.taux_amortissement;
  document.getElementById("immo-cumul-ant").value = immo.cumul_amort_anterieur || 0;
  document.getElementById("immo-fournisseur").value = immo.fournisseur || "";
  document.getElementById("immo-facture").value = immo.num_facture || "";
  document.getElementById("immo-emplacement").value = immo.emplacement || "";

  document.getElementById("modal-immo-titre").innerHTML = `<i class="fa-solid fa-pen-to-square mr-2 text-indigo-400"></i> Modifier ${immo.code_inventaire}`;
  document.getElementById("modal-immo").classList.remove("hidden");
}

async function soumettreFormulaireImmo(e) {
  e.preventDefault();
  const id = document.getElementById("immo-id").value;
  const clientId = parseInt(document.getElementById("immo-client").value) || appState.clientActifId;
  const immoData = {
    client_id: clientId,
    exercice: EXERCICE_COURANT,
    code_inventaire: document.getElementById("immo-code").value.trim(),
    designation: document.getElementById("immo-designation").value.trim(),
    categorie_id: parseInt(document.getElementById("immo-categorie").value),
    service_id: document.getElementById("immo-service").value ? parseInt(document.getElementById("immo-service").value) : null,
    date_acquisition: document.getElementById("immo-date-acq").value,
    date_mise_en_service: document.getElementById("immo-date-ms").value,
    valeur_brute: parseFloat(document.getElementById("immo-valeur").value),
    duree_annees: parseInt(document.getElementById("immo-duree").value),
    taux_amortissement: parseFloat(document.getElementById("immo-taux").value),
    cumul_amort_anterieur: parseFloat(document.getElementById("immo-cumul-ant").value) || 0,
    fournisseur: document.getElementById("immo-fournisseur").value.trim(),
    num_facture: document.getElementById("immo-facture").value.trim(),
    emplacement: document.getElementById("immo-emplacement").value.trim(),
    statut: 'EN_SERVICE'
  };

  if (isBackendOnline) {
    try {
      const url = id ? `${API_BASE}/api/immobilisations/${id}` : `${API_BASE}/api/immobilisations`;
      const methode = id ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(immoData)
      });
      await verifierReponse(res);
    } catch (err) {
      alert("Erreur de communication avec le serveur API : " + err.message);
      return;
    }
  } else {
    // Mode local
    if (id) {
      const idx = appState.immobilisations.findIndex(i => i.id == id);
      if (idx !== -1) {
        appState.immobilisations[idx] = { ...appState.immobilisations[idx], ...immoData };
      }
    } else {
      immoData.id = Date.now();
      appState.immobilisations.push(immoData);
    }
    sauvegarderLocalement();
  }

  fermerModalImmo();
  await chargerDonnees();
  afficherToast(id ? "Immobilisation mise à jour" : "Bien ajouté avec succès", "success");
}

async function supprimerImmo(id) {
  if (!confirm("Voulez-vous vraiment supprimer définitivement cette immobilisation ?")) return;

  if (isBackendOnline) {
    try {
      await verifierReponse(await apiFetch(`${API_BASE}/api/immobilisations/${id}`, { method: 'DELETE' }));
    } catch (e) {
      alert("Suppression impossible : " + e.message);
      return;
    }
  } else {
    appState.immobilisations = appState.immobilisations.filter(i => i.id != id);
    sauvegarderLocalement();
  }

  await chargerDonnees();
  afficherToast("Immobilisation supprimée", "info");
}

// Sortie / Cession
function ouvrirSortie(id) {
  const immo = appState.immobilisations.find(i => i.id == id);
  if (!immo) return;
  document.getElementById("sortie-immo-id").value = immo.id;
  document.getElementById("sortie-designation").innerText = `${immo.code_inventaire} - ${immo.designation}`;
  document.getElementById("modal-sortie").classList.remove("hidden");
}

function fermerModalSortie() {
  document.getElementById("modal-sortie").classList.add("hidden");
}

async function soumettreSortieImmo(e) {
  e.preventDefault();
  const id = document.getElementById("sortie-immo-id").value;
  const sortieData = {
    statut: document.getElementById("sortie-statut").value,
    date_sortie: document.getElementById("sortie-date").value,
    prix_cession: parseFloat(document.getElementById("sortie-prix").value) || 0,
    motif_sortie: document.getElementById("sortie-motif").value.trim()
  };

  if (isBackendOnline) {
    try {
      await verifierReponse(await apiFetch(`${API_BASE}/api/immobilisations/${id}/sortie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sortieData)
      }));
    } catch (e) {
      alert("Enregistrement de la sortie impossible : " + e.message);
      return;
    }
  } else {
    const item = appState.immobilisations.find(i => i.id == id);
    if (item) {
      Object.assign(item, sortieData);
      sauvegarderLocalement();
    }
  }

  fermerModalSortie();
  await chargerDonnees();
  afficherToast("Sortie d'actif enregistrée", "warning");
}

// Plan d'amortissement détaillé
async function afficherPlanImmo(id) {
  const immo = appState.immobilisations.find(i => i.id == id);
  if (!immo) return;

  const header = document.getElementById("plan-immo-header");
  header.innerHTML = `
    <div><span class="text-slate-400 block">Réf. Inventaire</span><strong class="text-blue-700">${immo.code_inventaire}</strong></div>
    <div><span class="text-slate-400 block">Désignation</span><strong>${immo.designation}</strong></div>
    <div><span class="text-slate-400 block">Valeur Brute HT</span><strong class="text-slate-900">${formatFCFA(immo.valeur_brute)}</strong></div>
    <div><span class="text-slate-400 block">Mise en service</span><strong>${immo.date_mise_en_service}</strong></div>
    <div><span class="text-slate-400 block">Durée</span><strong>${immo.duree_annees} ans</strong></div>
    <div><span class="text-slate-400 block">Taux</span><strong>${immo.taux_amortissement}%</strong></div>
    <div><span class="text-slate-400 block">Mode</span><strong>${immo.mode_amortissement || 'LINEAIRE'}</strong></div>
    <div><span class="text-slate-400 block">Statut</span><strong>${immo.statut}</strong></div>
  `;

  let plan = [];
  if (isBackendOnline) {
    try {
      const res = await apiFetch(`${API_BASE}/api/immobilisations/${id}/plan`).then(r => r.json());
      plan = res.plan;
    } catch (e) {
      plan = genererPlanClient(immo.valeur_brute, immo.date_mise_en_service, immo.duree_annees, immo.taux_amortissement);
    }
  } else {
    plan = genererPlanClient(immo.valeur_brute, immo.date_mise_en_service, immo.duree_annees, immo.taux_amortissement);
  }

  const tbody = document.getElementById("table-plan-body");
  tbody.innerHTML = "";
  plan.forEach(r => {
    const tr = document.createElement("tr");
    const est2024 = (r.annee === 2024);
    tr.className = est2024 ? "bg-indigo-50/70 font-bold" : "hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-2.5 px-3 ${est2024 ? 'text-indigo-800' : 'text-slate-800'}">${r.annee} ${est2024 ? '★ (En cours)' : ''}</td>
      <td class="py-2.5 px-3 text-right">${formatFCFA(r.base_amortissable)}</td>
      <td class="py-2.5 px-3 text-center">${r.taux.toFixed(2)}%</td>
      <td class="py-2.5 px-3 text-right text-indigo-700">${formatFCFA(r.dotation)}</td>
      <td class="py-2.5 px-3 text-right text-amber-700">${formatFCFA(r.cumul_amort)}</td>
      <td class="py-2.5 px-3 text-right text-emerald-700">${formatFCFA(r.vnc_fin)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("modal-plan").classList.remove("hidden");
}

function fermerModalPlan() {
  document.getElementById("modal-plan").classList.add("hidden");
}

// ==================== EXPORTS & IMPORTS EXCEL / JSON ====================
function exporterRegistreExcel() {
  const rows = appState.immobilisations.map(i => {
    const calc = i.situation_2024 || calculerSituation2024(i);
    return {
      "Code Inventaire": i.code_inventaire,
      "Désignation": i.designation,
      "Compte Immo": i.compte_immo || "",
      "Catégorie": i.cat_libelle || "",
      "Date Acquisition": i.date_acquisition,
      "Date Mise en Service": i.date_mise_en_service,
      "Valeur Brute HT (FCFA)": i.valeur_brute,
      "Durée (Ans)": i.duree_annees,
      "Taux (%)": i.taux_amortissement,
      "Dotation 2024 (FCFA)": calc.dotation,
      "Cumul Amort 2024 (FCFA)": calc.amort_fin,
      "VNC Fin 2024 (FCFA)": calc.vnc_fin,
      "Statut": i.statut,
      "Fournisseur": i.fournisseur || "",
      "Num Facture": i.num_facture || "",
      "Emplacement": i.emplacement || ""
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Registre Immobilisations");
  XLSX.writeFile(wb, `SAGI_Registre_Immobilisations_2024.xlsx`);
  afficherToast("Fichier Excel généré", "success");
}

function exporterFiscalExcel() {
  const tableauTable = document.getElementById("tableau-fiscal-print");
  const wb = XLSX.utils.table_to_book(tableauTable, { sheet: "Tableau Fiscal 2024" });
  XLSX.writeFile(wb, `SAGI_Tableau_Fiscal_Amortissements_2024.xlsx`);
  afficherToast("Tableau Fiscal exporté vers Excel", "success");
}

function telechargerModeleExcel() {
  const modele = [
    {
      "code_inventaire": "IMM-2024-010",
      "designation": "Exemple Ordinateur Portable Lenovo",
      "categorie_id": 5,
      "date_acquisition": "2024-03-01",
      "date_mise_en_service": "2024-03-01",
      "valeur_brute": 1500000,
      "duree_annees": 3,
      "taux_amortissement": 33.33,
      "cumul_amort_anterieur": 0,
      "statut": "EN_SERVICE"
    }
  ];
  const ws = XLSX.utils.json_to_sheet(modele);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modele_Import");
  XLSX.writeFile(wb, "SAGI_Modele_Import_Immobilisations.xlsx");
}

function traiterFichierImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet);

      if (!json || json.length === 0) {
        alert("Le fichier est vide ou n'a pas pu être lu.");
        return;
      }

      // Normalisation intelligente des colonnes
      const nouveauxItems = json.map((row, idx) => {
        const code = row['code_inventaire'] || row['Code'] || row['Ref'] || row['N°'] || `IMM-IMP-${idx + 1}`;
        const desig = row['designation'] || row['Désignation'] || row['Libelle'] || row['Nom'] || 'Immobilisation importée';
        const vb = parseFloat(row['valeur_brute'] || row['Valeur Brute'] || row['Prix'] || row['Montant'] || 0);
        const duree = parseInt(row['duree_annees'] || row['Duree'] || row['Durée'] || 5);
        const acq = row['date_acquisition'] || row['Date Achat'] || row['Date'] || '2024-01-01';
        const ms = row['date_mise_en_service'] || row['Date Service'] || acq;
        const cumulAnt = parseFloat(row['cumul_amort_anterieur'] || row['Cumul Anterieur'] || 0);

        return {
          id: Date.now() + idx,
          code_inventaire: String(code),
          designation: String(desig),
          categorie_id: parseInt(row['categorie_id']) || 5,
          date_acquisition: String(acq).substring(0, 10),
          date_mise_en_service: String(ms).substring(0, 10),
          valeur_brute: vb,
          duree_annees: duree,
          taux_amortissement: parseFloat(row['taux_amortissement']) || (100 / duree),
          cumul_amort_anterieur: cumulAnt,
          statut: row['statut'] || 'EN_SERVICE'
        };
      });

      if (isBackendOnline) {
        await verifierReponse(await apiFetch(`${API_BASE}/api/import-lot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: nouveauxItems, client_id: appState.clientActifId, exercice: EXERCICE_COURANT })
        }));
      } else {
        appState.immobilisations = [...appState.immobilisations, ...nouveauxItems];
        sauvegarderLocalement();
      }

      await chargerDonnees();
      changerOnglet("registre");
      afficherToast(`${nouveauxItems.length} immobilisations importées avec succès !`, "success");
    } catch (err) {
      alert("Erreur lors de l'analyse du fichier Excel : " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function telechargerSauvegardeJSON() {
  const backup = {
    nom_societe: "SAGI",
    exercice: EXERCICE_COURANT,
    date_export: new Date().toISOString(),
    categories: appState.categories,
    services: appState.services,
    immobilisations: appState.immobilisations
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `SAGI_Sauvegarde_Immo_${new Date().toISOString().substring(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  afficherToast("Sauvegarde JSON téléchargée", "success");
}

function restaurerSauvegardeJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.immobilisations) {
        if (!confirm(`Restaurer cette sauvegarde contenant ${data.immobilisations.length} biens ?`)) return;

        if (isBackendOnline) {
          await verifierReponse(await apiFetch(`${API_BASE}/api/import-lot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: data.immobilisations, client_id: appState.clientActifId, exercice: EXERCICE_COURANT })
          }));
        } else {
          appState.immobilisations = data.immobilisations;
          sauvegarderLocalement();
        }

        await chargerDonnees();
        afficherToast("Sauvegarde restaurée avec succès", "success");
      }
    } catch (err) {
      alert("Fichier de sauvegarde JSON invalide");
    }
  };
  reader.readAsText(file);
}

// ==================== TOAST NOTIFICATION ====================
function afficherToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  const msgEl = document.getElementById("toast-message");
  const icon = document.getElementById("toast-icon");

  msgEl.innerText = msg;
  if (type === "warning") {
    icon.className = "fa-solid fa-triangle-exclamation text-amber-400 text-base";
  } else if (type === "info") {
    icon.className = "fa-solid fa-circle-info text-blue-400 text-base";
  } else {
    icon.className = "fa-solid fa-circle-check text-emerald-400 text-base";
  }

  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}

// ==================== FONCTIONS D'IMPRESSION ====================
function imprimerDocumentActif() {
  const modalPlan = document.getElementById("modal-plan");
  if (modalPlan && !modalPlan.classList.contains("hidden")) {
    imprimerFichePlan();
    return;
  }
  if (window.ONGLET_ACTIF === "fiscal") {
    imprimerEtatSupplementaire();
    return;
  }
  const elRegEx = document.getElementById("print-registre-exercice");
  if (elRegEx) elRegEx.innerText = EXERCICE_COURANT;
  window.print();
}

function imprimerRegistre() {
  const elRegEx = document.getElementById("print-registre-exercice");
  if (elRegEx) elRegEx.innerText = EXERCICE_COURANT;
  window.print();
}

function imprimerFichePlan() {
  document.body.classList.add("printing-plan");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-plan");
  }, 800);
}

// ==================== GESTION ET SELECTION DES DOSSIERS CLIENTS ====================
async function ouvrirModalClients() {
  document.getElementById("modal-clients").classList.remove("hidden");
  const filtreInput = document.getElementById("filtre-client-input");
  if (filtreInput) filtreInput.value = "";
  // Années accessibles par société (selon les droits de l'utilisateur) : fournies par /api/navigation
  if (isBackendOnline) {
    try {
      const res = await apiFetch(`${API_BASE}/api/navigation`);
      if (res.ok) NAV_DATA = await res.json();
    } catch (e) { /* on affichera simplement sans choix d'année */ }
  }
  rendreListeClients();
}

// Années proposées pour une société : [{ annee, statut }] de la plus récente à la plus ancienne
function anneesDuClient(clientId) {
  const libelle = { OUVERT: "ouvert", CLOTURE: "clôturé", HISTORIQUE: "historique" };
  if (isBackendOnline) {
    const c = NAV_DATA && NAV_DATA.clients.find(x => x.id == clientId);
    if (!c) return [];
    return Object.keys(c.cases).filter(a => !c.cases[a].verrou)      // les années verrouillées (sans droit) ne sont pas proposées
      .map(a => ({ annee: parseInt(a), texte: `${a} · ${libelle[c.cases[a].statut] || ""}` }))
      .sort((x, y) => y.annee - x.annee);
  }
  return (appState.exercicesDisponibles || [EXERCICE_COURANT]).map(a => ({ annee: a, texte: String(a) }));
}

function fermerModalClients() {
  document.getElementById("modal-clients").classList.add("hidden");
}

function filtrerClientsListe() {
  rendreListeClients();
}

function rendreListeClients() {
  const container = document.getElementById("liste-clients-container");
  if (!container) return;
  container.innerHTML = "";

  const q = (document.getElementById("filtre-client-input") ? document.getElementById("filtre-client-input").value : "").toLowerCase().trim();

  const clientsFiltres = (appState.clients || []).filter(cl => {
    if (!q) return true;
    return (
      (cl.nom && cl.nom.toLowerCase().includes(q)) ||
      (cl.code && cl.code.toLowerCase().includes(q)) ||
      (cl.nif_ncc && cl.nif_ncc.toLowerCase().includes(q)) ||
      (cl.secteur && cl.secteur.toLowerCase().includes(q))
    );
  });

  if (clientsFiltres.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400">
        <i class="fa-solid fa-building-circle-xmark text-4xl mb-2 text-slate-300"></i>
        <p class="text-xs">Aucun client trouvé pour « ${q} »</p>
        <button onclick="ouvrirFormulaireClient()" class="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800">
          + Créer un nouveau client
        </button>
      </div>
    `;
    return;
  }

  // Calcul des statistiques en local si besoin
  const statsLocal = {};
  if (!isBackendOnline) {
    let allImmos = [];
    try {
      allImmos = JSON.parse(localStorage.getItem("sagi_all_immobilisations")) || SEED_IMMOBILISATIONS;
    } catch (e) {
      allImmos = SEED_IMMOBILISATIONS;
    }
    allImmos.forEach(i => {
      const cId = i.client_id || 1;
      if (!statsLocal[cId]) statsLocal[cId] = { count: 0, totalVB: 0 };
      statsLocal[cId].count++;
      if (i.statut === 'EN_SERVICE') {
        statsLocal[cId].totalVB += parseFloat(i.valeur_brute || 0);
      }
    });
  }

  clientsFiltres.forEach(cl => {
    const estActif = (cl.id == appState.clientActifId);
    const nbImmos = cl.nb_immobilisations !== undefined ? cl.nb_immobilisations : (statsLocal[cl.id]?.count || 0);
    const totalVB = cl.total_valeur_brute !== undefined ? cl.total_valeur_brute : (statsLocal[cl.id]?.totalVB || 0);

    // Année proposée par défaut : celle en cours pour le dossier actif, sinon l'exercice ouvert de la société
    const annees = anneesDuClient(cl.id);
    let anneeParDefaut = estActif ? EXERCICE_COURANT : cl.exercice_courant;
    if (!annees.some(a => a.annee === anneeParDefaut) && annees.length) anneeParDefaut = annees[0].annee;

    const card = document.createElement("div");
    card.className = `p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${estActif
        ? "border-2 border-indigo-600 bg-indigo-50/40 shadow-sm ring-2 ring-indigo-500/20"
        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs"
      }`;

    card.innerHTML = `
      <div class="flex items-start space-x-3.5">
        <div class="w-11 h-11 rounded-xl ${estActif ? 'bg-indigo-600' : 'bg-slate-800'} text-white flex items-center justify-center font-black text-base shadow-sm shrink-0">
          ${(cl.code ? cl.code[0] : (cl.nom ? cl.nom[0] : "C")).toUpperCase()}
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h4 class="font-extrabold text-sm text-slate-900">${cl.nom}</h4>
            <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${estActif ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 border'
      }">${cl.code}</span>
          </div>
          <div class="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span><i class="fa-solid fa-id-card text-slate-400 mr-1"></i>NIF: <strong>${cl.nif_ncc || 'Non défini'}</strong></span>
            <span><i class="fa-solid fa-tag text-slate-400 mr-1"></i>${cl.secteur || 'Activité générale'}</span>
            <span><i class="fa-solid fa-coins text-slate-400 mr-1"></i>${cl.devise || 'FCFA'}</span>
          </div>
          <div class="text-[11px] font-semibold text-slate-600 mt-1.5 flex items-center space-x-2">
            <span class="bg-white px-2 py-0.5 rounded border border-slate-200">${nbImmos} bien(s) enregistré(s)</span>
            <span class="text-indigo-700 font-bold">${formatFCFA(totalVB)}</span>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 self-end sm:self-center">
        ${estActif ? `
          <span class="px-2.5 py-1.5 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center shadow-xs">
            <i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i> Actif
          </span>
        ` : ''}
        ${annees.length ? `
          <select id="annee-client-${cl.id}" title="Choisir l'année (exercice) à ouvrir"
            class="text-xs font-bold bg-white text-indigo-700 px-2 py-1.5 rounded-lg border border-slate-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300">
            ${annees.map(a => `<option value="${a.annee}"${a.annee === anneeParDefaut ? " selected" : ""}>${a.texte}</option>`).join("")}
          </select>` : ""}
        <button onclick="selectionnerClient(${cl.id}, document.getElementById('annee-client-${cl.id}')?.value)" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center shadow-xs">
          <i class="fa-solid fa-folder-open mr-1.5"></i> Ouvrir
        </button>
        <button onclick="ouvrirFormulaireClient(${cl.id})" title="Modifier ce client" class="w-8 h-8 rounded-lg hover:bg-slate-100 border border-slate-200 text-slate-600 transition flex items-center justify-center">
          <i class="fa-solid fa-pen text-xs"></i>
        </button>
        ${!estActif ? `
        <button onclick="supprimerClient(${cl.id})" title="Supprimer ce client" class="w-8 h-8 rounded-lg hover:bg-rose-50 border border-slate-200 text-rose-600 transition flex items-center justify-center">
          <i class="fa-solid fa-trash text-xs"></i>
        </button>
        ` : ''}
      </div>
    `;

    container.appendChild(card);
  });
}

async function selectionnerClient(clientId, annee) {
  appState.clientActifId = parseInt(clientId);
  appState.clientActif = appState.clients.find(c => c.id == appState.clientActifId) || appState.clients[0];
  DEVISE = appState.clientActif.devise || "FCFA";
  localStorage.setItem("sagi_client_actif_id", String(appState.clientActifId));

  fermerModalClients();
  await chargerDonnees();
  // Année choisie dans la liste : on bascule dessus si elle est accessible (sinon on garde l'exercice par défaut)
  const anneeChoisie = parseInt(annee);
  if (anneeChoisie && anneeChoisie !== EXERCICE_COURANT && (appState.exercicesDisponibles || []).includes(anneeChoisie)) {
    await changerExerciceActif(anneeChoisie);
  }
  afficherToast(`Dossier ouvert : ${appState.clientActif.nom} · exercice ${EXERCICE_COURANT}`, "success");
}

function ouvrirFormulaireClient(clientId = null) {
  const form = document.getElementById("form-client");
  form.reset();
  const idInput = document.getElementById("client-form-id");
  const titre = document.getElementById("modal-client-form-titre");

  if (clientId) {
    const cl = appState.clients.find(c => c.id == clientId);
    if (!cl) return;
    idInput.value = cl.id;
    document.getElementById("client-form-code").value = cl.code;
    document.getElementById("client-form-nom").value = cl.nom;
    document.getElementById("client-form-nif").value = cl.nif_ncc || "";
    document.getElementById("client-form-regime").value = cl.regime_fiscal || "Réel Normal";
    document.getElementById("client-form-devise").value = cl.devise || "FCFA";
    document.getElementById("client-form-secteur").value = cl.secteur || "";
    document.getElementById("client-form-contact").value = cl.contact || "";
    document.getElementById("client-form-tel").value = cl.telephone || "";
    document.getElementById("client-form-email").value = cl.email || "";
    document.getElementById("client-form-adresse").value = cl.adresse || "";
    titre.innerHTML = `<i class="fa-solid fa-pen-to-square mr-2 text-indigo-400"></i> Modifier ${cl.nom}`;
  } else {
    idInput.value = "";
    titre.innerHTML = `<i class="fa-solid fa-building-circle-check mr-2 text-indigo-400"></i> Nouveau Dossier Client`;
  }

  document.getElementById("modal-form-client").classList.remove("hidden");
}

function fermerFormulaireClient() {
  document.getElementById("modal-form-client").classList.add("hidden");
}

async function soumettreFormulaireClient(e) {
  e.preventDefault();
  const id = document.getElementById("client-form-id").value;
  const clientData = {
    code: document.getElementById("client-form-code").value.trim().toUpperCase(),
    nom: document.getElementById("client-form-nom").value.trim(),
    nif_ncc: document.getElementById("client-form-nif").value.trim(),
    regime_fiscal: document.getElementById("client-form-regime").value,
    devise: document.getElementById("client-form-devise").value,
    secteur: document.getElementById("client-form-secteur").value.trim(),
    contact: document.getElementById("client-form-contact").value.trim(),
    telephone: document.getElementById("client-form-tel").value.trim(),
    email: document.getElementById("client-form-email").value.trim(),
    adresse: document.getElementById("client-form-adresse").value.trim()
  };

  if (isBackendOnline) {
    try {
      const url = id ? `${API_BASE}/api/clients/${id}` : `${API_BASE}/api/clients`;
      const methode = id ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur de sauvegarde client");
      if (!id && data.id) {
        appState.clientActifId = data.id;
      }
    } catch (err) {
      alert("Erreur serveur : " + err.message);
      return;
    }
  } else {
    if (id) {
      const idx = appState.clients.findIndex(c => c.id == id);
      if (idx !== -1) {
        appState.clients[idx] = { ...appState.clients[idx], ...clientData };
      }
    } else {
      const newId = Date.now();
      const nouveau = { id: newId, ...clientData, nb_immobilisations: 0, total_valeur_brute: 0 };
      appState.clients.push(nouveau);
      appState.clientActifId = newId;
    }
    sauvegarderLocalement();
  }

  fermerFormulaireClient();
  await chargerDonnees();
  rendreListeClients();
  afficherToast(id ? "Client mis à jour" : "Nouveau dossier client créé avec succès !", "success");
}

async function supprimerClient(clientId) {
  const cl = appState.clients.find(c => c.id == clientId);
  if (!cl) return;

  if (!confirm(`Voulez-vous vraiment supprimer le dossier client « ${cl.nom} » ?`)) return;

  if (isBackendOnline) {
    try {
      const res = await apiFetch(`${API_BASE}/api/clients/${clientId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur suppression client");
    } catch (e) {
      alert(e.message);
      return;
    }
  } else {
    appState.clients = appState.clients.filter(c => c.id != clientId);
    sauvegarderLocalement();
  }

  await chargerDonnees();
  rendreListeClients();
  afficherToast("Client supprimé avec succès", "info");
}



// ==================== ÉTAT SUPPLÉMENTAIRE : TABLEAU DES AMORTISSEMENTS ET INVENTAIRE ====================
// Mise en page identique à l'état papier : paysage, regroupement par compte, sous-totaux, total général.
function construireEtatSupplementaire(filtreCompte) {
  const cl = appState.clientActif || { nom: "SAGI S.A." };
  const ex = EXERCICE_COURANT;
  const fmt = n => (Math.round(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const dateCourte = s => { const d = parseDateStr(s); if (!d || isNaN(d)) return ""; const p = n => String(n).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(-2)}`; };
  const vide = () => ({ vb: 0, ant: 0, ex: 0, tot: 0, res: 0, ces: 0, pv: 0, mv: 0 });
  const cumul = (t, l) => { Object.keys(t).forEach(k => t[k] += l[k]); };

  // Regroupement par compte d'immobilisation
  const groupes = {};
  appState.immobilisations.forEach(immo => {
    const calc = immo.situation_2024 || calculerSituation2024(immo);
    if ((calc.valeur_debut + calc.acquisition + calc.cession + calc.valeur_fin) === 0) return; // sorti avant l'exercice
    const cat = appState.categories.find(c => c.id == immo.categorie_id) || {};
    const cle = cat.compte_immo || "000000";
    if (filtreCompte && String(cle) !== String(filtreCompte)) return;
    if (!groupes[cle]) groupes[cle] = { libelle: cat.libelle || "Autres", lignes: [] };
    const vb = parseFloat(immo.valeur_brute) || 0;
    const sorti = calc.cession > 0;
    const amortTotal = sorti ? calc.amort_sorties : calc.amort_fin;
    const prix = sorti ? (parseFloat(immo.prix_cession) || 0) : 0;
    const vncSortie = vb - amortTotal;
    groupes[cle].lignes.push({
      des: immo.designation, qte: immo.quantite || 1, date: immo.date_mise_en_service, taux: immo.duree_annees,
      l: { vb, ant: calc.amort_debut, ex: calc.dotation, tot: amortTotal, res: sorti ? 0 : calc.vnc_fin,
           ces: prix, pv: sorti ? Math.max(prix - vncSortie, 0) : 0, mv: sorti ? Math.max(vncSortie - prix, 0) : 0 }
    });
  });

  const cellules = l => `<td class="num">${fmt(l.vb)}</td><td class="num">${fmt(l.ant)}</td><td class="num">${fmt(l.ex)}</td><td class="num">${fmt(l.tot)}</td><td class="num">${fmt(l.res)}</td><td class="num">${l.ces ? fmt(l.ces) : ""}</td><td class="num">${l.pv ? fmt(l.pv) : ""}</td><td class="num">${l.mv ? fmt(l.mv) : ""}</td>`;
  const totalLigne = (lib, l, cls) => `<tr class="${cls}"><td></td><td colspan="3">${esc(lib)}</td>${cellules(l)}</tr>`;

  let corps = `<tr class="grp"><td></td><td colspan="11">@ IMMOBILISATIONS CORPORELLES</td></tr>`;
  const totalGeneral = vide();
  Object.keys(groupes).sort().forEach(compte => {
    const g = groupes[compte];
    const sousTotal = vide();
    corps += `<tr class="grp"><td class="ctr">* ${esc(compte)}</td><td colspan="11">${esc(g.libelle)}</td></tr>`;
    g.lignes.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    g.lignes.forEach(r => {
      cumul(sousTotal, r.l);
      corps += `<tr><td></td><td class="des">${esc(r.qte)} ${esc(r.des)}</td><td class="ctr">${dateCourte(r.date)}</td><td class="ctr">${esc(r.taux)}</td>${cellules(r.l)}</tr>`;
    });
    corps += totalLigne("* Total " + g.libelle, sousTotal, "tot");
    cumul(totalGeneral, sousTotal);
  });
  corps += totalLigne("TOTAL IMMOBILISATIONS CORPORELLES", totalGeneral, "tot");
  corps += totalLigne("TOTAL GENERAL", totalGeneral, "tot");

  const aujourdhui = new Date().toLocaleDateString("fr-FR");
  return `<div class="etat-doc">
    <div class="etat-entete">
      <div>EXERCICE: ${ex}</div>
      <div class="etat-cadre">${esc(cl.nom)}<br>Durée (en mois) : 12<br>Du 01/01/${ex} AU 31/12/${ex}</div>
      <div class="etat-cadre">ETAT SUPPLEMENTAIRE</div>
    </div>
    <div class="etat-titre">TABLEAU DES AMORTISSEMENTS ET INVENTAIRE DES IMMOBILISATIONS</div>
    <table>
      <thead>
        <tr>
          <th rowspan="2">Numéro<br>de<br>comptes</th>
          <th rowspan="2">Désignation des immobilisations</th>
          <th rowspan="2">Date<br>mise<br>service</th>
          <th rowspan="2">Taux<br>amort.</th>
          <th rowspan="2">Valeur<br>d'acquisition</th>
          <th colspan="3">Amortissements</th>
          <th rowspan="2">Valeur<br>résiduelle</th>
          <th rowspan="2">Prix de<br>cession</th>
          <th rowspan="2">Plus-values</th>
          <th rowspan="2">Moins-values</th>
        </tr>
        <tr><th>Antérieurs</th><th>De l'exercice</th><th>Total</th></tr>
      </thead>
      <tbody>${corps}</tbody>
    </table>
    <div class="etat-pied"><span>${esc(cl.nom)} – état édité le ${aujourdhui}</span><span>Montants en ${esc(DEVISE)}</span></div></div>`;
}

function imprimerEtatSupplementaire(filtreCompte) {
  const zone = document.getElementById("etat-supplementaire");
  if (!zone) return;
  zone.innerHTML = construireEtatSupplementaire(typeof filtreCompte === "string" ? filtreCompte : "");
  // Ajustement automatique : tout tenir sur une seule feuille A4 paysage (zone utile 281 x 190 mm)
  const doc = zone.firstElementChild;
  zone.style.cssText = "display:block;position:absolute;left:-9999px;top:0;width:281mm;";
  const mmPx = 96 / 25.4;
  let z = 1;
  for (let k = 0; k < 4; k++) {
    doc.style.width = (281 / z) + "mm";
    doc.style.zoom = z;
    const h = doc.getBoundingClientRect().height;
    const cible = 188 * mmPx;
    if (h <= cible) break;
    z = Math.max(0.35, z * (cible / h));
  }
  zone.style.cssText = "";
  // Page A4 paysage appliquée uniquement à cette impression (numéro de page en bas à droite)
  const st = document.createElement("style");
  st.id = "style-page-etat";
  st.textContent = "@page { size: A4 landscape; margin: 8mm 8mm 12mm 8mm; @bottom-right { content: 'page ' counter(page) ' / ' counter(pages); font-size: 8px; } }";
  document.head.appendChild(st);
  document.body.classList.add("printing-etat");
  const nettoyer = () => {
    document.body.classList.remove("printing-etat");
    zone.style.cssText = "";
    const s = document.getElementById("style-page-etat");
    if (s) s.remove();
    window.removeEventListener("afterprint", nettoyer);
  };
  window.addEventListener("afterprint", nettoyer);
  window.print();
}

// ==================== ONGLET EXTRAIT DE COMPTE ====================
function rendreExtraitCompte() {
  const sel = document.getElementById("extrait-compte");
  const apercu = document.getElementById("extrait-apercu");
  if (!sel || !apercu) return;
  const choix = sel.value;
  const comptes = [...new Set(appState.categories
    .filter(c => appState.immobilisations.some(i => i.categorie_id == c.id))
    .map(c => c.compte_immo))].sort();
  sel.innerHTML = `<option value="">Tous les comptes</option>` +
    comptes.map(c => `<option value="${c}">${c}</option>`).join("");
  sel.value = comptes.includes(choix) ? choix : "";
  apercu.innerHTML = construireEtatSupplementaire(sel.value);
}

// ==================== FENÊTRE : MISE À JOUR DES IMMOBILISATIONS ====================
function ouvrirMenuMAJ() {
  document.getElementById("modal-maj").classList.remove("hidden");
}

function fermerMenuMAJ() {
  document.getElementById("modal-maj").classList.add("hidden");
}

// MAJ des Immos : fenêtre « Saisir des immobilisations »
function majActionImmos() {
  fermerMenuMAJ();
  ouvrirSaisieImmos();
}

// Cession : fenêtre « Effectuer un(e) cession / retrait »
function majActionCession() {
  fermerMenuMAJ();
  ouvrirCession();
}

// Actualisation des comptes : ouvre la fenêtre « Mise à jour des comptes / client »
function majActionComptes() {
  fermerMenuMAJ();
  ouvrirMenuComptes();
}

function majActionRetour() {
  fermerMenuMAJ();
  changerOnglet("dashboard");
}

// ==================== FENÊTRE : MISE À JOUR DES COMPTES / CLIENT ====================
let compteIdx = 0;
let compteMode = "consult"; // consult | ajout | modif

const POSTES_COMPTE = ["Brevets, licences, logiciels", "Terrains", "Bâtiments", "Installations et agencements",
  "Matériel et outillage", "Matériel de bureau", "Matériel informatique", "Mobilier", "Matériel de transport", "Autres immobilisations"];

function comptesTries() {
  return [...(appState.categories || [])].sort((a, b) => String(a.compte_immo).localeCompare(String(b.compte_immo)));
}

function ouvrirMenuComptes() {
  const cl = appState.clientActif || {};
  document.getElementById("cpt-client").value = [cl.nif_ncc, cl.nom].filter(Boolean).join(" – ");
  document.getElementById("cpt-postes").innerHTML = POSTES_COMPTE.map(p => `<option value="${p}">`).join("");
  compteMode = "consult";
  compteIdx = 0;
  majComptesAfficher();
  document.getElementById("modal-comptes").classList.remove("hidden");
}

function fermerMenuComptes() {
  document.getElementById("modal-comptes").classList.add("hidden");
}

function majComptesAfficher() {
  const liste = comptesTries();
  const edition = compteMode !== "consult";
  const c = (compteMode === "ajout") ? {} : (liste[compteIdx] || {});
  const set = (id, v) => { document.getElementById(id).value = v == null ? "" : v; };
  set("cpt-numero", c.compte_immo);
  set("cpt-designation", c.libelle);
  set("cpt-amortir", String(c.a_amortir || "O").toUpperCase() === "N" ? "N" : "O");
  set("cpt-poste", c.poste);
  set("cpt-contrepartie", compteMode === "ajout" ? "6812" : (c.compte_dotation || "6812"));
  set("cpt-vcn", compteMode === "ajout" ? "811" : (c.compte_vcn || "811"));
  set("cpt-prod", compteMode === "ajout" ? "821" : (c.compte_prod_cession || "821"));
  ["cpt-numero", "cpt-designation", "cpt-amortir", "cpt-poste", "cpt-contrepartie", "cpt-vcn", "cpt-prod"]
    .forEach(id => { document.getElementById(id).disabled = !edition; });
  document.getElementById("cpt-compteur").innerText = compteMode === "ajout" ? "Nouveau compte" : (liste.length ? `${compteIdx + 1} / ${liste.length}` : "Aucun compte");
  const vis = (id, v) => document.getElementById(id).classList.toggle("hidden", !v);
  vis("cpt-btn-ajouter", !edition); vis("cpt-btn-modifier", !edition && liste.length > 0);
  vis("cpt-btn-enregistrer", edition); vis("cpt-btn-annuler", edition);
  ["cpt-btn-debut", "cpt-btn-prec", "cpt-btn-suiv", "cpt-btn-fin", "cpt-btn-chercher"].forEach(id => { document.getElementById(id).disabled = edition; });
}

function compteNaviguer(cible) {
  const n = comptesTries().length;
  if (!n) return;
  if (cible === "debut") compteIdx = 0;
  else if (cible === "fin") compteIdx = n - 1;
  else if (cible === "prec") compteIdx = Math.max(0, compteIdx - 1);
  else if (cible === "suiv") compteIdx = Math.min(n - 1, compteIdx + 1);
  majComptesAfficher();
}

function compteAjouter() { compteMode = "ajout"; majComptesAfficher(); document.getElementById("cpt-numero").focus(); }
function compteModifier() { compteMode = "modif"; majComptesAfficher(); document.getElementById("cpt-designation").focus(); }
function compteAnnuler() { compteMode = "consult"; majComptesAfficher(); }

function compteRechercher() {
  const q = (prompt("Rechercher un compte (numéro ou désignation) :") || "").trim().toLowerCase();
  if (!q) return;
  const idx = comptesTries().findIndex(c => String(c.compte_immo).toLowerCase().includes(q) || String(c.libelle).toLowerCase().includes(q));
  if (idx < 0) { afficherToast("Aucun compte trouvé", "error"); return; }
  compteIdx = idx;
  majComptesAfficher();
}

async function compteEnregistrer() {
  const g = id => document.getElementById(id).value.trim();
  const numero = g("cpt-numero"), designation = g("cpt-designation");
  if (!/^\d{3,8}$/.test(numero) || !designation) {
    alert("Renseignez un numéro de compte (3 à 8 chiffres) et une désignation.");
    return;
  }
  const liste = comptesTries();
  const existant = compteMode === "modif" ? liste[compteIdx] : null;
  if (liste.some(c => c.compte_immo === numero && (!existant || c.id !== existant.id))) {
    alert("Ce numéro de compte existe déjà.");
    return;
  }
  const amortCompte = "28" + numero.padEnd(6, "0").slice(1, 5);
  let code = numero.replace(/0+$/, "") || numero;
  if (liste.some(c => c.code === code && (!existant || c.id !== existant.id))) code = numero;
  const garder = existant && existant.compte_immo === numero;
  const corps = {
    code: garder ? existant.code : code,
    libelle: designation,
    compte_immo: numero,
    compte_amort: garder ? existant.compte_amort : amortCompte,
    compte_dotation: g("cpt-contrepartie") || "6812",
    duree_defaut: existant ? existant.duree_defaut : 5,
    taux_defaut: existant ? existant.taux_defaut : 20,
    mode_defaut: existant ? (existant.mode_defaut || "LINEAIRE") : "LINEAIRE",
    a_amortir: g("cpt-amortir") === "N" ? "N" : "O",
    poste: g("cpt-poste"),
    compte_vcn: g("cpt-vcn") || "811",
    compte_prod_cession: g("cpt-prod") || "821"
  };
  const id = existant ? existant.id : "";
  if (isBackendOnline) {
    try {
      await verifierReponse(await apiFetch(`${API_BASE}/api/categories${id ? "/" + encodeURIComponent(id) : ""}`, {
        method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps)
      }));
    } catch (e) { alert("Enregistrement impossible : " + e.message); return; }
    await chargerDonnees();
  } else {
    if (existant) Object.assign(appState.categories.find(x => x.id == existant.id), corps);
    else appState.categories.push({ id: Math.max(0, ...appState.categories.map(x => x.id)) + 1, ...corps });
    sauvegarderLocalement();
    mettreAJourInterface();
  }
  compteMode = "consult";
  const pos = comptesTries().findIndex(c => c.compte_immo === numero);
  compteIdx = pos >= 0 ? pos : 0;
  majComptesAfficher();
  afficherToast("Compte enregistré", "success");
}

// ==================== FENÊTRE : SAISIR DES IMMOBILISATIONS ====================
let saiIdx = 0;
let saiMode = "consult"; // consult | ajout | modif
const $s = id => document.getElementById(id);

function saiListe() {
  return [...(appState.immobilisations || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
}

function ouvrirSaisieImmos() {
  $s("sai-compte").innerHTML = comptesTries().map(c => `<option value="${c.id}">${c.compte_immo}</option>`).join("");
  $s("sai-cst-compte").innerHTML = `<option value="">—</option>` + comptesTries().map(c => `<option value="${c.id}">${c.compte_immo}</option>`).join("");
  $s("sai-client").innerHTML = (appState.clients || []).map(c => `<option value="${c.id}">${c.code} – ${c.nom}</option>`).join("");
  $s("sai-titre-client").innerText = (appState.clientActif && appState.clientActif.nom) || "";
  saiMode = "consult";
  saiIdx = 0;
  saiAfficher();
  $s("modal-saisie").classList.remove("hidden");
}

function fermerSaisieImmos() { $s("modal-saisie").classList.add("hidden"); }

function saiLibelleCompte() {
  const cat = (appState.categories || []).find(c => c.id == $s("sai-compte").value);
  $s("sai-compte-lib").innerText = cat ? cat.libelle : "";
}

function saiAfficher() {
  const liste = saiListe();
  const edition = saiMode !== "consult";
  const i = saiMode === "ajout" ? null : liste[saiIdx];
  const set = (id, v) => { $s(id).value = v == null ? "" : v; };
  if (i) {
    set("sai-num", i.id); $s("sai-compte").value = i.categorie_id; set("sai-qte", i.quantite || 1);
    set("sai-libelle", i.designation); set("sai-dacq", i.date_acquisition); set("sai-dms", i.date_mise_en_service);
    set("sai-duree", i.duree_annees); set("sai-valeur", i.valeur_brute);
    set("sai-annuite", Math.round((parseFloat(i.valeur_brute) || 0) * (parseFloat(i.taux_amortissement) || 0) / 100));
    set("sai-ant", i.cumul_amort_anterieur || 0); $s("sai-client").value = i.client_id || appState.clientActifId;
    set("sai-aug", i.augmentation_valeur || 0); set("sai-contrat", i.type_contrat || "CN");
    const sorti = i.statut === "CEDE" || i.statut === "REBUT";
    const calc = sorti ? (i.situation_2024 || calculerSituation2024(i)) : null;
    const vncSortie = sorti ? (parseFloat(i.valeur_brute) - (calc.amort_sorties || 0)) : 0;
    set("sai-prix", sorti ? (i.prix_cession || 0) : 0);
    set("sai-plus", sorti ? Math.max((i.prix_cession || 0) - vncSortie, 0) : 0);
    set("sai-moins", sorti ? Math.max(vncSortie - (i.prix_cession || 0), 0) : 0);
    set("sai-qtesort", sorti ? (i.quantite || 1) : 0);
    set("sai-typsort", i.statut === "CEDE" ? "C" : (i.statut === "REBUT" ? "R" : "N"));
    set("sai-datsort", sorti ? (i.date_sortie || "") : "");
  } else {
    const cst = $s("sai-chk-const").checked;
    const taux = parseFloat($s("sai-cst-taux").value) || 20;
    const ex = EXERCICE_COURANT;
    const nums = liste.map(x => x.id || 0);
    set("sai-num", Math.max(0, ...nums) + 1);
    if (cst && $s("sai-cst-compte").value) $s("sai-compte").value = $s("sai-cst-compte").value;
    set("sai-qte", 1); set("sai-libelle", "");
    const dte = (cst && $s("sai-cst-date").value) || `${ex}-01-01`;
    set("sai-dacq", dte); set("sai-dms", dte);
    set("sai-duree", Math.round(100 / taux)); set("sai-valeur", ""); set("sai-annuite", ""); set("sai-ant", 0);
    $s("sai-client").value = appState.clientActifId; set("sai-aug", 0); set("sai-contrat", "CN");
    ["sai-prix", "sai-plus", "sai-moins", "sai-qtesort"].forEach(id => set(id, 0)); set("sai-typsort", "N"); set("sai-datsort", "");
  }
  saiLibelleCompte();
  const editables = ["sai-compte", "sai-qte", "sai-libelle", "sai-dacq", "sai-dms", "sai-duree", "sai-valeur", "sai-aug", "sai-contrat"];
  editables.forEach(id => { $s(id).disabled = !edition; });
  $s("sai-annuite").disabled = !(edition && $s("sai-chk-annuites").checked);
  $s("sai-ant").disabled = !(edition && $s("sai-chk-ant").checked);
  $s("sai-client").disabled = !(edition && $s("sai-chk-client").checked);
  $s("sai-compteur").innerText = saiMode === "ajout" ? "Nouveau bien" : (liste.length ? `${saiIdx + 1} / ${liste.length}` : "Aucun bien");
  const vis = (id, v) => $s(id).classList.toggle("hidden", !v);
  vis("sai-btn-ajouter", !edition); vis("sai-btn-modifier", !edition && liste.length > 0);
  vis("sai-btn-enregistrer", edition); vis("sai-btn-annuler", edition);
  ["sai-btn-debut", "sai-btn-prec", "sai-btn-suiv", "sai-btn-fin", "sai-btn-chercher"].forEach(id => { $s(id).disabled = edition; });
}

// « calculer » : annuité = valeur / durée ; valeur antérieure = amortissements cumulés au début de l'exercice
function saiCalculer() {
  if (saiMode === "consult" || !$s("sai-chk-calc").checked) return;
  const vb = parseFloat($s("sai-valeur").value) || 0;
  const duree = parseInt($s("sai-duree").value) || 0;
  if (!$s("sai-chk-annuites").checked) $s("sai-annuite").value = duree ? Math.round(vb / duree) : 0;
  if (!$s("sai-chk-ant").checked) {
    const taux = vb ? (parseFloat($s("sai-annuite").value) || 0) / vb * 100 : 0;
    const plan = genererPlanClient(vb, $s("sai-dms").value, duree, taux);
    $s("sai-ant").value = plan.filter(p => p.annee < EXERCICE_COURANT).reduce((s, p) => s + p.dotation, 0) || 0;
  }
}

function saiOptions() { saiAfficher(); saiCalculer(); }
function saiAjouter() { saiMode = "ajout"; saiAfficher(); saiCalculer(); $s("sai-libelle").focus(); }
function saiModifier() { saiMode = "modif"; saiAfficher(); $s("sai-libelle").focus(); }
function saiAnnuler() { saiMode = "consult"; saiAfficher(); }

function saiNaviguer(cible) {
  const n = saiListe().length;
  if (!n) return;
  if (cible === "debut") saiIdx = 0;
  else if (cible === "fin") saiIdx = n - 1;
  else if (cible === "prec") saiIdx = Math.max(0, saiIdx - 1);
  else if (cible === "suiv") saiIdx = Math.min(n - 1, saiIdx + 1);
  saiAfficher();
}

function saiRechercher() {
  const q = (prompt("Rechercher (n° d'enregistrement, libellé ou n° de compte) :") || "").trim().toLowerCase();
  if (!q) return;
  const idx = saiListe().findIndex(i => {
    const cat = (appState.categories || []).find(c => c.id == i.categorie_id) || {};
    return String(i.id) === q || String(i.designation).toLowerCase().includes(q) || String(cat.compte_immo || "").includes(q);
  });
  if (idx < 0) { afficherToast("Aucun bien trouvé", "error"); return; }
  saiIdx = idx;
  saiAfficher();
}

async function saiEnregistrer() {
  const vb = parseFloat($s("sai-valeur").value);
  const duree = parseInt($s("sai-duree").value);
  const libelle = $s("sai-libelle").value.trim();
  if (!libelle || !($s("sai-dacq").value) || !($s("sai-dms").value) || !(vb > 0) || !(duree > 0)) {
    alert("Renseignez le libellé, les dates, la durée de vie et la valeur d'acquisition.");
    return;
  }
  const liste = saiListe();
  const existant = saiMode === "modif" ? liste[saiIdx] : null;
  const annuite = parseFloat($s("sai-annuite").value);
  const taux = annuite > 0 ? Math.round(annuite / vb * 10000) / 100 : Math.round(10000 / duree) / 100;
  let code = existant ? existant.code_inventaire : "";
  if (!code) {
    let n = liste.length + 1;
    do { code = `IMM-${EXERCICE_COURANT}-${String(n++).padStart(3, "0")}`; } while (liste.some(x => x.code_inventaire === code));
  }
  const clientId = parseInt($s("sai-client").value) || appState.clientActifId;
  const immoData = {
    client_id: existant ? (existant.client_id || clientId) : clientId,
    exercice: EXERCICE_COURANT,
    code_inventaire: code,
    designation: libelle,
    categorie_id: parseInt($s("sai-compte").value),
    service_id: existant ? existant.service_id : null,
    date_acquisition: $s("sai-dacq").value,
    date_mise_en_service: $s("sai-dms").value,
    valeur_brute: vb,
    duree_annees: duree,
    taux_amortissement: taux,
    mode_amortissement: existant ? (existant.mode_amortissement || "LINEAIRE") : "LINEAIRE",
    cumul_amort_anterieur: parseFloat($s("sai-ant").value) || 0,
    fournisseur: existant ? (existant.fournisseur || "") : "",
    num_facture: existant ? (existant.num_facture || "") : "",
    emplacement: existant ? (existant.emplacement || "") : "",
    notes: existant ? (existant.notes || "") : "",
    statut: existant ? existant.statut : "EN_SERVICE",
    quantite: parseInt($s("sai-qte").value) || 1,
    type_contrat: $s("sai-contrat").value,
    augmentation_valeur: parseFloat($s("sai-aug").value) || 0
  };
  const id = existant ? existant.id : "";
  if (isBackendOnline) {
    try {
      const res = await apiFetch(id ? `${API_BASE}/api/immobilisations/${id}` : `${API_BASE}/api/immobilisations`, {
        method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(immoData)
      });
      await verifierReponse(res);
    } catch (err) { alert("Enregistrement impossible : " + err.message); return; }
  } else {
    if (id) {
      const k = appState.immobilisations.findIndex(x => x.id == id);
      if (k !== -1) appState.immobilisations[k] = { ...appState.immobilisations[k], ...immoData };
    } else {
      immoData.id = Date.now();
      appState.immobilisations.push(immoData);
    }
    sauvegarderLocalement();
  }
  await chargerDonnees();
  saiMode = "consult";
  const apres = saiListe();
  const pos = apres.findIndex(x => x.code_inventaire === code);
  saiIdx = pos >= 0 ? pos : Math.max(0, apres.length - 1);
  saiAfficher();
  afficherToast(id ? "Immobilisation mise à jour" : "Bien ajouté avec succès", "success");
}

// ==================== FENÊTRE : EFFECTUER UN(E) CESSION / RETRAIT ====================
let cesIdx = 0;

function cesListe() {
  const compte = $s("ces-compte").value;
  return [...(appState.immobilisations || [])]
    .filter(i => i.statut === "EN_SERVICE")
    .filter(i => {
      if (!compte) return true;
      const cat = (appState.categories || []).find(c => c.id == i.categorie_id) || {};
      return String(cat.compte_immo) === compte;
    })
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}

function ouvrirCession() {
  const utilises = new Set(appState.immobilisations.filter(i => i.statut === "EN_SERVICE").map(i => i.categorie_id));
  $s("ces-compte").innerHTML = `<option value="">Tous</option>` +
    comptesTries().filter(c => utilises.has(c.id)).map(c => `<option value="${c.compte_immo}">${c.compte_immo}</option>`).join("");
  const cl = appState.clientActif || {};
  $s("ces-client").value = cl.nif_ncc || cl.nom || "";
  cesIdx = 0;
  cesAfficher();
  $s("modal-cession").classList.remove("hidden");
}

function fermerCession() { $s("modal-cession").classList.add("hidden"); }

function cesAfficher(garderSaisie) {
  const liste = cesListe();
  if (cesIdx >= liste.length) cesIdx = Math.max(0, liste.length - 1);
  const i = liste[cesIdx];
  const set = (id, v) => { $s(id).value = v == null ? "" : v; };
  set("ces-num", i ? i.id : ""); set("ces-designation", i ? `${i.quantite || 1} ${i.designation}` : "");
  set("ces-dacq", i ? formaterDateFR(i.date_acquisition) : ""); set("ces-dms", i ? formaterDateFR(i.date_mise_en_service) : "");
  set("ces-dispo", i ? (i.quantite || 1) : ""); set("ces-valeur", i ? Math.round(i.valeur_brute) : "");
  if (!garderSaisie) {
    set("ces-date", ""); set("ces-qte", ""); set("ces-type", "N"); set("ces-prix", 0);
  }
  $s("ces-compteur").innerText = liste.length ? `${cesIdx + 1} / ${liste.length}` : "Aucun bien en service";
  ["ces-btn-enregistrer"].forEach(id => { $s(id).disabled = !i; });
}

function formaterDateFR(s) {
  const d = parseDateStr(s);
  if (!d || isNaN(d)) return "";
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function cesNaviguer(cible) {
  const n = cesListe().length;
  if (!n) return;
  if (cible === "debut") cesIdx = 0;
  else if (cible === "fin") cesIdx = n - 1;
  else if (cible === "prec") cesIdx = Math.max(0, cesIdx - 1);
  else if (cible === "suiv") cesIdx = Math.min(n - 1, cesIdx + 1);
  cesAfficher();
}

function cesRechercher() {
  const q = (prompt("Rechercher (n° d'immobilisation ou désignation) :") || "").trim().toLowerCase();
  if (!q) return;
  const idx = cesListe().findIndex(i => String(i.id) === q || String(i.designation).toLowerCase().includes(q));
  if (idx < 0) { afficherToast("Aucun bien trouvé", "error"); return; }
  cesIdx = idx;
  cesAfficher();
}

function cesTypeChange() {
  if ($s("ces-type").value !== "C") $s("ces-prix").value = 0;
  $s("ces-prix").disabled = $s("ces-type").value !== "C";
  if ($s("ces-type").value !== "N" && !$s("ces-qte").value) $s("ces-qte").value = $s("ces-dispo").value;
}

function payloadImmoComplet(i, ov) {
  return Object.assign({
    client_id: i.client_id, exercice: i.exercice || EXERCICE_COURANT, code_inventaire: i.code_inventaire,
    designation: i.designation, categorie_id: i.categorie_id, service_id: i.service_id || null,
    date_acquisition: i.date_acquisition, date_mise_en_service: i.date_mise_en_service,
    valeur_brute: i.valeur_brute, duree_annees: i.duree_annees, taux_amortissement: i.taux_amortissement,
    mode_amortissement: i.mode_amortissement || "LINEAIRE", cumul_amort_anterieur: i.cumul_amort_anterieur || 0,
    fournisseur: i.fournisseur || "", num_facture: i.num_facture || "", emplacement: i.emplacement || "",
    notes: i.notes || "", statut: i.statut, quantite: i.quantite || 1, type_contrat: i.type_contrat || "CN",
    augmentation_valeur: i.augmentation_valeur || 0
  }, ov || {});
}

async function cesEnregistrer() {
  const i = cesListe()[cesIdx];
  if (!i) return;
  const type = $s("ces-type").value;
  const date = $s("ces-date").value;
  const dispo = i.quantite || 1;
  const qte = parseInt($s("ces-qte").value) || 0;
  const prix = type === "C" ? (parseFloat($s("ces-prix").value) || 0) : 0;
  if (type !== "C" && type !== "R") { alert("Choisissez le type de sortie : C (cession) ou R (retrait / mise au rebut)."); return; }
  if (!date) { alert("Renseignez la date de sortie."); return; }
  if (qte < 1 || qte > dispo) { alert(`La quantité sortie doit être comprise entre 1 et ${dispo}.`); return; }
  if (!confirm(`Confirmer ${type === "C" ? "la cession" : "le retrait"} de ${qte} × « ${i.designation} » au ${formaterDateFR(date)} ?`)) return;

  const sortie = { statut: type === "C" ? "CEDE" : "REBUT", date_sortie: date, prix_cession: prix, motif_sortie: "" };
  let idSortie = i.id;
  try {
    if (qte < dispo) {
      // Sortie partielle : le bien est scindé en une ligne sortie et une ligne restante
      const vSortie = Math.round(i.valeur_brute * qte / dispo);
      const aSortie = Math.round((i.cumul_amort_anterieur || 0) * qte / dispo);
      let n = appState.immobilisations.length + 1, code;
      do { code = `${i.code_inventaire}-S${n++}`; } while (appState.immobilisations.some(x => x.code_inventaire === code));
      const restant = payloadImmoComplet(i, { quantite: dispo - qte, valeur_brute: i.valeur_brute - vSortie, cumul_amort_anterieur: (i.cumul_amort_anterieur || 0) - aSortie });
      const sorti = payloadImmoComplet(i, { code_inventaire: code, quantite: qte, valeur_brute: vSortie, cumul_amort_anterieur: aSortie, statut: "EN_SERVICE" });
      if (isBackendOnline) {
        await verifierReponse(await apiFetch(`${API_BASE}/api/immobilisations/${i.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(restant) }));
        const r = await verifierReponse(await apiFetch(`${API_BASE}/api/immobilisations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sorti) }));
        idSortie = (await r.json()).id;
      } else {
        Object.assign(i, restant);
        idSortie = Date.now();
        appState.immobilisations.push({ ...sorti, id: idSortie });
      }
    }
    if (isBackendOnline) {
      await verifierReponse(await apiFetch(`${API_BASE}/api/immobilisations/${idSortie}/sortie`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sortie) }));
    } else {
      Object.assign(appState.immobilisations.find(x => x.id == idSortie), sortie);
      sauvegarderLocalement();
    }
  } catch (err) {
    alert("Enregistrement de la sortie impossible : " + err.message);
    await chargerDonnees();
    cesAfficher();
    return;
  }
  await chargerDonnees();
  cesAfficher();
  afficherToast(type === "C" ? "Cession enregistrée" : "Retrait enregistré", "warning");
}
