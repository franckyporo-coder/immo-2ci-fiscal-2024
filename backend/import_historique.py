"""
Import de l'historique des anciennes bases Access (.mdb) dans l'application.

Chaque base Access contient un exercice (table Tperiode) et les immobilisations d'une ou plusieurs
sociétés (table Immobilisation, colonne Ncomtcli = n° de contribuable de la société).
L'importeur :
  1. parcourt tout le dossier (sous-dossiers compris) et lit chaque .mdb ;
  2. regroupe les lignes par (société, exercice) ;
  3. quand plusieurs fichiers donnent la même société/année (copies, sauvegardes...), retient le plus
     fiable : jamais une « Copie »/« Sauvegarde »/« FAUX »..., de préférence la base dont c'est la société
     principale, puis la plus récente, puis la plus fournie ;
  4. crée les sociétés manquantes et les exercices (statut HISTORIQUE, le plus récent = OUVERT) ;
  5. ne touche jamais à un exercice saisi directement dans l'application ;
  6. produit un rapport (fichier CSV) listant la source retenue et les alternatives écartées.

Usage :  python backend/import_historique.py "C:\\...\\IMMOBILISATIONS" [--simulation]
"""

import os
import re
import sys
import csv
import unicodedata
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from mdb_reader import MdbFile
from database import init_db, get_db_connection
from calculations import calculer_situation_exercice

COPIE_RE = re.compile(r"copie|sauvegarde|backup|\bbak\b|faux|a voir|ancien|\bold\b", re.I)
ANNEE_DOSSIER_RE = re.compile(r"IMMO\s*(\d{4})", re.I)


# ------------------------------------------------------------------ utilitaires
def normaliser_nif(code):
    return re.sub(r"\s+", "", str(code or "")).upper()


def sans_accents(texte):
    return "".join(c for c in unicodedata.normalize("NFD", texte) if unicodedata.category(c) != "Mn")


def slug_code(nom):
    s = sans_accents(nom or "").upper()
    s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
    return (s or "SOCIETE")[:20]


