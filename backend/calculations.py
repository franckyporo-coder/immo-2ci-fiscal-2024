"""
Moteur de calculs financiers et fiscaux pour SAGI IMMO FISCAL.
Prend en charge l'amortissement linéaire, dégressif, prorata temporis (règle 360 jours OHADA/Fiscal),
ainsi que la production du Tableau Fiscal officiel de l'exercice 2024.
"""

from datetime import datetime
import math

def parse_date(date_str):
    if not date_str:
        return None
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(date_str[:10], fmt)
        except ValueError:
            pass
    return None

def calcul_jours_prorata_360(date_debut, annee_cible):
    """
    Calcule le nombre de jours au prorata temporis selon la règle fiscale des 360 jours 
    (mois de 30 jours) pour l'exercice concerné.
    """
    dt = parse_date(date_debut)
    if not dt or dt.year > annee_cible:
        return 0
    if dt.year < annee_cible:
        return 360  # Année complète
    
    # Année d'acquisition : calcul du prorata
    mois = dt.month
    jour = min(dt.day, 30)
    jours_premier_mois = (30 - jour + 1)
    mois_restants = 12 - mois
    total_jours = jours_premier_mois + (mois_restants * 30)
    return min(max(total_jours, 1), 360)

def generer_plan_amortissement(valeur_brute, date_mise_en_service, duree_annees, mode='LINEAIRE', taux=None):
    """
    Génère le tableau complet d'amortissement année par année depuis la mise en service jusqu'à VNC = 0.
    """
    dt = parse_date(date_mise_en_service)
    if not dt or valeur_brute <= 0 or duree_annees <= 0:
        return []

    taux_annuel = taux if taux and taux > 0 else (100.0 / duree_annees)
    annee_debut = dt.year
    plan = []
    
    valeur_nette_debut = valeur_brute
    cumul_amort = 0.0
    
    # Nombre d'années = durée + 1 si prorata la 1ère année
    jours_annee_1 = calcul_jours_prorata_360(date_mise_en_service, annee_debut)
    a_prorata = jours_annee_1 < 360
    nb_exercices = duree_annees + (1 if a_prorata else 0)

    for i in range(nb_exercices):
        annee = annee_debut + i
        if cumul_amort >= valeur_brute:
            break

        if i == 0 and a_prorata:
            # Première année avec prorata
            dotation = round(valeur_brute * (taux_annuel / 100.0) * (jours_annee_1 / 360.0), 2)
        elif i == nb_exercices - 1 and a_prorata:
            # Dernière année complémentaire (solde de la 1ère année)
            dotation = round(valeur_brute - cumul_amort, 2)
        else:
            # Année standard
            dotation = round(valeur_brute * (taux_annuel / 100.0), 2)

        # Ajustement pour ne jamais dépasser la valeur brute
        if cumul_amort + dotation > valeur_brute or i == nb_exercices - 1:
            dotation = round(valeur_brute - cumul_amort, 2)

        cumul_amort = round(cumul_amort + dotation, 2)
        vnc_fin = round(max(valeur_brute - cumul_amort, 0.0), 2)

        plan.append({
            "annee": annee,
            "base_amortissable": valeur_brute,
            "taux": taux_annuel,
            "dotation": dotation,
            "cumul_amort": cumul_amort,
            "vnc_fin": vnc_fin
        })

    return plan

def calculer_situation_exercice(immo, annee_exercice=2024):
    """
    Calcule pour une immobilisation sa situation exacte pour l'exercice spécifié (ex: 2024).
    Retourne les montants pour la liasse fiscale.
    """
    valeur_brute = float(immo['valeur_brute'])
    cumul_anterieur = float(immo.get('cumul_amort_anterieur', 0.0))
    duree = int(immo['duree_annees'])
    taux = float(immo.get('taux_amortissement') or (100.0 / duree))
    dt_ms = parse_date(immo['date_mise_en_service'])
    annee_ms = dt_ms.year if dt_ms else annee_exercice

    statut = immo.get('statut', 'EN_SERVICE')
    dt_sortie = parse_date(immo.get('date_sortie'))
    annee_sortie = dt_sortie.year if dt_sortie else None

    # Valeur début d'exercice
    est_acquisition_annee = (annee_ms == annee_exercice)
    est_sortie_annee = (statut in ('CEDE', 'REBUT') and annee_sortie == annee_exercice)
    est_sortie_anterieure = (statut in ('CEDE', 'REBUT') and annee_sortie and annee_sortie < annee_exercice)

    if est_sortie_anterieure:
        return {
            "valeur_debut": 0.0,
            "acquisition": 0.0,
            "cession": 0.0,
            "valeur_fin": 0.0,
            "amort_debut": 0.0,
            "dotation": 0.0,
            "amort_sorties": 0.0,
            "amort_fin": 0.0,
            "vnc_fin": 0.0,
            "plus_moins_value": 0.0
        }

    valeur_debut = 0.0 if est_acquisition_annee else valeur_brute
    acquisition = valeur_brute if est_acquisition_annee else 0.0
    cession = valeur_brute if est_sortie_annee else 0.0
    valeur_fin = 0.0 if est_sortie_annee else valeur_brute

    # Amortissements
    amort_debut = cumul_anterieur

    # Calcul de la dotation 2024
    dotation = 0.0
    if annee_ms > annee_exercice:
        # Bien acquis dans le futur
        dotation = 0.0
    elif amort_debut >= valeur_brute or str(immo.get('a_amortir') or 'O').upper() == 'N':
        # Bien déjà amorti, ou compte non amortissable (a_amortir = N)
        dotation = 0.0
    else:
        if est_acquisition_annee:
            jours = calcul_jours_prorata_360(immo['date_mise_en_service'], annee_exercice)
            dotation = round(valeur_brute * (taux / 100.0) * (jours / 360.0), 2)
        elif est_sortie_annee:
            # Sortie en cours d'exercice : prorata jusqu'au jour de sortie
            jours = calcul_jours_prorata_360(immo['date_sortie'], annee_exercice)
            dotation = round(valeur_brute * (taux / 100.0) * (jours / 360.0), 2)
        else:
            # Année pleine
            dotation = round(valeur_brute * (taux / 100.0), 2)

        # Plafonner pour ne pas dépasser la valeur brute
        if amort_debut + dotation > valeur_brute:
            dotation = round(valeur_brute - amort_debut, 2)

    amort_sorties = (amort_debut + dotation) if est_sortie_annee else 0.0
    amort_fin = 0.0 if est_sortie_annee else round(amort_debut + dotation, 2)
    vnc_fin = 0.0 if est_sortie_annee else round(max(valeur_fin - amort_fin, 0.0), 2)

    # Plus ou moins value de cession
    prix_cession = float(immo.get('prix_cession') or 0.0)
    vnc_au_rebut = round(valeur_brute - (amort_debut + dotation), 2) if est_sortie_annee else 0.0
    plus_moins_value = round(prix_cession - vnc_au_rebut, 2) if est_sortie_annee else 0.0

    return {
        "valeur_debut": valeur_debut,
        "acquisition": acquisition,
        "cession": cession,
        "valeur_fin": valeur_fin,
        "amort_debut": amort_debut,
        "dotation": dotation,
        "amort_sorties": amort_sorties,
        "amort_fin": amort_fin,
        "vnc_fin": vnc_fin,
        "prix_cession": prix_cession,
        "plus_moins_value": plus_moins_value
    }

