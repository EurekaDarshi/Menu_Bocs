# Menu BOCS — Choix des menus de l'atelier ministériel

Petit site permettant aux visiteurs du **BOCS** (Bureau Opérationnel de Coordination et de Suivi) de choisir leur plat pour le déjeuner de l'atelier « Module Ministériel » — cette semaine avec le **MASAE** (Ministère de l'Agriculture, de la Souveraineté Alimentaire et de l'Élevage).

## Fonctionnalités

**Visiteurs** (`/`)
- Saisie du nom, prénom, structure et choix du plat dans une liste déroulante
- Reçu affiché à l'écran + **téléchargement du reçu en PDF**
- Une même personne (nom + prénom + structure) peut modifier son choix : l'inscription est mise à jour, pas dupliquée

**Administrateur** (`/admin.html`, bouton « Espace admin » en haut à droite)
- Connexion par mot de passe
- Ajout / modification / suppression des plats, activation ou désactivation de leur disponibilité
- Synthèse du nombre de plats commandés
- Liste des participants avec recherche et filtre par plat
- **Téléchargement Excel (.xlsx) ou CSV** : récapitulatif du nombre de chaque plat en haut, puis la liste nominative
- Paramètres de l'atelier (ministère accueilli, dates, lieu, message d'accueil, ouverture/fermeture des inscriptions)
- Remise à zéro des inscriptions pour l'atelier suivant

## Architecture

```
public/                  Frontend (HTML/CSS/JS, sans framework)
  index.html             Page visiteurs
  admin.html             Espace administrateur
  assets/                Styles, scripts, génération du reçu PDF
  vendor/                jsPDF (reçus) et SheetJS (export Excel)
netlify/
  functions/api.mjs      Backend : fonction Netlify servie sur /api/*
  lib/api.mjs            Logique de l'API (routes, validation, authentification)
  lib/store.mjs          Stockage : Netlify Blobs en production, fichiers JSON en local
scripts/
  dev.mjs                Serveur de développement local
  smoke-test.mjs         Tests de l'API
netlify.toml             Configuration Netlify
```

**Pas besoin de base de données externe** : les données (plats, paramètres, inscriptions) sont stockées dans **Netlify Blobs**, le stockage intégré et gratuit de Netlify. Rien à installer ni à configurer.

## Déploiement sur Netlify

1. Sur [app.netlify.com](https://app.netlify.com) : **Add new site → Import an existing project** → choisir GitLab (ou GitHub) et ce dépôt.
2. Les réglages de build sont lus automatiquement depuis `netlify.toml` (pas de commande de build, dossier publié : `public`).
3. Dans **Site configuration → Environment variables**, ajouter :
   | Variable | Valeur |
   |---|---|
   | `ADMIN_PASSWORD` | le mot de passe administrateur (choisissez-en un solide) |
   | `ADMIN_SECRET` *(facultatif)* | une longue chaîne aléatoire pour signer les sessions admin |
4. Déployer (ou **Deploys → Trigger deploy** si la variable a été ajoutée après le premier déploiement).
5. Se connecter sur `https://<votre-site>.netlify.app/admin.html`, ajouter les plats, renseigner les dates et le lieu dans **Paramètres**.

## Développement local

```bash
npm install
npm run dev     # http://localhost:8888 — mot de passe admin local : admin
npm test        # tests de l'API
```

En local les données sont enregistrées dans `.data/` (ignoré par git).

## Pousser le dépôt sur GitLab

```bash
git remote add gitlab https://gitlab.com/<votre-compte>/menu-bocs.git
git push -u gitlab main
```
