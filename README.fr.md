# Lookout

[![Image Docker](https://github.com/gharl77/lookout/actions/workflows/docker.yml/badge.svg)](https://github.com/gharl77/lookout/actions/workflows/docker.yml)
![Version](https://img.shields.io/badge/version-2026.11.2-blue)
![Licence](https://img.shields.io/badge/licence-MIT-green)
![Plateformes](https://img.shields.io/badge/plateformes-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey)

*[English](README.md)*

Lookout est un tableau de bord personnel auto-hébergé : actualités, météo, trajets, pointages sportifs et
nouvelles techno sur une seule page. Tout se configure dans l'interface web — les sections, leur ordre, leur
taille, leurs sources — et chaque source est soit un fil RSS, soit une API.

- Un seul petit conteneur, sans base de données ni dépendance externe
- Multiutilisateur : chaque personne a un profil avec ses propres sections, sources et préférences
- Fonctionne dans n'importe quel navigateur ; sur iPhone, s'ajoute à l'écran d'accueil comme une app
- Thèmes clair et sombre, couleur d'accent, densité et nombre de colonnes réglables
- Plusieurs pages (onglets), disposition par glisser-déposer avec annulation, et pastille sur les articles parus depuis votre dernière visite
- Interface bilingue (français / anglais)
- Respectueux des sources : chacune est interrogée au plus une fois par intervalle, peu importe le nombre de rechargements (30 minutes par défaut, 5 pour les pointages et les trajets, réglable par section)

## Sections

| Section | Source | Clé requise |
|---|---|---|
| Fils RSS | N'importe quel fil RSS ou Atom, avec filtres par mots-clés et trois présentations | Non |
| Météo | [Open-Meteo](https://open-meteo.com), avec les alertes d'Environnement Canada | Non |
| Trajets | OSRM, TomTom (circulation en direct) ou capteur Home Assistant | TomTom seulement |
| Pointages | ESPN, HockeyTech (LHJMQ, LPHF, OHL, WHL, LAH), API-Sports — choix des équipes par ligue, classement, matchs en direct mis à jour chaque minute | API-Sports seulement |
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
| `/data` | Comptes (`users.json`), sessions ouvertes (`sessions.json`), un dossier par profil (`profiles/<id>/` : réglages et état de lecture) et le cache de géocodage |

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `TZ` | `Etc/UTC` | Fuseau horaire, qui détermine ce qu'est « aujourd'hui » pour les pointages (ex. `America/Toronto`) |
| `LOOKOUT_PASSWORD` | *(aucun)* | Barrière supplémentaire facultative devant tout le reste (authentification HTTP Basic), en plus des comptes |
| `LOOKOUT_USER` | `lookout` | Nom d'utilisateur associé à `LOOKOUT_PASSWORD` |
| `LOOKOUT_CONTACT` | adresse du projet | Contact (adresse `mailto:` ou `https:`) annoncé aux services de notifications lors d'un envoi |
| `PORT` | `8080` | Port d'écoute du serveur dans le conteneur |

## Comptes et profils

Lookout est multiutilisateur. À la première ouverture, il demande de créer le compte **administrateur** (nom et
mot de passe). Par la suite, seuls les administrateurs peuvent créer des comptes.

- **Profils** : l'administrateur en crée un par personne (Réglages → Profils), à partir des réglages de départ
  ou en copie d'un autre profil. Il peut aussi réinitialiser un mot de passe, remplacer les réglages d'un profil
  par une copie de ceux d'un autre, ou le supprimer. Chacun modifie ses propres sections, sources et préférences.
- **Rester connecté** : une fois connecté sur un appareil, on le reste — malgré les redémarrages et les mises à
  jour — jusqu'à ce qu'on se déconnecte ou que le mot de passe change. Les formulaires sont standards : le
  navigateur ou le gestionnaire de mots de passe peut enregistrer le mot de passe.
- **Les mots de passe** sont enregistrés hachés (scrypt), jamais en clair. Les sessions utilisent un témoin `HttpOnly`.
  Un mot de passe donné par un administrateur est provisoire : la personne choisit le sien à sa connexion suivante.
- **Les administrateurs** peuvent aussi voir qui est en ligne, ouvrir le tableau de bord d'un autre profil en
  lecture seule, envoyer une copie d'une de leurs sections à d'autres profils (menu ⋯ de la carte) et fournir des
  **clés d'API partagées** (TomTom, API-Sports), utilisées par tout profil qui n'a pas la sienne.
- **Sauvegarde complète** (Réglages → Sauvegarde) : un seul fichier avec tous les comptes, les réglages de chaque
  profil et les clés d'API, à restaurer sur le même serveur ou sur une installation neuve. Gardez-le en lieu sûr :
  il contient les clés.
- **Créez l'administrateur dès l'installation.** Tant qu'il n'existe pas, la première personne qui ouvre la page
  peut le créer.

## Utilisateur et permissions

Le conteneur tourne avec l'UID/GID `1000:1000` et doit pouvoir écrire dans `/data`.

- **Dossier de l'hôte** (comme ci-dessus) : créez-le d'abord et rendez-le accessible à cet utilisateur — `sudo chown 1000:1000 /chemin/vers/lookout/data`. Si le dossier n'existe pas, Docker le crée au nom de `root` et le conteneur s'arrête avec un message « ne peut pas écrire dans /data ».
- **Autre utilisateur** : ajoutez `user: "UID:GID"` au fichier compose (ou `--user UID:GID`) et donnez-lui le dossier.
- **Volume nommé** : fonctionne sans réglage.

## Étiquettes d'image

| Étiquette | Description |
|---|---|
| `latest` | Dernière construction de la branche `main` |
| `2026.11.2` | Une version précise |

Les images sont construites pour `linux/amd64` et `linux/arm64`.

Les versions sont numérotées `année.mois.numéro` : `2026.11.1` est la première version de novembre 2026.
Voir les [notes de version](CHANGELOG.md).

## Mise à jour

```bash
docker compose pull && docker compose up -d
```

Dans Portainer : ouvrez le stack et choisissez **Re-pull image and redeploy**.

## Sauvegarde

Tout se trouve dans le volume `/data` : copiez ce dossier pour sauvegarder tous les profils. Chacun peut aussi
utiliser **Réglages → Mes données → Exporter** pour télécharger sa propre configuration en JSON.

## Sécurité

Lookout est prévu pour un réseau domestique. Chaque profil est protégé par son mot de passe, mais utilisez
HTTPS (par un proxy inverse) si le réseau n'est pas entièrement de confiance : sans lui, les mots de passe
circulent en clair.

Les clés d'API et les jetons que vous entrez sont en écriture seule : le serveur ne les renvoie jamais au
navigateur (l'interface affiche un masque à la place) et ils sont absents des fichiers exportés. Ils sont
enregistrés en clair dans `config.json` : protégez le dossier `/data` comme tout fichier contenant des secrets.

- Ne l'exposez pas directement sur Internet ; passez par un VPN ou un proxy inverse avec HTTPS.
- Les proxys qui mettent les fichiers statiques en cache (comme l'option « Cache Assets » de Nginx Proxy Manager) ne posent pas de problème : les fichiers de l'interface sont servis à une adresse qui change à chaque version.

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

## Licence

[MIT](LICENSE). Les icônes de `public/icons.js` viennent de [Phosphor Icons](https://phosphoricons.com), aussi sous licence MIT.

## Avertissement

Projet personnel. Les sources ESPN et HockeyTech sont des API publiques non documentées,
qui peuvent changer sans préavis. Respectez les conditions d'utilisation de chaque service que vous branchez.
