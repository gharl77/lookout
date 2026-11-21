# Lookout

[![Image Docker](https://github.com/gharl77/lookout/actions/workflows/docker.yml/badge.svg)](https://github.com/gharl77/lookout/actions/workflows/docker.yml)
![Version](https://img.shields.io/badge/version-0.1.0--beta-blue)
![Plateformes](https://img.shields.io/badge/plateformes-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey)

*[English](README.md)*

Lookout est un tableau de bord personnel auto-hébergé : actualités, météo, trajets, pointages sportifs et
nouvelles techno sur une seule page. Tout se configure dans l'interface web — les sections, leur ordre, leur
taille, leurs sources — et chaque source est soit un fil RSS, soit une API.

- Un seul petit conteneur, sans base de données ni dépendance externe
- Fonctionne dans n'importe quel navigateur ; sur iPhone, s'ajoute à l'écran d'accueil comme une app
- Thèmes clair et sombre, couleur d'accent, densité et nombre de colonnes réglables
- Interface bilingue (français / anglais)
- Respectueux des sources : chacune est interrogée au plus une fois par intervalle (30 minutes par défaut), peu importe le nombre de rechargements

## Sections

| Section | Source | Clé requise |
|---|---|---|
| Fils RSS | N'importe quel fil RSS ou Atom, avec filtres par mots-clés et trois présentations | Non |
| Météo | [Open-Meteo](https://open-meteo.com) | Non |
| Trajets | OSRM, TomTom (circulation en direct) ou capteur Home Assistant | TomTom seulement |
| Pointages | ESPN, HockeyTech (LHJMQ, LPHF, OHL, WHL, LAH), API-Sports — choix des équipes par ligue | API-Sports seulement |
| API JSON | N'importe quelle API qui renvoie une liste, par chemin de champs | Selon l'API |

## Démarrage rapide

### Docker Compose (recommandé)

```yaml
services:
  lookout:
    image: ghcr.io/gharl77/lookout:latest
    container_name: lookout
    restart: unless-stopped
    ports:
      - "8765:8080"
    environment:
      TZ: America/Toronto
      # LOOKOUT_PASSWORD: changez-moi   # facultatif : exiger un mot de passe (utilisateur « lookout »)
    volumes:
      - ./data:/data
```

```bash
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d
```

### Ligne de commande Docker

```bash
docker run -d \
  --name lookout \
  --restart unless-stopped \
  -p 8765:8080 \
  -e TZ=America/Toronto \
  -v /chemin/vers/lookout/data:/data \
  ghcr.io/gharl77/lookout:latest
```

Ouvrez ensuite `http://<ip-du-serveur>:8765` et cliquez sur l'engrenage pour configurer vos sections.

## Paramètres

### Ports

| Conteneur | Description |
|---|---|
| `8080` | Interface web et API |

### Volumes

| Chemin dans le conteneur | Description |
|---|---|
| `/data` | Configuration (`config.json`), état de lecture (`read.json`) et cache de géocodage (`geocode.json`) |

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `TZ` | `Etc/UTC` | Fuseau horaire, qui détermine ce qu'est « aujourd'hui » pour les pointages (ex. `America/Toronto`) |
| `LOOKOUT_PASSWORD` | *(aucun)* | Si défini, l'interface demande ce mot de passe (authentification HTTP Basic) |
| `LOOKOUT_USER` | `lookout` | Nom d'utilisateur associé à `LOOKOUT_PASSWORD` |
| `PORT` | `8080` | Port d'écoute du serveur dans le conteneur |

## Utilisateur et permissions

Le conteneur tourne avec l'UID/GID `1000:1000` et doit pouvoir écrire dans `/data`.

- **Dossier de l'hôte** (comme ci-dessus) : créez-le d'abord et rendez-le accessible à cet utilisateur — `sudo chown 1000:1000 /chemin/vers/lookout/data`. Si le dossier n'existe pas, Docker le crée au nom de `root` et le conteneur s'arrête avec un message « ne peut pas écrire dans /data ».
- **Autre utilisateur** : ajoutez `user: "UID:GID"` au fichier compose (ou `--user UID:GID`) et donnez-lui le dossier.
- **Volume nommé** : fonctionne sans réglage.

## Étiquettes d'image

| Étiquette | Description |
|---|---|
| `latest` | Dernière construction de la branche `main` |
| `v0.1.0-beta` | Une version précise |

Les images sont construites pour `linux/amd64` et `linux/arm64`.

## Mise à jour

```bash
docker compose pull && docker compose up -d
```

Dans Portainer : ouvrez le stack et choisissez **Re-pull image and redeploy**.

## Sauvegarde

Tout se trouve dans le volume `/data`. Copiez ce dossier, ou utilisez **Réglages → Données → Exporter** pour
télécharger la configuration en JSON, importable dans une autre instance.

## Sécurité

Lookout est prévu pour un réseau domestique. Quiconque peut l'atteindre peut lire le tableau de bord et
modifier ses réglages.

Les clés d'API et les jetons que vous entrez sont en écriture seule : le serveur ne les renvoie jamais au
navigateur (l'interface affiche un masque à la place) et ils sont absents des fichiers exportés. Ils sont
enregistrés en clair dans `config.json` : protégez le dossier `/data` comme tout fichier contenant des secrets.

- Ne l'exposez pas directement sur Internet ; passez par un VPN ou un proxy inverse avec HTTPS.
- Définissez `LOOKOUT_PASSWORD` si d'autres personnes partagent votre réseau.

## Exemple renforcé

Le conteneur n'a besoin d'aucun privilège et peut tourner avec un système de fichiers en lecture seule :

```yaml
services:
  lookout:
    image: ghcr.io/gharl77/lookout:latest
    container_name: lookout
    restart: unless-stopped
    user: "1000:1000"
    ports:
      - "8765:8080"
    environment:
      TZ: America/Toronto
    volumes:
      - ./data:/data
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
```

## Construire à partir des sources

Node.js 22 ou plus récent, aucune dépendance à installer.

```bash
git clone https://github.com/gharl77/lookout.git
cd lookout
PORT=8080 node server.js        # exécution locale, données dans ./data
docker build -t lookout .       # ou construire l'image
```

Les textes de l'interface sont en français dans le code ; `public/i18n.js` contient leur traduction anglaise.

Chaque construction est testée avant la publication de l'image : installation neuve avec les réglages par
défaut, installation renforcée en lecture seule, et dossier de données inaccessible. Les mêmes vérifications
se lancent sur n'importe quelle instance avec `node scripts/smoke-test.mjs http://localhost:8080`.

## Avertissement

Projet personnel en version bêta. Les sources ESPN et HockeyTech sont des API publiques non documentées,
qui peuvent changer sans préavis. Respectez les conditions d'utilisation de chaque service que vous branchez.
