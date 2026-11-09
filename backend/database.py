"""
Module de base de données SQLite pour l'application SAGI IMMO FISCAL.
Initialisation du schéma, des catégories SYSCOHADA et des tables d'immobilisations.
"""

import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "sagi_immo.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.DatabaseError:
        pass
    conn.execute("PRAGMA foreign_keys=OFF")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Table des paramètres généraux
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS parametres (
        cle TEXT PRIMARY KEY,
        valeur TEXT
    )
    """)

    # Table des catégories d'immobilisations (Conforme SYSCOHADA)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        libelle TEXT NOT NULL,
        compte_immo TEXT NOT NULL,
        compte_amort TEXT NOT NULL,
        compte_dotation TEXT NOT NULL DEFAULT '6812',
        duree_defaut INTEGER NOT NULL,
        taux_defaut REAL NOT NULL,
        mode_defaut TEXT NOT NULL DEFAULT 'LINEAIRE'
    )
    """)

    # Migration : champs de la fiche « Mise à jour des comptes » (compte à amortir, poste, VCN, produits de cession)
    cols_cat = [r[1] for r in cursor.execute("PRAGMA table_info(categories)").fetchall()]
    for nom_col, defaut in (("a_amortir", "O"), ("poste", ""), ("compte_vcn", "811"), ("compte_prod_cession", "821")):
        if nom_col not in cols_cat:
            cursor.execute(f"ALTER TABLE categories ADD COLUMN {nom_col} TEXT NOT NULL DEFAULT '{defaut}'")

    # Table des services / départements
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        nom TEXT NOT NULL,
        responsable TEXT
    )
    """)

    # Table des clients / dossiers entreprises
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        nom TEXT NOT NULL,
        nif_ncc TEXT,
        regime_fiscal TEXT DEFAULT 'Réel Normal',
        devise TEXT DEFAULT 'FCFA',
        secteur TEXT,
        adresse TEXT,
        contact TEXT,
        telephone TEXT,
        email TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Table principale des immobilisations : un jeu de lignes par société ET par exercice
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS immobilisations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL DEFAULT 1,
        exercice INTEGER NOT NULL DEFAULT 2024,
        code_inventaire TEXT NOT NULL,
        designation TEXT NOT NULL,
        categorie_id INTEGER NOT NULL,
        service_id INTEGER,
        date_acquisition TEXT NOT NULL,
        date_mise_en_service TEXT NOT NULL,
        valeur_brute REAL NOT NULL,
        duree_annees INTEGER NOT NULL,
        taux_amortissement REAL NOT NULL,
        mode_amortissement TEXT NOT NULL DEFAULT 'LINEAIRE',
        cumul_amort_anterieur REAL NOT NULL DEFAULT 0.0,
        statut TEXT NOT NULL DEFAULT 'EN_SERVICE', -- EN_SERVICE, CEDE, REBUT, ARCHIVE
        date_sortie TEXT,
        prix_cession REAL DEFAULT 0.0,
        motif_sortie TEXT,
        fournisseur TEXT,
        num_facture TEXT,
        emplacement TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (client_id, exercice, code_inventaire),
        FOREIGN KEY (client_id) REFERENCES clients (id),
        FOREIGN KEY (categorie_id) REFERENCES categories (id),
        FOREIGN KEY (service_id) REFERENCES services (id)
    )
    """)

    # Migration d'une ancienne base (sans colonne exercice) : reconstruction de la table
    cursor.execute("PRAGMA table_info(immobilisations)")
    colonnes = [col['name'] for col in cursor.fetchall()]
    if 'exercice' not in colonnes:
        cursor.execute("SELECT valeur FROM parametres WHERE cle = 'exercice_courant'")
        row_ex = cursor.fetchone()
        ex_defaut = int(row_ex['valeur']) if row_ex and str(row_ex['valeur']).isdigit() else 2024
        cursor.execute("ALTER TABLE immobilisations RENAME TO immobilisations_old")
        cursor.execute("DROP INDEX IF EXISTS idx_immo_client_ex")
        cursor.execute("""
        CREATE TABLE immobilisations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL DEFAULT 1,
            exercice INTEGER NOT NULL DEFAULT 2024,
            code_inventaire TEXT NOT NULL,
            designation TEXT NOT NULL,
            categorie_id INTEGER NOT NULL,
            service_id INTEGER,
            date_acquisition TEXT NOT NULL,
            date_mise_en_service TEXT NOT NULL,
            valeur_brute REAL NOT NULL,
            duree_annees INTEGER NOT NULL,
            taux_amortissement REAL NOT NULL,
            mode_amortissement TEXT NOT NULL DEFAULT 'LINEAIRE',
            cumul_amort_anterieur REAL NOT NULL DEFAULT 0.0,
            statut TEXT NOT NULL DEFAULT 'EN_SERVICE',
            date_sortie TEXT,
            prix_cession REAL DEFAULT 0.0,
            motif_sortie TEXT,
            fournisseur TEXT,
            num_facture TEXT,
            emplacement TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (client_id, exercice, code_inventaire),
            FOREIGN KEY (client_id) REFERENCES clients (id),
            FOREIGN KEY (categorie_id) REFERENCES categories (id),
            FOREIGN KEY (service_id) REFERENCES services (id)
        )
        """)
        old_cols = [c['name'] for c in cursor.execute("PRAGMA table_info(immobilisations_old)").fetchall()]
        commun = [c for c in old_cols if c in (
            'id', 'client_id', 'code_inventaire', 'designation', 'categorie_id', 'service_id',
            'date_acquisition', 'date_mise_en_service', 'valeur_brute', 'duree_annees',
            'taux_amortissement', 'mode_amortissement', 'cumul_amort_anterieur', 'statut',
            'date_sortie', 'prix_cession', 'motif_sortie', 'fournisseur', 'num_facture',
            'emplacement', 'notes', 'created_at')]
        liste = ", ".join(commun)
        cursor.execute(f"INSERT INTO immobilisations ({liste}, exercice) SELECT {liste}, {ex_defaut} FROM immobilisations_old")
        cursor.execute("DROP TABLE immobilisations_old")

    # Migration : champs de la fiche « Saisir des immobilisations » (quantité, type de contrat, augmentation de valeur)
    cols_im = [r[1] for r in cursor.execute("PRAGMA table_info(immobilisations)").fetchall()]
    for nom_col, ddl in (("quantite", "INTEGER NOT NULL DEFAULT 1"),
                         ("type_contrat", "TEXT NOT NULL DEFAULT 'CN'"),
                         ("augmentation_valeur", "REAL NOT NULL DEFAULT 0")):
        if nom_col not in cols_im:
            cursor.execute(f"ALTER TABLE immobilisations ADD COLUMN {nom_col} {ddl}")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_immo_client_ex ON immobilisations (client_id, exercice)")

    # Historique des clôtures : désormais par société
    cursor.execute("PRAGMA table_info(exercices_historique)")
    cols_h = [col['name'] for col in cursor.fetchall()]
    if cols_h and 'client_id' not in cols_h:
        cursor.execute("ALTER TABLE exercices_historique RENAME TO exercices_historique_old")
        cols_h = []
    if not cols_h:
        cursor.execute("""
        CREATE TABLE exercices_historique (
            client_id INTEGER NOT NULL DEFAULT 1,
            exercice INTEGER NOT NULL,
            date_cloture TEXT NOT NULL,
            total_valeur_brute REAL NOT NULL,
            total_dotations REAL NOT NULL,
            total_vnc REAL NOT NULL,
            nb_biens INTEGER NOT NULL,
            details_json TEXT,
            PRIMARY KEY (client_id, exercice)
        )
        """)
        anc = cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='exercices_historique_old'").fetchone()
        if anc:
            cursor.execute("""INSERT OR IGNORE INTO exercices_historique
                (client_id, exercice, date_cloture, total_valeur_brute, total_dotations, total_vnc, nb_biens, details_json)
                SELECT 1, exercice, date_cloture, total_valeur_brute, total_dotations, total_vnc, nb_biens, details_json
                FROM exercices_historique_old""")
            cursor.execute("DROP TABLE exercices_historique_old")

    # Exercices existants pour chaque société : OUVERT / CLOTURE / HISTORIQUE (importé depuis Access)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exercices (
        client_id INTEGER NOT NULL,
        annee INTEGER NOT NULL,
        statut TEXT NOT NULL DEFAULT 'OUVERT',
        source TEXT,
        date_import TEXT,
        PRIMARY KEY (client_id, annee)
    )
    """)

    # Utilisateurs, sessions et droits d'accès (par société, toutes années ou année précise)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS utilisateurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT UNIQUE NOT NULL,
        nom TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'UTILISATEUR',   -- ADMIN, UTILISATEUR
        actif INTEGER NOT NULL DEFAULT 1,
        mdp_sel TEXT NOT NULL,
        mdp_hash TEXT NOT NULL,
        doit_changer_mdp INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expire_at TEXT NOT NULL
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS droits (
        user_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL,
        exercice INTEGER NOT NULL DEFAULT 0,       -- 0 = toutes les années
        niveau TEXT NOT NULL,                      -- AUCUN, LECTURE, ECRITURE, GESTION
        PRIMARY KEY (user_id, client_id, exercice)
    )
    """)

    # Données par défaut pour les dossiers clients
    clients_initiaux = [
        ('SAGI', 'SAGI S.A.', '0012345-X', 'Réel Normal', 'FCFA', 'Immobilier & Gestion d''actifs', 'Abidjan Plateau, Tour B', 'M. Kouassi - DAF', '+225 07 12 34 56', 'contact@sagi.ci'),
        ('2CI', '2CI SARL', '0098765-Y', 'Réel Normal', 'FCFA', 'BTP, Travaux & Prestations', 'Abidjan Cocody, Rue des Jardins', 'Mme Touré - Chef Comptable', '+225 05 98 76 54', 'admin@2ci.ci'),
        ('AFRIC_LOG', 'Afric Logistique & Transport', '0044556-Z', 'Réel Simplifié', 'FCFA', 'Transport de fret & transit', 'San Pedro, Zone Portuaire', 'M. Diallo - Gérant', '+225 01 23 45 67', 'info@africlog.ci')
    ]

    for cl in clients_initiaux:
        cursor.execute("""
        INSERT OR IGNORE INTO clients 
        (code, nom, nif_ncc, regime_fiscal, devise, secteur, adresse, contact, telephone, email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, cl)

    # Paramètres par défaut
    cursor.execute("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('client_actif_id', '1')")
    cursor.execute("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('nom_societe', 'SAGI')")
    cursor.execute("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('devise', 'FCFA')")
    cursor.execute("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('exercice_courant', '2024')")

    # Catégories conformes SYSCOHADA révisé
    categories_initiales = [
        ('218', 'Logiciels, licences et brevets', '218000', '281800', '681200', 3, 33.33, 'LINEAIRE'),
        ('231', 'Bâtiments et constructions', '231000', '283100', '681200', 20, 5.0, 'LINEAIRE'),
        ('241', 'Matériel et outillage industriel', '241000', '284100', '681200', 5, 20.0, 'LINEAIRE'),
        ('2441', 'Matériel de bureau', '244100', '284410', '681200', 5, 20.0, 'LINEAIRE'),
        ('2442', 'Matériel informatique', '244200', '284420', '681200', 3, 33.33, 'LINEAIRE'),
        ('2443', 'Mobilier de bureau', '244300', '284430', '681200', 10, 10.0, 'LINEAIRE'),
        ('2451', 'Matériel de transport (Véhicules de tourisme)', '245100', '284510', '681200', 5, 20.0, 'LINEAIRE'),
        ('2452', 'Matériel de transport (Utilitaires & Camions)', '245200', '284520', '681200', 4, 25.0, 'LINEAIRE'),
        ('246', 'Agencements et aménagements', '246000', '284600', '681200', 10, 10.0, 'LINEAIRE')
    ]

    for cat in categories_initiales:
        cursor.execute("""
        INSERT OR IGNORE INTO categories 
        (code, libelle, compte_immo, compte_amort, compte_dotation, duree_defaut, taux_defaut, mode_defaut)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, cat)

    # Services d'entreprise par défaut
    services_initiaux = [
        ('DIR', 'Direction Générale', 'Directeur Général'),
        ('ADM', 'Administration & Finances', 'Responsable Financier'),
        ('COM', 'Service Commercial & Marketing', 'Chef des Ventes'),
        ('EXP', 'Exploitation & Opérations', 'Chef d''Exploitation'),
        ('IT', 'Systèmes d''Information', 'Responsable IT')
    ]

    for s in services_initiaux:
        cursor.execute("INSERT OR IGNORE INTO services (code, nom, responsable) VALUES (?, ?, ?)", s)

    # Exemple de données d'immobilisations pour SAGI si la table est vide
    cursor.execute("SELECT COUNT(*) FROM immobilisations")
    if cursor.fetchone()[0] == 0:
        exemples_immo = [
            ('IMM-2021-001', 'Véhicule Toyota Hilux Double Cabine', 7, 4, '2021-03-15', '2021-03-15', 24500000.0, 5, 20.0, 'LINEAIRE', 13883333.0, 'EN_SERVICE', None, 0.0, None, 'CFAO Motors', 'FAC-2021-089', 'Parc Auto', 'Affecté à l''exploitation'),
            ('IMM-2022-002', 'Serveur Dell PowerEdge R740 + Baie', 5, 5, '2022-01-10', '2022-01-10', 8200000.0, 3, 33.33, 'LINEAIRE', 5466667.0, 'EN_SERVICE', None, 0.0, None, 'Microtec Solutions', 'FAC-2022-012', 'Salle Serveur', 'Sauvegardes et ERP'),
            ('IMM-2023-003', 'Ensemble Mobilier Bureau Direction (Acajou)', 6, 1, '2023-06-01', '2023-06-01', 3500000.0, 10, 10.0, 'LINEAIRE', 204167.0, 'EN_SERVICE', None, 0.0, None, 'Mobilier Moderne CI', 'FAC-2023-455', 'Bureau DG', 'Rénovation direction'),
            ('IMM-2024-004', '5 Postes PC Portables HP EliteBook i7', 5, 2, '2024-02-01', '2024-02-01', 4750000.0, 3, 33.33, 'LINEAIRE', 0.0, 'EN_SERVICE', None, 0.0, None, 'Afric Technologies', 'FAC-2024-034', 'Comptabilité', 'Acquisition exercice 2024'),
            ('IMM-2024-005', 'Groupe Électrogène SDMO 60 kVA', 3, 4, '2024-05-15', '2024-05-15', 12000000.0, 5, 20.0, 'LINEAIRE', 0.0, 'EN_SERVICE', None, 0.0, None, 'Energie Plus', 'FAC-2024-118', 'Cour Centrale', 'Sécurité électrique site principal'),
            ('IMM-2020-006', 'Photocopieur Canon ImageRunner C3520i', 4, 2, '2020-01-05', '2020-01-05', 3800000.0, 5, 20.0, 'LINEAIRE', 3040000.0, 'CEDE', '2024-06-30', 500000.0, 'Vente pour renouvellement', 'Burotic System', 'FAC-2020-008', 'Pool Administratif', 'Sorti en 2024')
        ]

        for immo in exemples_immo:
            cursor.execute("""
            INSERT INTO immobilisations (
                code_inventaire, designation, categorie_id, service_id,
                date_acquisition, date_mise_en_service, valeur_brute,
                duree_annees, taux_amortissement, mode_amortissement,
                cumul_amort_anterieur, statut, date_sortie, prix_cession,
                motif_sortie, fournisseur, num_facture, emplacement, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, immo)

    cursor.execute("UPDATE immobilisations SET client_id = 1 WHERE client_id IS NULL OR client_id = 0")

    # Ajouter quelques immobilisations pour le client 2CI s'il n'en a pas encore
    cursor.execute("SELECT COUNT(*) FROM immobilisations WHERE client_id = 2")
    if cursor.fetchone()[0] == 0:
        immos_2ci = [
            (2, '2CI-2022-001', 'Bétonnière Professionnelle Altrad 350L', 3, 4, '2022-04-10', '2022-04-10', 3200000.0, 5, 20.0, 'LINEAIRE', 1066667.0, 'EN_SERVICE', None, 0.0, None, 'BTP Distribution CI', 'FAC-2022-045', 'Chantier Cocody', 'Dossier 2CI SARL'),
            (2, '2CI-2023-002', 'Camion Benne Isuzu FVR 15 Tonnes', 8, 4, '2023-01-15', '2023-01-15', 38500000.0, 4, 25.0, 'LINEAIRE', 9625000.0, 'EN_SERVICE', None, 0.0, None, 'Japan Motors CI', 'FAC-2023-019', 'Parc Engins', 'Véhicule de transport chantier 2CI'),
            (2, '2CI-2024-003', 'Station Totale Leica FlexLine TS07', 3, 5, '2024-03-01', '2024-03-01', 6500000.0, 5, 20.0, 'LINEAIRE', 0.0, 'EN_SERVICE', None, 0.0, None, 'Topo Geo Services', 'FAC-2024-088', 'Bureau Géomètre', 'Appareil topographique 2CI')
        ]
        for immo in immos_2ci:
            cursor.execute("""
            INSERT INTO immobilisations (
                client_id, code_inventaire, designation, categorie_id, service_id,
                date_acquisition, date_mise_en_service, valeur_brute,
                duree_annees, taux_amortissement, mode_amortissement,
                cumul_amort_anterieur, statut, date_sortie, prix_cession,
                motif_sortie, fournisseur, num_facture, emplacement, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, immo)

    # Chaque société sans exercice reçoit l'exercice courant (ouvert)
    cursor.execute("SELECT valeur FROM parametres WHERE cle = 'exercice_courant'")
    row_ex = cursor.fetchone()
    ex_courant = int(row_ex['valeur']) if row_ex and str(row_ex['valeur']).isdigit() else 2024
    cursor.execute("""
        INSERT OR IGNORE INTO exercices (client_id, annee, statut)
        SELECT DISTINCT client_id, exercice, 'OUVERT' FROM immobilisations
    """)
    cursor.execute("""
        INSERT OR IGNORE INTO exercices (client_id, annee, statut)
        SELECT c.id, ?, 'OUVERT' FROM clients c
        WHERE NOT EXISTS (SELECT 1 FROM exercices e WHERE e.client_id = c.id)
    """, (ex_courant,))

    # Administrateur initial (mot de passe à changer à la première connexion)
    cursor.execute("SELECT COUNT(*) FROM utilisateurs")
    if cursor.fetchone()[0] == 0:
        from securite import hasher_mdp
        sel, h = hasher_mdp("admin")
        cursor.execute("""INSERT INTO utilisateurs (login, nom, role, actif, mdp_sel, mdp_hash, doit_changer_mdp)
                          VALUES ('admin', 'Administrateur', 'ADMIN', 1, ?, ?, 1)""", (sel, h))
        print("[SECURITE] Compte administrateur créé : identifiant « admin », mot de passe « admin » (à changer à la première connexion).")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print(f"Base de données SAGI initialisée avec succès dans : {DB_PATH}")

