# 🏢 SAGI - Application de Gestion des Immobilisations & Fiscalité 2024

Bienvenue dans votre nouvelle application moderne de gestion des immobilisations et de suivi fiscal pour **SAGI** (en **FCFA**).

Cette application remplace avantageusement l'ancienne base Microsoft Access (`2CI FISCAL 2024.mdb`) en offrant une interface Web fluide, intuitive, réactive et conforme aux normes comptables **SYSCOHADA révisé**.

---

## 🚀 Comment lancer l'application ?

### Méthode 1 : En 1 Clic (Recommandée)
Double-cliquez simplement sur le fichier :
👉 **`lancer_application.bat`**

* Le serveur démarre automatiquement.
* Votre navigateur web par défaut (Google Chrome ou Microsoft Edge) s'ouvre à l'adresse : `http://localhost:8000`.

### Méthode 2 : Lancement direct en ligne de commande
Ouvrez un terminal ou PowerShell dans ce dossier et tapez :
```bash
python backend/app.py
```

### Méthode 3 : Mode Autonome (Sans serveur)
Si Python n'est pas installé ou pour une consultation rapide :
* Double-cliquez directement sur **`frontend/index.html`**.
* L'application fonctionne à 100% dans votre navigateur grâce à son moteur de calcul client et sa sauvegarde locale sécurisée.

---

## 🔐 Connexion, utilisateurs et droits d'accès (version multi-sociétés / multi-années)

* **Première connexion** : identifiant `admin`, mot de passe `admin` → l'application impose de le changer immédiatement.
  Mot de passe oublié : `python backend/app.py --reset-admin` remet `admin` / `admin`.
* **Onglet « Sociétés & Années »** : grille société × exercice (ouvert / clôturé / historique Access), nombre de biens,
  cadenas sur les années non autorisées. Un clic sur une case montre ses immobilisations ; on ouvre ensuite le registre,
  le tableau de bord ou le tableau fiscal de **cette société pour cette année**.
* **Onglet « Utilisateurs & Droits »** (administrateur) : un niveau par société, pour toutes les années ou une année précise
  (un réglage par année l'emporte ; « Aucun » refuse explicitement l'année).
  * **Lecture** : consulter, imprimer, exporter.
  * **Écriture** : + saisir, modifier, importer.
  * **Gestion** : + sorties/cessions, suppressions, clôture d'exercice.
  * Les droits sont **vérifiés par le serveur** à chaque requête, pas seulement masqués à l'écran.
* **Clôture** : l'exercice N est figé (il reste consultable tel quel) et l'exercice N+1 est créé avec les cumuls reportés.
  Un exercice clôturé est **vraiment figé** : le serveur refuse toute saisie, modification, sortie ou suppression, même pour un administrateur.
* **Écran de connexion** : plein écran, il masque toute l'application tant qu'on n'est pas connecté (œil pour voir le mot de passe,
  alerte majuscules, dernier identifiant mémorisé). Si le serveur est arrêté, l'écran propose « Réessayer » ou le mode autonome,
  mais ne bascule jamais en mode autonome sans votre choix.
* **Sorties d'actif** : passer un bien en « cédé / rebut » (même en modifiant la fiche ou à l'import d'une ligne) demande le niveau **Gestion**.
* Après un changement de mot de passe, les autres sessions ouvertes du compte sont fermées.

## 📥 Import de l'historique des anciennes bases Access

Double-cliquez sur **`importer_historique.bat`** et indiquez le dossier contenant vos anciennes bases `.mdb`
(sous-dossiers compris, ex. `IMMOBILISATIONS`). Aucun Access ni pilote ODBC n'est nécessaire.
* Une **simulation** est faite d'abord, puis l'import réel sur confirmation.
* Société et exercice sont lus **dans la base elle-même** (n° de contribuable et table de période), pas d'après le nom du dossier.
* Quand plusieurs fichiers donnent la même société/année (copies, sauvegardes…), le plus fiable est retenu
  (jamais « Copie »/« Sauvegarde »/« FAUX »…, puis le plus récent). Le choix est détaillé dans le **rapport CSV**
  généré dans `backend/`, avec un contrôle : somme des annuités Access vs dotations recalculées.
* Les exercices saisis directement dans l'application ne sont jamais écrasés. Relancer l'import est sans danger.
* Les sociétés ou catégories absentes sont créées automatiquement. Les sociétés de démonstration (SAGI, 2CI SARL, Afric Logistique)
  peuvent être supprimées une fois vidées.

## 🌟 Modules et Fonctionnalités Clés

