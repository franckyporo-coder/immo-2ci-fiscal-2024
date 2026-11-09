"""
Sécurité de l'application SAGI : mots de passe, sessions et droits d'accès.

Droits : un niveau par (utilisateur, société), valable pour toutes les années (exercice = 0)
ou pour une année précise. Un réglage par année l'emporte sur le réglage « toutes années ».
Niveaux : AUCUN < LECTURE < ECRITURE < GESTION. Un ADMIN a GESTION partout.
"""

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta

NIVEAUX = {"AUCUN": 0, "LECTURE": 1, "ECRITURE": 2, "GESTION": 3}
SESSION_HEURES = 12
ITERATIONS = 200_000
MDP_MIN = 6

# Anti force brute : 5 échecs consécutifs => blocage de 5 minutes pour cet identifiant
_ECHECS = {}
MAX_ECHECS = 5
BLOCAGE_SEC = 300


def hasher_mdp(mdp, sel=None):
    sel = sel or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", mdp.encode("utf-8"), bytes.fromhex(sel), ITERATIONS).hex()
    return sel, h


def verifier_mdp(mdp, sel, h):
    _, calc = hasher_mdp(mdp, sel)
    return hmac.compare_digest(calc, h)


# ------------------------------------------------------------------ anti force brute
def est_bloque(login):
    e = _ECHECS.get(login.lower())
    if not e:
        return 0
    nb, jusqu_a = e
    if nb >= MAX_ECHECS and jusqu_a > time.time():
        return int(jusqu_a - time.time())
    if nb >= MAX_ECHECS:
        _ECHECS.pop(login.lower(), None)
    return 0


def noter_echec(login):
    nb, _ = _ECHECS.get(login.lower(), (0, 0))
    _ECHECS[login.lower()] = (nb + 1, time.time() + BLOCAGE_SEC)


def effacer_echecs(login):
    _ECHECS.pop(login.lower(), None)


# ------------------------------------------------------------------ sessions
def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def creer_session(conn, user_id):
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    conn.execute("DELETE FROM sessions WHERE expire_at < ?", (_fmt(now),))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expire_at) VALUES (?, ?, ?, ?)",
        (_hash_token(token), user_id, _fmt(now), _fmt(now + timedelta(hours=SESSION_HEURES))),
    )
    conn.commit()
    return token


def utilisateur_depuis_token(conn, token):
    if not token:
        return None
    row = conn.execute(
        """SELECT u.id, u.login, u.nom, u.role, u.actif, u.doit_changer_mdp
           FROM sessions s JOIN utilisateurs u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expire_at > ?""",
        (_hash_token(token), _fmt(datetime.now())),
    ).fetchone()
    if not row or not row["actif"]:
        return None
    return dict(row)


def supprimer_session(conn, token):
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))
    conn.commit()


def supprimer_sessions_utilisateur(conn, user_id):
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def supprimer_autres_sessions(conn, user_id, token_a_garder):
    conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, _hash_token(token_a_garder or "")))


def utilisateur_public(u):
    return {
        "id": u["id"],
        "login": u["login"],
        "nom": u["nom"],
        "role": u["role"],
        "doit_changer_mdp": bool(u["doit_changer_mdp"]),
    }


# ------------------------------------------------------------------ droits
def niveau_droit(conn, user, client_id, annee):
    """Niveau effectif de l'utilisateur sur la société/année."""
    if user["role"] == "ADMIN":
        return "GESTION"
    rows = conn.execute(
        "SELECT exercice, niveau FROM droits WHERE user_id = ? AND client_id = ? AND exercice IN (?, 0)",
        (user["id"], client_id, int(annee or 0)),
    ).fetchall()
    par_ex = {r["exercice"]: r["niveau"] for r in rows}
    if int(annee or 0) in par_ex and int(annee or 0) != 0:
        return par_ex[int(annee)]
    return par_ex.get(0, "AUCUN")


def niveau_au_moins(niveau, minimum):
    return NIVEAUX.get(niveau, 0) >= NIVEAUX[minimum]


def droits_par_annee(conn, user, client_id, annees):
    return {a: niveau_droit(conn, user, client_id, a) for a in annees}


def clients_visibles_ids(conn, user):
    """None = tous (admin). Sinon l'ensemble des sociétés ayant au moins une année accessible."""
    if user["role"] == "ADMIN":
        return None
    ids = set()
    clients = {r["client_id"] for r in conn.execute("SELECT DISTINCT client_id FROM droits WHERE user_id = ? AND niveau != 'AUCUN'", (user["id"],))}
    for cid in clients:
        annees = [r["annee"] for r in conn.execute("SELECT annee FROM exercices WHERE client_id = ?", (cid,))]
        if any(niveau_droit(conn, user, cid, a) != "AUCUN" for a in annees):
            ids.add(cid)
    return ids
