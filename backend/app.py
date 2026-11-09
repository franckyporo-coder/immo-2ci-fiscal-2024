"""
Serveur Web et API REST pour SAGI IMMO FISCAL.
Fonctionne avec la seule bibliothèque standard Python (aucune dépendance externe).

Sécurité : connexion obligatoire (jeton « Bearer »), droits par société et par exercice
appliqués ici, côté serveur (le masquage de boutons côté navigateur n'est qu'un confort).
"""

import sys
import os
import json
import mimetypes
import threading
import webbrowser
import traceback
from urllib.parse import urlparse, parse_qs, unquote
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from database import init_db, get_db_connection
from calculations import generer_plan_amortissement, calculer_situation_exercice, parse_date
import securite as sec


class ApiError(Exception):
    def __init__(self, message, status=400, code=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


# ====================================================================== utilitaires droits
def exiger_admin(user):
    if user["role"] != "ADMIN":
        raise ApiError("Action réservée aux administrateurs.", 403)


def exiger_droit(conn, user, client_id, annee, minimum):
    niveau = sec.niveau_droit(conn, user, client_id, annee)
    if not sec.niveau_au_moins(niveau, minimum):
        noms = {"LECTURE": "consulter", "ECRITURE": "modifier", "GESTION": "gérer (sorties, suppressions, clôture)"}
        raise ApiError(f"Droits insuffisants : vous n'avez pas le droit de {noms.get(minimum, minimum)} ce dossier pour cet exercice.", 403)
    return niveau


def exiger_exercice_modifiable(conn, client_id, annee):
    """Un exercice clôturé est figé : plus aucune saisie, modification, sortie ni suppression (même pour un admin)."""
    ex = conn.execute("SELECT statut FROM exercices WHERE client_id = ? AND annee = ?", (client_id, annee)).fetchone()
    if not ex:
        raise ApiError(f"L'exercice {annee} n'existe pas pour ce dossier.", 400)
    if ex["statut"] == "CLOTURE":
        raise ApiError(f"L'exercice {annee} est clôturé : il est figé et ne peut plus être modifié.", 403)


def exiger_gestion_si_sortie(conn, user, client_id, annee, statut):
    """Passer un bien en « cédé / rebut » est une sortie d'actif : cela demande le niveau Gestion, pas seulement Écriture."""
    if statut not in (None, "", "EN_SERVICE"):
        exiger_droit(conn, user, client_id, annee, "GESTION")


def exercices_client(conn, client_id):
    return [dict(r) for r in conn.execute(
        "SELECT annee, statut, source FROM exercices WHERE client_id = ? ORDER BY annee DESC", (client_id,))]


def exercice_courant_client(conn, client_id, user=None):
    """Exercice ouvert le plus récent ; sinon le plus récent accessible."""
    exs = exercices_client(conn, client_id)
    if user is not None:
        exs = [e for e in exs if sec.niveau_droit(conn, user, client_id, e["annee"]) != "AUCUN"]
    ouverts = [e["annee"] for e in exs if e["statut"] == "OUVERT"]
    if ouverts:
        return max(ouverts)
    return exs[0]["annee"] if exs else None


def entier(valeur, defaut=None):
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return defaut


def param_client_exercice(conn, query):
    client_id = entier((query.get("client_id") or [None])[0])
    if client_id is None:
        raise ApiError("Paramètre client_id manquant.", 400)
    annee = entier((query.get("exercice") or [None])[0])
    if annee is None:
        annee = exercice_courant_client(conn, client_id)
    return client_id, annee


COLONNES_IMMO = (
    "client_id", "exercice", "code_inventaire", "designation", "categorie_id", "service_id",
    "date_acquisition", "date_mise_en_service", "valeur_brute", "duree_annees", "taux_amortissement",
    "mode_amortissement", "cumul_amort_anterieur", "statut", "date_sortie", "prix_cession",
    "motif_sortie", "fournisseur", "num_facture", "emplacement", "notes",
    "quantite", "type_contrat", "augmentation_valeur",
)

SELECT_IMMO = """
    SELECT i.*, c.code as cat_code, c.libelle as cat_libelle, c.compte_immo, c.a_amortir,
           s.nom as service_nom, cl.nom as client_nom
    FROM immobilisations i
    LEFT JOIN categories c ON i.categorie_id = c.id
    LEFT JOIN services s ON i.service_id = s.id
    LEFT JOIN clients cl ON i.client_id = cl.id
"""


class SagiAPIHandler(BaseHTTPRequestHandler):

    server_version = "SAGI/2.0"

    # ------------------------------------------------------------------ réponses
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self._cors()
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def _read_json_body(self):
        n = int(self.headers.get('Content-Length', 0))
        if n > 0:
            return json.loads(self.rfile.read(n).decode('utf-8'))
        return {}

    @staticmethod
    def _maj_champs_immo(cursor, immo_id, data):
        """Champs de la fiche « Saisir des immobilisations » : mis à jour seulement s'ils sont fournis."""
        if "quantite" in data:
            cursor.execute("UPDATE immobilisations SET quantite = ? WHERE id = ?", (max(1, int(float(data.get("quantite") or 1))), immo_id))
        if "type_contrat" in data:
            tc = str(data.get("type_contrat") or "CN").upper()
            cursor.execute("UPDATE immobilisations SET type_contrat = ? WHERE id = ?", (tc if tc in ("CN", "CI", "CM", "CA") else "CN", immo_id))
        if "augmentation_valeur" in data:
            cursor.execute("UPDATE immobilisations SET augmentation_valeur = ? WHERE id = ?", (float(data.get("augmentation_valeur") or 0), immo_id))

    @staticmethod
    def _maj_champs_compte(cursor, cat_id, data):
        """Champs de la fiche « Mise à jour des comptes » : mis à jour seulement s'ils sont fournis."""
        champs = {"a_amortir": "O", "poste": "", "compte_vcn": "811", "compte_prod_cession": "821"}
        for nom, defaut in champs.items():
            if nom in data:
                val = str(data.get(nom) or defaut).strip()
                if nom == "a_amortir":
                    val = "N" if val.upper() == "N" else "O"
                cursor.execute(f"UPDATE categories SET {nom} = ? WHERE id = ?", (val, cat_id))

    def _send_json(self, data, status=200):
        self._set_headers(status, "application/json; charset=utf-8")
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def _send_error_json(self, message, status=400, code=None):
        payload = {"error": True, "message": message}
        if code:
            payload["code"] = code
        self._send_json(payload, status)

    def log_message(self, fmt, *args):
        pass  # console silencieuse

    # ------------------------------------------------------------------ entrées HTTP
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _dispatch(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            if method == "GET":
                self.serve_static_file(path)
            else:
                self._send_error_json("Route non trouvée", 404)
            return

        conn = None
        try:
            query = parse_qs(parsed.query)
            data = self._read_json_body() if method in ("POST", "PUT") else {}
            conn = get_db_connection()
            self.route(conn, method, path, query, data)
        except ApiError as e:
            self._send_error_json(e.message, e.status, e.code)
        except json.JSONDecodeError:
            self._send_error_json("Corps de requête JSON invalide.", 400)
        except KeyError as e:
            self._send_error_json(f"Champ obligatoire manquant : {e}", 400)
        except Exception as e:
            traceback.print_exc()
            self._send_error_json(str(e), 500)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    # ------------------------------------------------------------------ authentification
    def _token(self):
        h = self.headers.get('Authorization', '')
        return h[7:].strip() if h.lower().startswith('bearer ') else None

    def route(self, conn, method, path, query, data):
        # --- routes publiques
        if method == "GET" and path == "/api/status":
            # Route publique : on ne révèle rien sur les données (pas de paramètres, pas de noms de sociétés)
            self._send_json({"status": "ok", "app": "SAGI IMMO FISCAL", "auth_requise": True})
            return
        if method == "POST" and path == "/api/login":
            return self.api_login(conn, data)

        # --- à partir d'ici : connexion obligatoire
        user = sec.utilisateur_depuis_token(conn, self._token())
        if not user:
            raise ApiError("Session expirée ou non connectée.", 401, "NON_CONNECTE")

        if path == "/api/logout" and method == "POST":
            sec.supprimer_session(conn, self._token())
            self._send_json({"success": True})
            return
        if path == "/api/me" and method == "GET":
            self._send_json(sec.utilisateur_public(user))
            return
        if path == "/api/changer-mot-de-passe" and method == "POST":
            return self.api_changer_mdp(conn, user, data)

        if user["doit_changer_mdp"]:
            raise ApiError("Vous devez d'abord changer votre mot de passe.", 403, "MDP_A_CHANGER")

        if path.startswith("/api/utilisateurs"):
            exiger_admin(user)
            return self.api_utilisateurs(conn, user, method, path, data)
        if path == "/api/navigation" and method == "GET":
            return self.api_navigation(conn, user)
        if path == "/api/import-historique" and method == "POST":
            exiger_admin(user)
            return self.api_import_historique(conn, user, data)

        if method == "GET":
            return self.handle_api_get(conn, user, path, query)
        if method == "POST":
            return self.handle_api_post(conn, user, path, data)
        if method == "PUT":
            return self.handle_api_put(conn, user, path, data)
        if method == "DELETE":
            return self.handle_api_delete(conn, user, path)
        raise ApiError("Route non trouvée", 404)

    def api_login(self, conn, data):
        login = (data.get("login") or "").strip()
        mdp = data.get("mot_de_passe") or ""
        attente = sec.est_bloque(login)
        if attente:
            raise ApiError(f"Trop d'échecs de connexion. Réessayez dans {attente // 60 + 1} minute(s).", 429)
        row = conn.execute("SELECT * FROM utilisateurs WHERE lower(login) = lower(?)", (login,)).fetchone()
        if not row:
            sec.hasher_mdp(mdp)   # même temps de réponse qu'un identifiant valide : on ne révèle pas quels comptes existent
        if not row or not row["actif"] or not sec.verifier_mdp(mdp, row["mdp_sel"], row["mdp_hash"]):
            sec.noter_echec(login)
            raise ApiError("Identifiant ou mot de passe incorrect.", 401)
        sec.effacer_echecs(login)
        token = sec.creer_session(conn, row["id"])
        self._send_json({"token": token, "utilisateur": sec.utilisateur_public(dict(row))})

    def api_changer_mdp(self, conn, user, data):
        row = conn.execute("SELECT * FROM utilisateurs WHERE id = ?", (user["id"],)).fetchone()
        actuel, nouveau = data.get("actuel") or "", data.get("nouveau") or ""
        if not sec.verifier_mdp(actuel, row["mdp_sel"], row["mdp_hash"]):
            raise ApiError("Le mot de passe actuel est incorrect.", 400)
        if len(nouveau) < sec.MDP_MIN:
            raise ApiError(f"Le nouveau mot de passe doit contenir au moins {sec.MDP_MIN} caractères.", 400)
        if nouveau == actuel:
            raise ApiError("Le nouveau mot de passe doit être différent de l'ancien.", 400)
        if nouveau.lower() in ("admin", "password", "motdepasse", "123456", row["login"].lower()):
            raise ApiError("Ce mot de passe est trop facile à deviner : choisissez-en un autre.", 400)
        sel, h = sec.hasher_mdp(nouveau)
        conn.execute("UPDATE utilisateurs SET mdp_sel = ?, mdp_hash = ?, doit_changer_mdp = 0 WHERE id = ?", (sel, h, user["id"]))
        # Les autres sessions ouvertes avec l'ancien mot de passe sont fermées (celle-ci reste active)
        sec.supprimer_autres_sessions(conn, user["id"], self._token())
        conn.commit()
        self._send_json({"success": True, "message": "Mot de passe modifié."})

    # ------------------------------------------------------------------ utilisateurs & droits (admin)
    def api_utilisateurs(self, conn, admin, method, path, data):
        parts = path.strip("/").split("/")   # ['api','utilisateurs', id?, 'droits'?]
        uid = entier(parts[2]) if len(parts) > 2 else None

        def nb_admins_actifs(sauf=None):
            q = "SELECT COUNT(*) FROM utilisateurs WHERE role = 'ADMIN' AND actif = 1"
            args = ()
            if sauf:
                q += " AND id != ?"
                args = (sauf,)
            return conn.execute(q, args).fetchone()[0]

        if uid is None:
            if method == "GET":
                rows = conn.execute("SELECT id, login, nom, role, actif, doit_changer_mdp, created_at FROM utilisateurs ORDER BY login").fetchall()
                self._send_json([dict(r) for r in rows])
                return
            if method == "POST":
                login = (data.get("login") or "").strip()
                nom = (data.get("nom") or "").strip()
                mdp = data.get("mot_de_passe") or ""
                role = data.get("role") if data.get("role") in ("ADMIN", "UTILISATEUR") else "UTILISATEUR"
                if not login or not nom:
                    raise ApiError("Identifiant et nom obligatoires.", 400)
                if len(mdp) < sec.MDP_MIN:
                    raise ApiError(f"Le mot de passe initial doit contenir au moins {sec.MDP_MIN} caractères.", 400)
                if conn.execute("SELECT 1 FROM utilisateurs WHERE lower(login) = lower(?)", (login,)).fetchone():
                    raise ApiError("Cet identifiant existe déjà.", 400)
                sel, h = sec.hasher_mdp(mdp)
                cur = conn.execute(
                    "INSERT INTO utilisateurs (login, nom, role, actif, mdp_sel, mdp_hash, doit_changer_mdp) VALUES (?, ?, ?, ?, ?, ?, 1)",
                    (login, nom, role, 1 if data.get("actif", 1) in (1, True, "1") else 0, sel, h))
                conn.commit()
                self._send_json({"success": True, "id": cur.lastrowid, "message": "Utilisateur créé."})
                return
            raise ApiError("Route non trouvée", 404)

        cible = conn.execute("SELECT * FROM utilisateurs WHERE id = ?", (uid,)).fetchone()
        if not cible:
            raise ApiError("Utilisateur introuvable.", 404)

        # ---- droits
        if len(parts) > 3 and parts[3] == "droits":
            if method == "GET":
                rows = conn.execute("SELECT client_id, exercice, niveau FROM droits WHERE user_id = ?", (uid,)).fetchall()
                self._send_json({"utilisateur": {"id": uid, "login": cible["login"], "nom": cible["nom"], "role": cible["role"]},
                                 "droits": [{"client_id": r["client_id"], "exercice": (r["exercice"] or None), "niveau": r["niveau"]} for r in rows]})
                return
            if method == "PUT":
                nouveaux = data.get("droits") or []
                lignes = []
                for d in nouveaux:
                    niveau = d.get("niveau")
                    if niveau not in sec.NIVEAUX:
                        raise ApiError(f"Niveau de droit invalide : {niveau}", 400)
                    cid = entier(d.get("client_id"))
                    if cid is None:
                        raise ApiError("client_id manquant dans un droit.", 400)
                    lignes.append((uid, cid, entier(d.get("exercice"), 0) or 0, niveau))
                conn.execute("DELETE FROM droits WHERE user_id = ?", (uid,))
                conn.executemany("INSERT OR REPLACE INTO droits (user_id, client_id, exercice, niveau) VALUES (?, ?, ?, ?)", lignes)
                conn.commit()
                self._send_json({"success": True, "message": f"{len(lignes)} droit(s) enregistré(s)."})
                return
            raise ApiError("Route non trouvée", 404)

        # ---- utilisateur
        if method == "PUT":
            nom = (data.get("nom") or cible["nom"]).strip()
            role = data.get("role") if data.get("role") in ("ADMIN", "UTILISATEUR") else cible["role"]
            actif = 1 if data.get("actif", cible["actif"]) in (1, True, "1") else 0
            if uid == admin["id"] and (role != "ADMIN" or not actif):
                raise ApiError("Vous ne pouvez pas retirer vos propres droits d'administrateur ni vous désactiver.", 400)
            if cible["role"] == "ADMIN" and (role != "ADMIN" or not actif) and nb_admins_actifs(sauf=uid) == 0:
                raise ApiError("Il doit rester au moins un administrateur actif.", 400)
            conn.execute("UPDATE utilisateurs SET nom = ?, role = ?, actif = ? WHERE id = ?", (nom, role, actif, uid))
            nouveau_login = (data.get("login") or "").strip()
            if nouveau_login and nouveau_login.lower() != cible["login"].lower():
                if conn.execute("SELECT 1 FROM utilisateurs WHERE lower(login) = lower(?) AND id != ?", (nouveau_login, uid)).fetchone():
                    raise ApiError("Cet identifiant existe déjà.", 400)
                conn.execute("UPDATE utilisateurs SET login = ? WHERE id = ?", (nouveau_login, uid))
            mdp = data.get("mot_de_passe") or ""
            if mdp:
                if len(mdp) < sec.MDP_MIN:
                    raise ApiError(f"Le mot de passe doit contenir au moins {sec.MDP_MIN} caractères.", 400)
                sel, h = sec.hasher_mdp(mdp)
                conn.execute("UPDATE utilisateurs SET mdp_sel = ?, mdp_hash = ?, doit_changer_mdp = 1 WHERE id = ?", (sel, h, uid))
            if not actif or mdp:
                sec.supprimer_sessions_utilisateur(conn, uid)
            conn.commit()
            self._send_json({"success": True, "message": "Utilisateur mis à jour."})
            return
        if method == "DELETE":
            if uid == admin["id"]:
                raise ApiError("Vous ne pouvez pas supprimer votre propre compte.", 400)
            if cible["role"] == "ADMIN" and nb_admins_actifs(sauf=uid) == 0:
                raise ApiError("Il doit rester au moins un administrateur actif.", 400)
            conn.execute("DELETE FROM droits WHERE user_id = ?", (uid,))
            sec.supprimer_sessions_utilisateur(conn, uid)
            conn.execute("DELETE FROM utilisateurs WHERE id = ?", (uid,))
            conn.commit()
            self._send_json({"success": True, "message": "Utilisateur supprimé."})
            return
        raise ApiError("Route non trouvée", 404)

    # ------------------------------------------------------------------ navigation sociétés × années
    def api_navigation(self, conn, user):
        visibles = sec.clients_visibles_ids(conn, user)
        clients = conn.execute("SELECT id, code, nom, nif_ncc FROM clients ORDER BY nom COLLATE NOCASE").fetchall()
        stats = {}
        for r in conn.execute("""SELECT client_id, exercice, COUNT(*) AS nb,
                                        COALESCE(SUM(CASE WHEN statut = 'EN_SERVICE' THEN valeur_brute ELSE 0 END), 0) AS vb
                                 FROM immobilisations GROUP BY client_id, exercice"""):
            stats[(r["client_id"], r["exercice"])] = (r["nb"], r["vb"])
        exs = {}
        for r in conn.execute("SELECT client_id, annee, statut, source FROM exercices"):
            exs.setdefault(r["client_id"], []).append(dict(r))

        annees = set()
        resultat = []
        for c in clients:
            if visibles is not None and c["id"] not in visibles:
                continue
            cases = {}
            for e in exs.get(c["id"], []):
                droit = sec.niveau_droit(conn, user, c["id"], e["annee"])
                annees.add(e["annee"])
                if droit == "AUCUN":
                    cases[str(e["annee"])] = {"statut": e["statut"], "droit": "AUCUN", "verrou": True}
                else:
                    nb, vb = stats.get((c["id"], e["annee"]), (0, 0))
                    cases[str(e["annee"])] = {"statut": e["statut"], "droit": droit, "verrou": False,
                                              "nb_biens": nb, "total_vb": vb, "source": e["source"]}
            resultat.append({"id": c["id"], "code": c["code"], "nom": c["nom"], "nif_ncc": c["nif_ncc"], "cases": cases})
        self._send_json({"annees": sorted(annees, reverse=True), "clients": resultat})

    # ------------------------------------------------------------------ GET
    def handle_api_get(self, conn, user, path, query):
        cursor = conn.cursor()

        if path == "/api/exercices":
            client_id = entier((query.get('client_id') or [None])[0])
            if client_id is None:
                raise ApiError("Paramètre client_id manquant.", 400)
            detail = []
            for e in exercices_client(conn, client_id):
                droit = sec.niveau_droit(conn, user, client_id, e["annee"])
                if droit == "AUCUN":
                    continue
                nb = conn.execute("SELECT COUNT(*) FROM immobilisations WHERE client_id = ? AND exercice = ?", (client_id, e["annee"])).fetchone()[0]
                detail.append({"annee": e["annee"], "statut": e["statut"], "droit": droit, "source": e["source"], "nb_biens": nb})
            if not detail:
                raise ApiError("Aucun exercice accessible pour ce dossier avec vos droits.", 403)
            histo = [dict(r) for r in conn.execute(
                "SELECT * FROM exercices_historique WHERE client_id = ? ORDER BY exercice DESC", (client_id,))
                if sec.niveau_droit(conn, user, client_id, r["exercice"]) != "AUCUN"]
            self._send_json({
                "client_id": client_id,
                "exercice_courant": exercice_courant_client(conn, client_id, user),
                "exercices_disponibles": [d["annee"] for d in detail],
                "exercices_detail": detail,
                "historique": histo,
            })
            return

        if path == "/api/clients":
            visibles = sec.clients_visibles_ids(conn, user)
            res = []
            for c in conn.execute("SELECT * FROM clients ORDER BY nom COLLATE NOCASE").fetchall():
                if visibles is not None and c["id"] not in visibles:
                    continue
                d = dict(c)
                ex = exercice_courant_client(conn, c["id"], user)
                d["exercice_courant"] = ex
                nb, vb = 0, 0.0
                if ex is not None:
                    r = conn.execute("""SELECT COUNT(*), COALESCE(SUM(CASE WHEN statut = 'EN_SERVICE' THEN valeur_brute ELSE 0 END), 0)
                                        FROM immobilisations WHERE client_id = ? AND exercice = ?""", (c["id"], ex)).fetchone()
                    nb, vb = r[0], r[1]
                d["nb_immobilisations"] = nb
                d["total_valeur_brute"] = vb
                res.append(d)
            self._send_json(res)
            return

        if path == "/api/parametres":
            self._send_json([dict(r) for r in cursor.execute("SELECT cle, valeur FROM parametres ORDER BY cle ASC")])
            return

        if path == "/api/exercices-historique":
            client_id = entier((query.get('client_id') or [None])[0])
            if client_id is None:
                raise ApiError("Paramètre client_id manquant.", 400)
            histo = [dict(r) for r in cursor.execute("SELECT * FROM exercices_historique WHERE client_id = ? ORDER BY exercice DESC", (client_id,))
                     if sec.niveau_droit(conn, user, client_id, r["exercice"]) != "AUCUN"]
            self._send_json(histo)
            return

        if path == "/api/tables-stats":
            exiger_admin(user)

            def n(t):
                return cursor.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            self._send_json({"categories": n("categories"), "services": n("services"), "clients": n("clients"),
                             "immobilisations": n("immobilisations"), "exercices_historique": n("exercices_historique"),
                             "parametres": n("parametres")})
            return

        if path == "/api/categories":
            self._send_json([dict(r) for r in cursor.execute("SELECT * FROM categories ORDER BY code ASC")])
            return

        if path == "/api/services":
            self._send_json([dict(r) for r in cursor.execute("SELECT * FROM services ORDER BY nom ASC")])
            return

        if path == "/api/immobilisations":
            client_id, exercice = param_client_exercice(conn, query)
            exiger_droit(conn, user, client_id, exercice, "LECTURE")
            rows = cursor.execute(SELECT_IMMO + " WHERE i.client_id = ? AND i.exercice = ? ORDER BY i.date_acquisition DESC",
                                  (client_id, exercice)).fetchall()
            result = []
            for row in rows:
                immo = dict(row)
                immo['situation_2024'] = calculer_situation_exercice(immo, exercice)
                result.append(immo)
            self._send_json(result)
            return

        if path.startswith("/api/immobilisations/") and "/plan" in path:
            immo_id = int(path.strip("/").split("/")[2])
            row = cursor.execute("SELECT * FROM immobilisations WHERE id = ?", (immo_id,)).fetchone()
            if not row:
                raise ApiError("Immobilisation introuvable", 404)
            immo = dict(row)
            exiger_droit(conn, user, immo["client_id"], immo["exercice"], "LECTURE")
            plan = generer_plan_amortissement(immo['valeur_brute'], immo['date_mise_en_service'],
                                              immo['duree_annees'], immo['mode_amortissement'], immo['taux_amortissement'])
            self._send_json({"immo": immo, "plan": plan})
            return

        if path == "/api/dashboard":
            client_id, exercice = param_client_exercice(conn, query)
            exiger_droit(conn, user, client_id, exercice, "LECTURE")
            rows = cursor.execute(SELECT_IMMO + " WHERE i.client_id = ? AND i.exercice = ?", (client_id, exercice)).fetchall()
            tot = {"vb": 0.0, "dot": 0.0, "cumul": 0.0, "vnc": 0.0, "acq": 0.0, "ces": 0.0}
            repartition = {}
            for row in rows:
                immo = dict(row)
                calc = calculer_situation_exercice(immo, exercice)
                if immo['statut'] == 'EN_SERVICE':
                    tot["vb"] += immo['valeur_brute']
                    tot["vnc"] += calc['vnc_fin']
                    tot["cumul"] += calc['amort_fin']
                    nom = immo.get('cat_libelle') or "Autre"
                    repartition[nom] = repartition.get(nom, 0.0) + immo['valeur_brute']
                tot["dot"] += calc['dotation']
                tot["acq"] += calc['acquisition']
                tot["ces"] += calc['cession']
            self._send_json({
                "exercice": exercice, "total_actifs_en_service": tot["vb"], "total_dotation_exercice": tot["dot"],
                "total_cumul_amort": tot["cumul"], "total_vnc": tot["vnc"], "total_acquisitions": tot["acq"],
                "total_cessions": tot["ces"], "nombre_biens": len(rows), "repartition_categories": repartition})
            return

        if path == "/api/tableau-fiscal":
            client_id, exercice = param_client_exercice(conn, query)
            exiger_droit(conn, user, client_id, exercice, "LECTURE")
            rows = cursor.execute("""
                SELECT c.id as cat_id, c.code, c.libelle, c.compte_immo, c.compte_amort,
                       i.valeur_brute, i.cumul_amort_anterieur, i.duree_annees, i.taux_amortissement,
                       i.date_mise_en_service, i.date_sortie, i.statut, i.prix_cession
                FROM categories c
                LEFT JOIN immobilisations i ON i.categorie_id = c.id AND i.client_id = ? AND i.exercice = ?
                ORDER BY c.code ASC""", (client_id, exercice)).fetchall()
            champs = ("valeur_debut", "acquisitions", "cessions", "valeur_fin", "amort_debut", "dotations", "amort_sorties", "amort_fin", "vnc_fin")
            tableau = {}
            for row in rows:
                cid = row['cat_id']
                if cid not in tableau:
                    tableau[cid] = {"cat_id": cid, "code": row['code'], "libelle": row['libelle'],
                                    "compte_immo": row['compte_immo'], "compte_amort": row['compte_amort'],
                                    **{k: 0.0 for k in champs}}
                if row['valeur_brute'] is not None:
                    calc = calculer_situation_exercice(dict(row), exercice)
                    t = tableau[cid]
                    t["valeur_debut"] += calc["valeur_debut"]
                    t["acquisitions"] += calc["acquisition"]
                    t["cessions"] += calc["cession"]
                    t["valeur_fin"] += calc["valeur_fin"]
                    t["amort_debut"] += calc["amort_debut"]
                    t["dotations"] += calc["dotation"]
                    t["amort_sorties"] += calc["amort_sorties"]
                    t["amort_fin"] += calc["amort_fin"]
                    t["vnc_fin"] += calc["vnc_fin"]
            lignes = list(tableau.values())
            self._send_json({"exercice": exercice, "lignes": lignes,
                             "totaux": {k: sum(l[k] for l in lignes) for k in champs}})
            return

        raise ApiError("Route API non reconnue", 404)

    # ------------------------------------------------------------------ POST
    def handle_api_post(self, conn, user, path, data):
        cursor = conn.cursor()

        if path == "/api/immobilisations":
            client_id = entier(data.get('client_id'))
            if client_id is None:
                raise ApiError("client_id manquant.", 400)
            exercice = entier(data.get('exercice')) or exercice_courant_client(conn, client_id)
            exiger_droit(conn, user, client_id, exercice, "ECRITURE")
            exiger_exercice_modifiable(conn, client_id, exercice)
            exiger_gestion_si_sortie(conn, user, client_id, exercice, data.get('statut'))
            duree = int(data['duree_annees'])
            try:
                cursor.execute("""
                INSERT INTO immobilisations (
                    client_id, exercice, code_inventaire, designation, categorie_id, service_id,
                    date_acquisition, date_mise_en_service, valeur_brute, duree_annees, taux_amortissement,
                    mode_amortissement, cumul_amort_anterieur, statut, fournisseur, num_facture, emplacement, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                    client_id, exercice, data['code_inventaire'], data['designation'], data['categorie_id'],
                    data.get('service_id'), data['date_acquisition'],
                    data.get('date_mise_en_service') or data['date_acquisition'],
                    float(data['valeur_brute']), duree,
                    float(data.get('taux_amortissement') or (100.0 / duree)),
                    data.get('mode_amortissement', 'LINEAIRE'), float(data.get('cumul_amort_anterieur', 0.0)),
                    data.get('statut', 'EN_SERVICE'), data.get('fournisseur', ''), data.get('num_facture', ''),
                    data.get('emplacement', ''), data.get('notes', '')))
            except Exception as e:
                if "UNIQUE" in str(e):
                    raise ApiError("Ce code d'inventaire existe déjà pour cette société et cet exercice.", 400)
                raise
            nouvel_id = cursor.lastrowid
            self._maj_champs_immo(cursor, nouvel_id, data)
            conn.commit()
            self._send_json({"success": True, "id": nouvel_id, "message": "Immobilisation créée avec succès"})
            return

        if path in ("/api/categories", "/api/services", "/api/parametres", "/api/clients"):
            exiger_admin(user)

        if path == "/api/categories":
            cursor.execute("""INSERT INTO categories (code, libelle, compte_immo, compte_amort, compte_dotation, duree_defaut, taux_defaut, mode_defaut)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", (
                data['code'].strip(), data['libelle'].strip(), data.get('compte_immo', '').strip(),
                data.get('compte_amort', '').strip(), data.get('compte_dotation', '6812').strip(),
                int(data.get('duree_defaut', 5)), float(data.get('taux_defaut', 20.0)), data.get('mode_defaut', 'LINEAIRE')))
            nouvel_id = cursor.lastrowid
            self._maj_champs_compte(cursor, nouvel_id, data)
            conn.commit()
            self._send_json({"success": True, "id": nouvel_id, "message": "Catégorie créée avec succès"})
            return

        if path == "/api/services":
            cursor.execute("INSERT INTO services (code, nom, responsable) VALUES (?, ?, ?)",
                           (data['code'].strip().upper(), data['nom'].strip(), data.get('responsable', '').strip()))
            conn.commit()
            self._send_json({"success": True, "id": cursor.lastrowid, "message": "Service créé avec succès"})
            return

        if path == "/api/parametres":
            cle, valeur = data.get('cle', '').strip(), data.get('valeur', '').strip()
            if cle:
                cursor.execute("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)", (cle, valeur))
                conn.commit()
            self._send_json({"success": True, "message": f"Paramètre {cle} enregistré avec succès"})
            return

        if path == "/api/clients":
            cursor.execute("""INSERT INTO clients (code, nom, nif_ncc, regime_fiscal, devise, secteur, adresse, contact, telephone, email)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                data['code'].upper().strip(), data['nom'].strip(), data.get('nif_ncc', ''),
                data.get('regime_fiscal', 'Réel Normal'), data.get('devise', 'FCFA'), data.get('secteur', ''),
                data.get('adresse', ''), data.get('contact', ''), data.get('telephone', ''), data.get('email', '')))
            new_id = cursor.lastrowid
            row_ex = conn.execute("SELECT valeur FROM parametres WHERE cle = 'exercice_courant'").fetchone()
            ex = entier(row_ex[0] if row_ex else None, datetime.now().year)
            cursor.execute("INSERT OR IGNORE INTO exercices (client_id, annee, statut) VALUES (?, ?, 'OUVERT')", (new_id, ex))
            conn.commit()
            self._send_json({"success": True, "id": new_id, "message": "Client créé avec succès"})
            return

        if path.startswith("/api/immobilisations/") and "/sortie" in path:
            immo_id = int(path.split("/")[3])
            row = cursor.execute("SELECT client_id, exercice FROM immobilisations WHERE id = ?", (immo_id,)).fetchone()
            if not row:
                raise ApiError("Immobilisation introuvable", 404)
            exiger_droit(conn, user, row["client_id"], row["exercice"], "GESTION")
            exiger_exercice_modifiable(conn, row["client_id"], row["exercice"])
            cursor.execute("UPDATE immobilisations SET statut = ?, date_sortie = ?, prix_cession = ?, motif_sortie = ? WHERE id = ?", (
                data.get('statut', 'CEDE'), data.get('date_sortie'), float(data.get('prix_cession', 0.0)),
                data.get('motif_sortie', ''), immo_id))
            conn.commit()
            self._send_json({"success": True, "message": "Sortie d'actif enregistrée"})
            return

        if path == "/api/import-lot":
            client_id = entier(data.get('client_id'))
            if client_id is None:
                raise ApiError("client_id manquant.", 400)
            exercice = entier(data.get('exercice')) or exercice_courant_client(conn, client_id)
            exiger_droit(conn, user, client_id, exercice, "ECRITURE")
            exiger_exercice_modifiable(conn, client_id, exercice)
            ajoutes = 0
            erreurs = 0
            for it in data.get('items', []):
                try:
                    duree = int(it.get('duree_annees', 5))
                    ds = it.get('date_acquisition', f'{exercice}-01-01')
                    cursor.execute("""
                    INSERT OR REPLACE INTO immobilisations (
                        client_id, exercice, code_inventaire, designation, categorie_id, service_id,
                        date_acquisition, date_mise_en_service, valeur_brute, duree_annees, taux_amortissement,
                        mode_amortissement, cumul_amort_anterieur, statut, date_sortie, prix_cession,
                        motif_sortie, fournisseur, num_facture, emplacement, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
                        client_id, exercice, it['code_inventaire'], it['designation'], it.get('categorie_id', 1),
                        it.get('service_id'), ds, it.get('date_mise_en_service', ds), float(it.get('valeur_brute', 0)),
                        duree, float(it.get('taux_amortissement') or 100.0 / max(duree, 1)),
                        it.get('mode_amortissement', 'LINEAIRE'), float(it.get('cumul_amort_anterieur', 0.0)),
                        it.get('statut', 'EN_SERVICE'), it.get('date_sortie'), float(it.get('prix_cession') or 0),
                        it.get('motif_sortie'), it.get('fournisseur'), it.get('num_facture'),
                        it.get('emplacement'), it.get('notes')))
                    ajoutes += 1
                except Exception as e:
                    erreurs += 1
                    print("Erreur import item:", e)
            conn.commit()
            msg = f"{ajoutes} immobilisations importées" + (f" ({erreurs} ligne(s) ignorée(s))" if erreurs else "")
            self._send_json({"success": True, "count": ajoutes, "erreurs": erreurs, "message": msg})
            return

        if path == "/api/cloture-exercice":
            return self.api_cloture(conn, user, data)

        raise ApiError("Route API non reconnue", 404)

    # ------------------------------------------------------------------ clôture
    def api_cloture(self, conn, user, data):
        client_id = entier(data.get('client_id'))
        annee = entier(data.get('annee_cloture'))
        if client_id is None or annee is None:
            raise ApiError("client_id et annee_cloture obligatoires.", 400)
        exiger_droit(conn, user, client_id, annee, "GESTION")
        ex = conn.execute("SELECT statut FROM exercices WHERE client_id = ? AND annee = ?", (client_id, annee)).fetchone()
        if not ex:
            raise ApiError(f"L'exercice {annee} n'existe pas pour ce dossier.", 404)
        if ex["statut"] == "CLOTURE":
            raise ApiError(f"L'exercice {annee} est déjà clôturé.", 400)
        suivante = annee + 1
        if conn.execute("SELECT 1 FROM exercices WHERE client_id = ? AND annee = ?", (client_id, suivante)).fetchone():
            raise ApiError(f"L'exercice {suivante} existe déjà pour ce dossier : la clôture de {annee} ne peut pas le recréer.", 400)

        rows = conn.execute("SELECT * FROM immobilisations WHERE client_id = ? AND exercice = ?", (client_id, annee)).fetchall()
        total_vb = total_dot = total_vnc = 0.0
        reports = []
        for row in rows:
            immo = dict(row)
            calc = calculer_situation_exercice(immo, annee)
            if immo['statut'] == 'EN_SERVICE':
                total_vb += immo['valeur_brute']
                total_vnc += calc['vnc_fin']
            total_dot += calc['dotation']

            # Les biens sortis au plus tard pendant l'exercice clos ne sont pas reportés (ils restent archivés dans l'exercice clos)
            if immo['statut'] != 'EN_SERVICE':
                dt = parse_date(immo.get('date_sortie'))
                if not dt or dt.year <= annee:
                    continue
            nouveau = {k: immo.get(k) for k in COLONNES_IMMO}
            nouveau['exercice'] = suivante
            nouveau['cumul_amort_anterieur'] = round(float(immo['cumul_amort_anterieur']) + calc['dotation'], 2)
            reports.append(nouveau)

        placeholders = ", ".join("?" for _ in COLONNES_IMMO)
        conn.executemany(f"INSERT INTO immobilisations ({', '.join(COLONNES_IMMO)}) VALUES ({placeholders})",
                         [tuple(r[k] for k in COLONNES_IMMO) for r in reports])
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("""INSERT OR REPLACE INTO exercices_historique
            (client_id, exercice, date_cloture, total_valeur_brute, total_dotations, total_vnc, nb_biens, details_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (client_id, annee, now_str, total_vb, total_dot, total_vnc, len(rows), json.dumps({"cloture_par": user["login"]})))
        conn.execute("UPDATE exercices SET statut = 'CLOTURE' WHERE client_id = ? AND annee = ?", (client_id, annee))
        conn.execute("INSERT INTO exercices (client_id, annee, statut) VALUES (?, ?, 'OUVERT')", (client_id, suivante))
        conn.commit()
        self._send_json({"success": True, "annee_cloturee": annee, "nouvel_exercice": suivante,
                         "total_dotations": total_dot, "biens_reportes": len(reports),
                         "message": f"Exercice {annee} clôturé avec succès ! Passage à l'exercice {suivante} ({len(reports)} biens reportés)."})

    # ------------------------------------------------------------------ import de l'historique Access (admin)
    def api_import_historique(self, conn, user, data):
        dossier = (data.get("dossier") or "").strip().strip('"')
        if not dossier or not os.path.isdir(dossier):
            raise ApiError("Dossier introuvable sur le serveur : " + dossier, 400)
        import import_historique as ih
        conn.close()   # l'importeur ouvre sa propre connexion
        rapport = ih.importer(dossier, simulation=bool(data.get("simulation")))
        self._send_json({"success": True, "rapport": rapport})

    # ------------------------------------------------------------------ PUT
    def handle_api_put(self, conn, user, path, data):
        cursor = conn.cursor()

        if path.startswith("/api/immobilisations/"):
            immo_id = int(path.split("/")[3])
            row = cursor.execute("SELECT client_id, exercice, statut FROM immobilisations WHERE id = ?", (immo_id,)).fetchone()
            if not row:
                raise ApiError("Immobilisation introuvable", 404)
            exiger_droit(conn, user, row["client_id"], row["exercice"], "ECRITURE")
            exiger_exercice_modifiable(conn, row["client_id"], row["exercice"])
            # Changer le statut (cession, rebut, remise en service) = sortie d'actif : niveau Gestion obligatoire
            if (data.get('statut') or row["statut"]) != row["statut"]:
                exiger_droit(conn, user, row["client_id"], row["exercice"], "GESTION")
            try:
                cursor.execute("""
                UPDATE immobilisations SET
                    code_inventaire = ?, designation = ?, categorie_id = ?, service_id = ?,
                    date_acquisition = ?, date_mise_en_service = ?, valeur_brute = ?,
                    duree_annees = ?, taux_amortissement = ?, mode_amortissement = ?,
                    cumul_amort_anterieur = ?, statut = ?, fournisseur = ?, num_facture = ?,
                    emplacement = ?, notes = ?
                WHERE id = ?""", (
                    data['code_inventaire'], data['designation'], data['categorie_id'], data.get('service_id'),
                    data['date_acquisition'], data['date_mise_en_service'], float(data['valeur_brute']),
                    int(data['duree_annees']), float(data['taux_amortissement']),
                    data.get('mode_amortissement', 'LINEAIRE'), float(data.get('cumul_amort_anterieur', 0.0)),
                    data.get('statut', 'EN_SERVICE'), data.get('fournisseur', ''), data.get('num_facture', ''),
                    data.get('emplacement', ''), data.get('notes', ''), immo_id))
            except Exception as e:
                if "UNIQUE" in str(e):
                    raise ApiError("Ce code d'inventaire existe déjà pour cette société et cet exercice.", 400)
                raise
            self._maj_champs_immo(cursor, immo_id, data)
            conn.commit()
            self._send_json({"success": True, "message": "Immobilisation mise à jour"})
            return

        exiger_admin(user)

        if path.startswith("/api/clients/"):
            client_id = int(path.split("/")[3])
            cursor.execute("""UPDATE clients SET code = ?, nom = ?, nif_ncc = ?, regime_fiscal = ?, devise = ?,
                              secteur = ?, adresse = ?, contact = ?, telephone = ?, email = ? WHERE id = ?""", (
                data['code'].upper().strip(), data['nom'].strip(), data.get('nif_ncc', ''),
                data.get('regime_fiscal', 'Réel Normal'), data.get('devise', 'FCFA'), data.get('secteur', ''),
                data.get('adresse', ''), data.get('contact', ''), data.get('telephone', ''), data.get('email', ''), client_id))
            conn.commit()
            self._send_json({"success": True, "message": "Client mis à jour avec succès"})
            return

        if path.startswith("/api/categories/"):
            cat_id = int(path.split("/")[3])
            cursor.execute("""UPDATE categories SET code = ?, libelle = ?, compte_immo = ?, compte_amort = ?,
                              compte_dotation = ?, duree_defaut = ?, taux_defaut = ?, mode_defaut = ? WHERE id = ?""", (
                data['code'].strip(), data['libelle'].strip(), data.get('compte_immo', '').strip(),
                data.get('compte_amort', '').strip(), data.get('compte_dotation', '6812').strip(),
                int(data.get('duree_defaut', 5)), float(data.get('taux_defaut', 20.0)),
                data.get('mode_defaut', 'LINEAIRE'), cat_id))
            self._maj_champs_compte(cursor, cat_id, data)
            conn.commit()
            self._send_json({"success": True, "message": "Catégorie mise à jour avec succès"})
            return

        if path.startswith("/api/services/"):
            srv_id = int(path.split("/")[3])
            cursor.execute("UPDATE services SET code = ?, nom = ?, responsable = ? WHERE id = ?",
                           (data['code'].strip().upper(), data['nom'].strip(), data.get('responsable', '').strip(), srv_id))
            conn.commit()
            self._send_json({"success": True, "message": "Service mis à jour avec succès"})
            return

        raise ApiError("Route non trouvée", 404)

    # ------------------------------------------------------------------ DELETE
    def handle_api_delete(self, conn, user, path):
        cursor = conn.cursor()

        if path.startswith("/api/immobilisations/"):
            immo_id = int(path.split("/")[3])
            row = cursor.execute("SELECT client_id, exercice FROM immobilisations WHERE id = ?", (immo_id,)).fetchone()
            if not row:
                raise ApiError("Immobilisation introuvable", 404)
            exiger_droit(conn, user, row["client_id"], row["exercice"], "GESTION")
            exiger_exercice_modifiable(conn, row["client_id"], row["exercice"])
            cursor.execute("DELETE FROM immobilisations WHERE id = ?", (immo_id,))
            conn.commit()
            self._send_json({"success": True, "message": "Immobilisation supprimée avec succès"})
            return

        exiger_admin(user)

        if path.startswith("/api/categories/"):
            cat_id = int(path.split("/")[3])
            nb = cursor.execute("SELECT COUNT(*) FROM immobilisations WHERE categorie_id = ?", (cat_id,)).fetchone()[0]
            if nb > 0:
                raise ApiError(f"Impossible de supprimer cette catégorie car {nb} immobilisations y sont rattachées.", 400)
            cursor.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
            conn.commit()
            self._send_json({"success": True, "message": "Catégorie supprimée avec succès"})
            return

        if path.startswith("/api/services/"):
            srv_id = int(path.split("/")[3])
            nb = cursor.execute("SELECT COUNT(*) FROM immobilisations WHERE service_id = ?", (srv_id,)).fetchone()[0]
            if nb > 0:
                raise ApiError(f"Impossible de supprimer ce service car {nb} immobilisations y sont affectées.", 400)
            cursor.execute("DELETE FROM services WHERE id = ?", (srv_id,))
            conn.commit()
            self._send_json({"success": True, "message": "Service supprimé avec succès"})
            return

        if path.startswith("/api/clients/"):
            client_id = int(path.split("/")[3])
            nb = cursor.execute("SELECT COUNT(*) FROM immobilisations WHERE client_id = ?", (client_id,)).fetchone()[0]
            if nb > 0:
                raise ApiError(f"Impossible de supprimer ce client car {nb} immobilisations y sont rattachées.", 400)
            cursor.execute("DELETE FROM exercices WHERE client_id = ?", (client_id,))
            cursor.execute("DELETE FROM exercices_historique WHERE client_id = ?", (client_id,))
            cursor.execute("DELETE FROM droits WHERE client_id = ?", (client_id,))
            cursor.execute("DELETE FROM clients WHERE id = ?", (client_id,))
            conn.commit()
            self._send_json({"success": True, "message": "Client supprimé avec succès"})
            return

        if path.startswith("/api/parametres/"):
            cle = unquote(path.split("/")[3])
            cursor.execute("DELETE FROM parametres WHERE cle = ?", (cle,))
            conn.commit()
            self._send_json({"success": True, "message": f"Paramètre « {cle} » supprimé avec succès"})
            return

        raise ApiError("Route non trouvée", 404)

    # ------------------------------------------------------------------ frontend statique
    def serve_static_file(self, path):
        if path in ("", "/"):
            path = "/index.html"
        file_path = os.path.normpath(os.path.join(FRONTEND_DIR, unquote(path).lstrip("/")))
        # Empêche de sortir du dossier frontend (../)
        if not file_path.startswith(os.path.normpath(FRONTEND_DIR) + os.sep) or not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 - Fichier non trouve")
            return
        mime_type, _ = mimetypes.guess_type(file_path)
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type or "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"500 - Erreur lecture fichier: {e}".encode('utf-8'))


def open_browser(port):
    import time
    time.sleep(1.2)
    webbrowser.open(f"http://localhost:{port}")


def reinitialiser_admin():
    """Secours : remet le mot de passe du compte « admin » à « admin » (à changer à la connexion)."""
    init_db()
    conn = get_db_connection()
    sel, h = sec.hasher_mdp("admin")
    row = conn.execute("SELECT id FROM utilisateurs WHERE lower(login) = 'admin'").fetchone()
    if row:
        conn.execute("UPDATE utilisateurs SET mdp_sel = ?, mdp_hash = ?, doit_changer_mdp = 1, actif = 1, role = 'ADMIN' WHERE id = ?", (sel, h, row["id"]))
    else:
        conn.execute("INSERT INTO utilisateurs (login, nom, role, actif, mdp_sel, mdp_hash, doit_changer_mdp) VALUES ('admin', 'Administrateur', 'ADMIN', 1, ?, ?, 1)", (sel, h))
    conn.commit()
    conn.close()
    print("Compte « admin » réinitialisé : mot de passe « admin » (à changer à la prochaine connexion).")


def run_server(port=8000):
    init_db()
    httpd = ThreadingHTTPServer(('', port), SagiAPIHandler)
    print("=" * 60)
    print("APPLICATION SAGI IMMO FISCAL DEMARREE")
    print(f"Adresse locale : http://localhost:{port}")
    print("Ouvrez cette adresse dans votre navigateur (Chrome/Edge)")
    print("=" * 60)
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur...")
        httpd.server_close()


if __name__ == '__main__':
    if "--reset-admin" in sys.argv:
        reinitialiser_admin()
        sys.exit(0)
    port = 8000
    for a in sys.argv[1:]:
        if a.isdigit():
            port = int(a)
    run_server(port)
