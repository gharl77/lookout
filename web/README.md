# Lookout — version web / web version

Serveur Node sans dépendance + interface web, dans un conteneur Docker. Voir le [README principal](../README.md).
Zero-dependency Node server + web UI, in a Docker container. See the [main README](../README.md).

## Docker

`compose.yaml` est prêt à coller dans un stack Portainer, ou : / is ready to paste into a Portainer stack, or:

    docker compose up -d

| Variable | Rôle / Purpose | Défaut / Default |
|---|---|---|
| `TZ` | Fuseau horaire / Time zone | `America/Toronto` |
| `LOOKOUT_PASSWORD` | Mot de passe facultatif / Optional password | — |
| `LOOKOUT_USER` | Utilisateur / User name | `lookout` |

Les données (`config.json`, `read.json`, `geocode.json`) vivent dans le volume `/data`.
Data lives in the `/data` volume.

## Développement / Development

    PORT=8791 node server.js

`scripts/build-icons.py` régénère `public/icons.js` à partir de `@phosphor-icons/core` (MIT).

Les textes sont en français dans le code ; `public/i18n.js` contient leur traduction anglaise.
UI strings are written in French in the code; `public/i18n.js` holds their English translation.
