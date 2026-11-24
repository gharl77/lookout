# Sources et clés

*[English](../en/sources.md) · [Retour au sommaire](../README.md)*

D'où viennent les données de chaque section, ce qui demande une clé, et comment l'obtenir.

## Vue d'ensemble

| Section | Service | Clé | Coût |
|---|---|---|---|
| Fils RSS | Le site de chaque fil | Aucune | Gratuit |
| YouTube | Fils publics de chaque chaîne | Aucune | Gratuit |
| YouTube, synchronisation | API YouTube (Google) | Identifiant client Google (administrateur) | Gratuit |
| Météo | Open-Meteo ; alertes d'Environnement Canada | Aucune | Gratuit |
| Trajets | OSRM | Aucune | Gratuit |
| Trajets | TomTom | Clé | Forfait gratuit |
| Trajets | Home Assistant | Adresse et jeton | Le vôtre |
| Pointages | ESPN, HockeyTech | Aucune | Gratuit |
| Pointages | API-Sports | Clé | Forfait gratuit : 100 requêtes par jour et par sport |
| Agenda | L'adresse iCal de chaque calendrier | Aucune | Gratuit |
| Home Assistant | Votre propre Home Assistant | Adresse et jeton d'accès longue durée | Le vôtre |
| Bourse et devises | Yahoo Finance (service sans garantie) | Aucune | Gratuit |
| Sorties, séries | TVmaze | Aucune | Gratuit |
| Sorties, films | TMDB | Clé | Gratuit |
| Résumé du jour | API d'Anthropic (Claude) | Clé | **Payant à l'usage** |
| API JSON | L'API de votre choix | Selon l'API | Selon l'API |

Une clé se saisit dans les réglages de la section. Un administrateur peut aussi la fournir une fois pour tous
les profils (voir le [guide d'administration](administration.md#clés-partagées)). Dans tous les cas, elle
n'est plus affichée une fois enregistrée.

## Obtenir chaque clé

### TomTom

1. Créez un compte sur `developer.tomtom.com`.
2. Une clé est créée d'office dans votre tableau de bord : copiez-la.
3. Dans la section Trajets, choisissez le service *TomTom* et collez la clé.

### API-Sports

1. Créez un compte sur `dashboard.api-football.com`.
2. Copiez la clé de votre tableau de bord.
3. Dans la section Pointages, collez-la sous *API-Sports*, puis *Ajouter une ligue → Rechercher une ligue…*.

Le forfait gratuit permet 100 requêtes par jour et par sport. Lookout met les réponses en cache pour le
respecter, et ne passe pas ces ligues à la mise à jour chaque minute pendant un match.

### TMDB

1. Créez un compte sur `themoviedb.org`.
2. Dans *Paramètres → API*, demandez une clé (usage personnel).
3. Collez la clé courte (v3) ou le jeton long (v4) dans la section Sorties.

Ce produit utilise l'API de TMDB mais n'est ni approuvé ni certifié par TMDB.

### Anthropic

1. Créez un compte sur `platform.claude.com` et ajoutez un moyen de paiement.
2. Dans *Settings → API keys*, créez une clé.
3. Collez-la dans la section Résumé du jour.

| Modèle | Usage |
|---|---|
| Claude Opus 5.5 | Par défaut ; le plus capable |
| Claude Sonnet 5.5 | Environ deux fois moins cher |
| Claude Haiku 5.5 | Le plus économique |

Un résumé avec Opus 5.5 coûte quelques cents. Lookout n'en demande un nouveau que si les titres ont changé,
et jamais plus d'une fois par heure et par section.

### Home Assistant

1. Dans Home Assistant, installez une intégration de temps de trajet (*Waze Travel Time* ou *Google Maps*).
2. Dans votre profil Home Assistant, créez un *jeton d'accès longue durée*.
3. Dans la section Trajets, choisissez *Home Assistant*, donnez l'adresse, le jeton, et pour chaque trajet le
   nom de l'entité (par exemple `sensor.waze_travail`).

### Google (abonnements YouTube)

C'est l'administrateur qui crée l'identifiant client : voir le
[guide d'administration](administration.md#connexion-google-pour-youtube).

## Exporter ses abonnements YouTube (Google Takeout)

Sans connexion Google, vous pouvez reprendre tous vos abonnements d'un coup.

1. Ouvrez `takeout.google.com`, connecté au compte que vous utilisez sur YouTube.
2. Cliquez *Tout désélectionner*.
3. Tout en bas, cochez *YouTube et YouTube Music*.
4. Sur cette ligne, cliquez *Toutes les données YouTube incluses*, puis *Tout désélectionner*, et cochez
   seulement *abonnements*.
5. *Étape suivante*, puis *Créer une exportation*. Google envoie un courriel quand l'archive est prête.
6. Dans l'archive : *Takeout → YouTube et YouTube Music → abonnements → abonnements.csv*.
7. Dans la section YouTube : *Importer mes abonnements…*.

La liste ne suit pas vos futurs abonnements : ajoutez une nouvelle chaîne à la main, ou réimportez le fichier.

## Le catalogue de fils

*Suggestions*, dans une section de fils, propose 23 catégories :

Actualités · International · Politique · Économie · Techno · Intelligence artificielle · Science · Espace ·
Santé · Environnement · Sports · Culture · Films · Séries et télé · Musique · Livres · Jeux vidéo · Auto ·
Cuisine · Voyage · Maison et art de vivre · Photo et design · Humour

Chaque fil a été vérifié avec le lecteur de Lookout au moment de son ajout. Un site peut changer d'adresse
ensuite : la rubrique *État des sources* le signale à l'administrateur.

N'importe quel autre fil RSS ou Atom se colle par son adresse.

## API JSON

Pour afficher une liste tirée d'une API qui renvoie du JSON.

| Champ | Rôle | Exemple |
|---|---|---|
| Adresse | L'appel à faire | `https://hn.algolia.com/api/v1/search?tags=front_page` |
| En-têtes | Un par ligne, `Nom: valeur` ; les valeurs sont masquées une fois enregistrées | `Authorization: Bearer …` |
| Chemin de la liste | Où se trouve le tableau dans la réponse | `hits` |
| Titre | Champ du titre dans chaque élément | `title` |
| Sous-titre | Facultatif | `author` ou `author.name` |
| Lien | Facultatif | `url` |
| Date | Facultatif | `created_at` |
| Image | Facultatif | `thumbnail.url` |

Un chemin descend dans les objets avec des points : `data.items`, `author.name`.

## Fréquence des requêtes

Lookout ménage les sources.

- Chaque section a un intervalle ; une source n'est pas redemandée avant, quel que soit le nombre de
  rechargements ou de profils qui la regardent.
- *Mettre à jour maintenant* force une demande, au plus une fois par minute.
- Après une erreur, un nouvel essai a lieu deux minutes plus tard (quinze pour le résumé).
- Au plus huit requêtes sortantes à la fois.
- Avec les notifications, le serveur surveille aussi vos sections quand la page est fermée, par le même cache :
  la météo à son intervalle, les pointages seulement quand un match suivi approche ou est en cours.

## Avertissement

ESPN, HockeyTech et les fils publics de YouTube sont des interfaces non documentées, qui peuvent changer sans
préavis. Respectez les conditions d'utilisation de chaque service que vous branchez.
