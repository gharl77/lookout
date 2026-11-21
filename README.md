# Lookout

**Version 0.1.0-beta**

*[English below](#english)*

Lookout est un tableau de bord personnel : actualités, météo, trajets, pointages sportifs et nouvelles techno
sur une seule page, à consulter à n'importe quelle heure. Tout est configurable — les sections, leur ordre,
leur taille, leurs sources — et chaque source est soit un fil RSS, soit une API.

Deux versions partagent le même format de configuration :

| | Dossier | Pour |
|---|---|---|
| **Web** | [`web/`](web) | N'importe quel navigateur, iPhone compris (s'ajoute à l'écran d'accueil). Auto-hébergée dans Docker. Bilingue français / anglais. |
| **macOS** | [`mac/`](mac) | App native SwiftUI. En français pour le moment. |

## Sections

- **Fils RSS** — un ou plusieurs fils par section, avec filtres par mots-clés, âge maximal et trois présentations.
- **Météo** — conditions, prévisions horaires et quotidiennes ([Open-Meteo](https://open-meteo.com), sans clé).
- **Trajets** — temps de parcours : OSRM (sans clé), TomTom (clé, circulation en direct) ou capteur Home Assistant ; Plans d'Apple dans l'app Mac.
- **Pointages** — ESPN (LNH, NFL, NBA, MLB, MLS…), HockeyTech (LHJMQ, LPHF, OHL, WHL, LAH) et API-Sports (clé). Choix des équipes par ligue.
- **API JSON** — n'importe quelle API qui renvoie une liste, en indiquant le chemin des champs.

## Installation de la version web

Collez [`web/compose.yaml`](web/compose.yaml) dans un stack Portainer, ou lancez `docker compose up -d` dans `web/`.
L'image est publiée sur `ghcr.io/gharl77/lookout`. Ouvrez ensuite `http://<serveur>:8765`.

Lookout est prévu pour un réseau domestique : ne l'exposez pas directement sur Internet. Passez par un VPN
ou un proxy inverse avec HTTPS, et activez `LOOKOUT_PASSWORD` au besoin.

## Avertissement

Projet personnel en version bêta. Les sources ESPN et HockeyTech sont des API publiques non documentées,
qui peuvent changer sans préavis. Respectez les conditions d'utilisation de chaque service.

---

## English

Lookout is a personal dashboard: news, weather, commute times, sports scores and tech headlines on a single
page, readable at any time of day. Everything is configurable — sections, their order, size and sources —
and every source is either an RSS feed or an API.

Two versions share the same configuration format:

| | Folder | For |
|---|---|---|
| **Web** | [`web/`](web) | Any browser, including iPhone (can be added to the Home Screen). Self-hosted in Docker. Bilingual French / English. |
| **macOS** | [`mac/`](mac) | Native SwiftUI app. French only for now. |

### Sections

- **RSS feeds** — one or more feeds per section, with keyword filters, maximum age and three layouts.
- **Weather** — current conditions, hourly and daily forecast ([Open-Meteo](https://open-meteo.com), no key).
- **Commute** — travel times: OSRM (no key), TomTom (key, live traffic) or a Home Assistant sensor; Apple Maps in the Mac app.
- **Scores** — ESPN (NHL, NFL, NBA, MLB, MLS…), HockeyTech (QMJHL, PWHL, OHL, WHL, AHL) and API-Sports (key). Pick teams per league.
- **JSON API** — any API that returns a list, by giving the path of each field.

### Installing the web version

Paste [`web/compose.yaml`](web/compose.yaml) into a Portainer stack, or run `docker compose up -d` in `web/`.
The image is published at `ghcr.io/gharl77/lookout`. Then open `http://<server>:8765`.

Lookout is meant for a home network: do not expose it directly to the Internet. Use a VPN or an HTTPS
reverse proxy, and set `LOOKOUT_PASSWORD` if needed.

### Disclaimer

Personal project, beta quality. The ESPN and HockeyTech sources are undocumented public APIs that may change
without notice. Respect each service's terms of use.