def to_date_str(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def nombre(v, defaut=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return defaut


# ------------------------------------------------------------------ lecture d'un fichier
def analyser_fichier(chemin, racine):
    rel = os.path.relpath(chemin, racine)
    db = MdbFile(chemin)
    tables = db.tables()
    if "Immobilisation" not in tables:
        raise ValueError("table « Immobilisation » absente")

    annee = None
    if "Tperiode" in tables:
        for r in db.rows("Tperiode"):
            try:
                a = int(float(r.get("Numexo")))
                if 2000 <= a <= 2100:
                    annee = a
                    break
            except (TypeError, ValueError):
                pass
    m = ANNEE_DOSSIER_RE.search(rel)
    annee_dossier = int(m.group(1)) if m else None
    if annee is None:
        annee = annee_dossier

    clients = {}
    if "Tclient" in tables:
        for r in db.rows("Tclient"):
            clients[normaliser_nif(r.get("Ncomtcli"))] = r
    comptes = {}
    if "compteparclient" in tables:
        for r in db.rows("compteparclient"):
            comptes[(normaliser_nif(r.get("ncomtcli")), str(r.get("Numcpte") or "").strip())] = (r.get("Designation") or "").strip()

    groupes = {}
    for r in db.rows("Immobilisation"):
        nif = normaliser_nif(r.get("Ncomtcli"))
        if nif:
            groupes.setdefault(nif, []).append(r)
    principal = max(groupes, key=lambda k: len(groupes[k])) if groupes else None

    return {
        "rel": rel, "chemin": chemin, "annee": annee, "annee_dossier": annee_dossier,
        "mtime": os.path.getmtime(chemin), "clients": clients, "comptes": comptes,
        "groupes": groupes, "principal": principal, "copie": bool(COPIE_RE.search(rel)),
    }


def choisir_sources(analyses):
    """Pour chaque (société, exercice) : la meilleure source + la liste des alternatives écartées."""
    candidats = {}
    for a in analyses:
        if not a["annee"]:
            continue
        for nif, rows in a["groupes"].items():
            candidats.setdefault((nif, a["annee"]), []).append({
                "analyse": a, "nif": nif, "rows": rows,
                "cle": (not a["copie"], a["principal"] == nif, a["mtime"], len(rows)),
            })
    choix = {}
    for cle, lst in candidats.items():
        lst.sort(key=lambda c: c["cle"], reverse=True)
        choix[cle] = {"retenu": lst[0], "ecartes": lst[1:]}
    return choix


# ------------------------------------------------------------------ import en base
class Importeur:
    def __init__(self, conn, simulation=False):
        self.conn = conn
        self.simulation = simulation
        self.cats = {r["code"]: r["id"] for r in conn.execute("SELECT id, code FROM categories")}
        self.codes_cats = sorted(self.cats, key=len, reverse=True)
        self.nb_cats_creees = 0
        self.clients = {}
        for r in conn.execute("SELECT id, nif_ncc FROM clients"):
            if r["nif_ncc"]:
                self.clients[normaliser_nif(r["nif_ncc"])] = r["id"]
        self.codes_clients = {r["code"] for r in conn.execute("SELECT code FROM clients")}
        self.nb_clients_crees = 0

    def categorie(self, numcpte, designation, duree):
        numcpte = (numcpte or "").strip()
        for code in self.codes_cats:
            if numcpte.startswith(code):
                return self.cats[code]
        code = (numcpte[:3] or "999")
        if code in self.cats:
            return self.cats[code]
        if self.simulation:
            self.cats[code] = -1
            self.codes_cats = sorted(self.cats, key=len, reverse=True)
            self.nb_cats_creees += 1
            return -1
        duree = int(duree) if duree and duree > 0 else 5
        immo = numcpte.ljust(6, "0")[:6]
        amort = ("28" + code[1:]).ljust(6, "0")[:6]
        cur = self.conn.execute(
            """INSERT INTO categories (code, libelle, compte_immo, compte_amort, compte_dotation, duree_defaut, taux_defaut, mode_defaut)
               VALUES (?, ?, ?, ?, '6812', ?, ?, 'LINEAIRE')""",
            (code, designation or f"Compte {code} (importé d'Access)", immo, amort, duree, round(100.0 / duree, 2)))
        self.cats[code] = cur.lastrowid
        self.codes_cats = sorted(self.cats, key=len, reverse=True)
        self.nb_cats_creees += 1
        return cur.lastrowid

    def client(self, nif, info, nom_dossier):
        if nif in self.clients:
            return self.clients[nif]
        nom = (info.get("Raicli") or "").strip() if info else ""
        nom = nom or nom_dossier or nif
        code = slug_code(info.get("Sigcli") or nom if info else nom)
        base, n = code, 2
        while code in self.codes_clients:
            code = f"{base[:17]}_{n}"
            n += 1
        self.codes_clients.add(code)
        self.nb_clients_crees += 1
        if self.simulation:
            self.clients[nif] = -len(self.clients) - 1
            return self.clients[nif]
        adresse = " ".join(x for x in [(info or {}).get("Geocli"), (info or {}).get("Bpcli"), (info or {}).get("Villecli")] if x)
        cur = self.conn.execute(
            """INSERT INTO clients (code, nom, nif_ncc, regime_fiscal, devise, secteur, adresse, contact, telephone, email)
               VALUES (?, ?, ?, 'Réel Normal', 'FCFA', '', ?, ?, ?, '')""",
            (code, nom, nif, adresse, (info or {}).get("Nompre") or "", (info or {}).get("Telcli") or ""))
        self.clients[nif] = cur.lastrowid
        return cur.lastrowid


def convertir_lignes(imp, rows, annee, nif, comptes):
    """Lignes Access -> dicts prêts pour la table immobilisations + statistiques de contrôle."""
    out, utilises = [], set()
    ignorees = 0
    ecart_annuite = 0.0
    total_annuite = 0.0
    total_dot = 0.0
    for i, r in enumerate(rows, 1):
        valeur = r.get("Valimo")
        if valeur is None:
            ignorees += 1
            continue
        remarques = []
        numcpte = str(r.get("Numcpte") or "").strip()
        d_ms, d_acq = to_date_str(r.get("Datmes")), to_date_str(r.get("Datacq"))
        if not d_ms and not d_acq:
            d_ms = d_acq = f"{annee}-01-01"
            remarques.append("dates absentes dans Access : 01/01 de l'exercice retenu")
        d_ms, d_acq = d_ms or d_acq, d_acq or d_ms

        dur = nombre(r.get("Durimo"), 0)
        duree = int(round(dur)) if dur and dur > 0 else 0
        cat_id = imp.categorie(numcpte, comptes.get((nif, numcpte)), duree)
        if not duree:
            duree = 5
            remarques.append("durée absente : 5 ans par défaut")

        typ = (r.get("Typsort") or "N").strip().upper()
        statut, d_sortie, prix = "EN_SERVICE", None, 0.0
        if typ in ("C", "S"):
            statut = "CEDE" if typ == "C" else "REBUT"
            d_sortie = to_date_str(r.get("Datsort"))
            if not d_sortie:
                d_sortie = f"{annee}-12-31"
                remarques.append("date de sortie absente dans Access : 31/12 de l'exercice retenu")
            prix = nombre(r.get("Prices"), 0.0)

        grp = str(r.get("numgroup") or "").strip()
        base = f"{numcpte}-{grp}" if grp else f"{numcpte}-L{i}"
        code, n = base, 2
        while code in utilises:
            code = f"{base}#{n}"
            n += 1
        utilises.add(code)

        qte = nombre(r.get("Qteacq"), 1)
        if qte and qte != 1:
            remarques.append(f"quantité acquise : {qte:g}")
        if r.get("Contrat") and str(r.get("Contrat")).strip() not in ("CN", ""):
            remarques.append(f"contrat : {str(r.get('Contrat')).strip()}")
        annuite = nombre(r.get("Annuite"), 0.0)
        remarques.append(f"annuité Access : {annuite:,.0f}".replace(",", " "))

        ligne = {
            "code_inventaire": code,
            "designation": (r.get("Desimmo") or "").strip() or "(sans désignation)",
            "categorie_id": cat_id, "date_acquisition": d_acq, "date_mise_en_service": d_ms,
            "valeur_brute": float(valeur), "duree_annees": duree, "taux_amortissement": round(100.0 / duree, 4),
            "cumul_amort_anterieur": nombre(r.get("Anterieur"), 0.0), "statut": statut,
            "date_sortie": d_sortie, "prix_cession": prix,
            "motif_sortie": "Importé d'Access" if d_sortie else None,
            "notes": "Import Access · " + " · ".join(remarques),
        }
        out.append(ligne)
        calc = calculer_situation_exercice(ligne, annee)
        total_annuite += annuite
        total_dot += calc["dotation"]
        if abs(annuite - calc["dotation"]) > 1:
            ecart_annuite += 1
    return out, ignorees, total_annuite, total_dot, int(ecart_annuite)


def importer(dossier, simulation=False, journal=print):
    """Importe tout le dossier. Retourne un rapport (dict)."""
    init_db()
    fichiers = []
    for racine, _, noms in os.walk(dossier):
        for n in noms:
            if n.lower().endswith(".mdb"):
                fichiers.append(os.path.join(racine, n))
    fichiers.sort()

    analyses, erreurs = [], []
    for k, f in enumerate(fichiers, 1):
        try:
            analyses.append(analyser_fichier(f, dossier))
        except Exception as e:
            erreurs.append({"fichier": os.path.relpath(f, dossier), "erreur": str(e)})
        if k % 20 == 0:
            journal(f"  … {k}/{len(fichiers)} fichiers lus")

    choix = choisir_sources(analyses)
    conn = get_db_connection()
    imp = Importeur(conn, simulation)
    maintenant = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dossiers = []
    clients_touches = set()

    for (nif, annee), c in sorted(choix.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        a = c["retenu"]["analyse"]
        info = a["clients"].get(nif)
        nom_dossier = None
        client_id = imp.client(nif, info, nom_dossier)
        nom = ((info or {}).get("Raicli") or nif).strip()
        ligne_rapport = {
            "societe": nom, "nif": nif, "exercice": annee, "source": a["rel"],
            "ecartes": " | ".join(e["analyse"]["rel"] for e in c["ecartes"]),
            "lignes": 0, "ignorees": 0, "annuite_access": 0.0, "dotation_calculee": 0.0, "lignes_en_ecart": 0, "resultat": "",
        }
        existant = None if client_id < 0 else conn.execute(
            "SELECT source FROM exercices WHERE client_id = ? AND annee = ?", (client_id, annee)).fetchone()
        if existant is not None and existant["source"] is None:
            ligne_rapport["resultat"] = "IGNORE : exercice déjà saisi dans l'application"
            dossiers.append(ligne_rapport)
            continue

        lignes, ignorees, tot_ann, tot_dot, ecarts = convertir_lignes(imp, c["retenu"]["rows"], annee, nif, a["comptes"])
        ligne_rapport.update(lignes=len(lignes), ignorees=ignorees, annuite_access=round(tot_ann, 2),
                             dotation_calculee=round(tot_dot, 2), lignes_en_ecart=ecarts)
        if not lignes:
            ligne_rapport["resultat"] = "IGNORE : aucune ligne exploitable"
            dossiers.append(ligne_rapport)
            continue
        if not simulation:
            conn.execute("DELETE FROM immobilisations WHERE client_id = ? AND exercice = ?", (client_id, annee))
            conn.executemany(
                """INSERT INTO immobilisations (client_id, exercice, code_inventaire, designation, categorie_id,
                       date_acquisition, date_mise_en_service, valeur_brute, duree_annees, taux_amortissement,
                       mode_amortissement, cumul_amort_anterieur, statut, date_sortie, prix_cession, motif_sortie, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LINEAIRE', ?, ?, ?, ?, ?, ?)""",
                [(client_id, annee, l["code_inventaire"], l["designation"], l["categorie_id"], l["date_acquisition"],
                  l["date_mise_en_service"], l["valeur_brute"], l["duree_annees"], l["taux_amortissement"],
                  l["cumul_amort_anterieur"], l["statut"], l["date_sortie"], l["prix_cession"], l["motif_sortie"],
                  l["notes"]) for l in lignes])
            conn.execute(
                """INSERT INTO exercices (client_id, annee, statut, source, date_import) VALUES (?, ?, 'HISTORIQUE', ?, ?)
                   ON CONFLICT(client_id, annee) DO UPDATE SET statut = 'HISTORIQUE', source = excluded.source, date_import = excluded.date_import""",
                (client_id, annee, a["rel"], maintenant))
            clients_touches.add(client_id)
        ligne_rapport["resultat"] = "SIMULATION" if simulation else "IMPORTE"
        dossiers.append(ligne_rapport)

    if not simulation:
        # Pour chaque société : l'année la plus récente devient « ouverte » (si importée d'Access), les autres « historique »
        for cid in clients_touches:
            annees = [r["annee"] for r in conn.execute("SELECT annee FROM exercices WHERE client_id = ?", (cid,))]
            derniere = max(annees)
            conn.execute("""UPDATE exercices SET statut = CASE WHEN annee = ? THEN 'OUVERT' ELSE 'HISTORIQUE' END
                            WHERE client_id = ? AND source IS NOT NULL AND statut IN ('HISTORIQUE', 'OUVERT')""", (derniere, cid))
        conn.commit()
    conn.close()

    rapport = {
        "simulation": simulation, "fichiers_lus": len(analyses), "fichiers_en_erreur": erreurs,
        "societes_creees": imp.nb_clients_crees, "categories_creees": imp.nb_cats_creees,
        "exercices": dossiers,
        "importes": sum(1 for d in dossiers if d["resultat"] in ("IMPORTE", "SIMULATION")),
        "ignores": sum(1 for d in dossiers if d["resultat"].startswith("IGNORE")),
        "lignes_total": sum(d["lignes"] for d in dossiers if d["resultat"] in ("IMPORTE", "SIMULATION")),
    }
    return rapport


def ecrire_rapport_csv(rapport, chemin):
    with open(chemin, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Société", "N° contribuable", "Exercice", "Résultat", "Lignes importées", "Lignes sans valeur ignorées",
                    "Σ annuités Access", "Σ dotations recalculées", "Lignes en écart", "Fichier retenu", "Fichiers écartés"])
        for d in rapport["exercices"]:
            w.writerow([d["societe"], d["nif"], d["exercice"], d["resultat"], d["lignes"], d["ignorees"],
                        f'{d["annuite_access"]:.0f}', f'{d["dotation_calculee"]:.0f}', d["lignes_en_ecart"], d["source"], d["ecartes"]])
        for e in rapport["fichiers_en_erreur"]:
            w.writerow(["", "", "", "FICHIER ILLISIBLE", "", "", "", "", "", e["fichier"], e["erreur"]])


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args or not os.path.isdir(args[0].strip('"')):
        print("Usage : python import_historique.py \"CHEMIN\\DU\\DOSSIER\\IMMOBILISATIONS\" [--simulation]")
        sys.exit(1)
    simu = "--simulation" in sys.argv
    print(f"Lecture des bases Access dans : {args[0]}")
    rap = importer(args[0].strip('"'), simulation=simu)
    nom_csv = os.path.join(CURRENT_DIR, f"rapport_import_{datetime.now():%Y%m%d_%H%M%S}.csv")
    ecrire_rapport_csv(rap, nom_csv)
    print()
    print(("SIMULATION (rien n'a été écrit) — " if simu else "") +
          f"{rap['fichiers_lus']} fichier(s) lus · {rap['importes']} exercice(s) société importé(s) · "
          f"{rap['lignes_total']} immobilisations · {rap['societes_creees']} société(s) créée(s) · "
          f"{rap['categories_creees']} catégorie(s) créée(s) · {rap['ignores']} ignoré(s) · "
          f"{len(rap['fichiers_en_erreur'])} fichier(s) illisible(s)")
    print("Rapport détaillé :", nom_csv)