### 0. 🏢 Gestion Multi-Clients & Sélecteur de Dossiers
* **Gestion multi-dossiers** : basculez facilement entre vos différentes sociétés ou dossiers clients (ex: **SAGI S.A.**, **2CI SARL**, etc.).
* **Interface de sélection dédiée** :
  * Cliquez sur le sélecteur client en haut pour ouvrir la liste des clients.
  * Recherche instantanée par nom, code ou NIF.
  * Cartes de synthèse affichant pour chaque client le nombre de biens et le total de la valeur brute.
  * Possibilité de créer de nouveaux dossiers clients, de les modifier ou de les supprimer.
* Chaque client conserve ses propres immobilisations, son tableau fiscal et ses clôtures.

### 1. 📊 Tableau de Bord (Dashboard 2024)
* **Indicateurs financiers en temps réel** :
  * Total de la valeur brute des actifs en service.
  * Dotation de l'exercice 2024 (charge déductible fiscale).
  * Cumul des amortissements au 31/12/2024.
  * Valeur Nette Comptable (V.N.C.) globale inscrite au bilan.
* **Mouvements 2024** : total des acquisitions de l'année et total des cessions/rebuts.
* **Graphique interactif** : répartition du patrimoine par catégorie de biens.

### 2. 📋 Registre Interactif des Immobilisations
* Moteur de recherche instantanée (par nom, code inventaire, fournisseur, n° de facture).
* Filtres par catégorie comptable et par statut (*En service*, *Cédé*, *Rebut*).
* Visualisation immédiate des dotations 2024 et de la VNC pour chaque bien.
* Actions rapides :
  * 👁️ **Voir la fiche & le plan complet** d'amortissement année par année.
  * ✏️ **Modifier** les informations du bien.
  * 🚪 **Enregistrer une sortie / cession** (vente ou rebut) avec calcul automatique de la plus ou moins-value.
  * 🗑️ **Supprimer** un enregistrement.
* Export du registre complet au format **Excel (.xlsx)** en un clic.

### 3. 📑 Tableau Fiscal 2024 (Liasse Fiscale Officielle)
* Tableau récapitulatif par catégorie d'immobilisation conforme aux déclarations fiscales :
  * *Valeur brute début* $\rightarrow$ *Acquisitions (+)* $\rightarrow$ *Cessions (-)* $\rightarrow$ *Valeur brute fin*.
  * *Amortissements début* $\rightarrow$ *Dotations 2024 (+)* $\rightarrow$ *Amortissements sorties (-)* $\rightarrow$ *Cumul fin*.
  * *Valeur Nette Comptable (V.N.C.) au 31/12/2024*.
* Bouton **Imprimer / PDF** avec mise en page optimisée pour l'impression A4.
* Bouton **Télécharger Excel (.xlsx)**.

### 4. 🔄 Simulateur Prévisionnel d'Amortissement
* Calculez instantanément le tableau d'amortissement complet avant d'acheter un nouveau bien.
* Intègre la règle fiscale du **prorata temporis sur 360 jours**.

### 5. 🔒 Clôture de l'Exercice & Passage à l'Année N+1
* **Procédure de clôture sécurisée** :
  * Fige définitivement les dotations de l'exercice en cours (ex: 2024).
  * Reporte automatiquement ces dotations dans le cumul d'amortissement antérieur au 01/01 de l'exercice suivant (ex: 2025).
  * Archive définitivement les biens cédés ou mis au rebut.
  * Initialise l'exercice N+1 (ex: 2025).
* **Historique et consultation** : un sélecteur dans l'en-tête permet de basculer à tout moment entre les exercices clôturés et l'exercice en cours pour consultation.
* **Sécurités préalables intégrées** : boutons pour exporter la liasse Excel et télécharger une sauvegarde JSON avant de confirmer la clôture.

### 6. 📥 Import depuis l'ancienne base Access (`2CI FISCAL 2024.mdb`)
* Vous pouvez importer vos anciennes données en quelques secondes :
  1. Ouvrez votre base `2CI FISCAL 2024.mdb` dans Microsoft Access.
  2. Faites un clic droit sur la table d'immobilisations $\rightarrow$ **Exporter vers Excel** (ou CSV).
  3. Dans la nouvelle application Web, allez dans l'onglet **Import / Export** et déposez votre fichier Excel.
  4. Toutes vos immobilisations sont automatiquement converties et intégrées !

---

## 🛠️ Architecture Technique

* **Backend** : Python 3 avec API REST intégrée et base de données relationnelle **SQLite** (`sagi_immo.db`). Aucune installation externe obligatoire (fonctionne avec les modules standard de Python).
* **Frontend** : HTML5, Tailwind CSS, Chart.js, FontAwesome, SheetJS.
* **Devise** : Franc CFA (**FCFA**) avec formatage automatique des séparateurs de milliers.
* **Comptabilité** : Classes de comptes conformes **SYSCOHADA révisé** (218, 231, 241, 2441, 2442, 2443, 2451, 2452, 246...).

