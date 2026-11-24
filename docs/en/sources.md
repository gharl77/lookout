# Sources and keys

*[Français](../fr/sources.md) · [Back to contents](../README.md)*

Where each section's data comes from, what needs a key, and how to get it.

## Overview

| Section | Service | Key | Cost |
|---|---|---|---|
| RSS feeds | Each feed's own site | None | Free |
| YouTube | Each channel's public feed | None | Free |
| YouTube, sync | YouTube API (Google) | Google client ID (administrator) | Free |
| Weather | Open-Meteo; Environment Canada alerts | None | Free |
| Commute | OSRM | None | Free |
| Commute | TomTom | Key | Free tier |
| Commute | Home Assistant | Address and token | Yours |
| Scores | ESPN, HockeyTech | None | Free |
| Scores | API-Sports | Key | Free tier: 100 requests per day and per sport |
| Standings and statistics | ESPN, HockeyTech | None | Free |
| Calendar | Each calendar's iCal address | None | Free |
| Home Assistant | Your own Home Assistant | Address and long-lived access token | Yours |
| Stocks and currencies | Yahoo Finance (no guarantee of service) | None | Free |
| Releases, series | TVmaze | None | Free |
| Releases, movies | TMDB | Key | Free |
| Daily summary | Anthropic API (Claude) | Key | **Billed per use** |
| JSON API | The API of your choice | Depends on the API | Depends on the API |

A key is entered in the section's settings. An administrator can also provide it once for every profile (see
the [administration guide](administration.md#shared-keys)). Either way, it is no longer shown once saved.

## Getting each key

### TomTom

1. Create an account at `developer.tomtom.com`.
2. A key is created for you in your dashboard: copy it.
3. In the Commute section, choose the *TomTom* service and paste the key.

### API-Sports

1. Create an account at `dashboard.api-football.com`.
2. Copy the key from your dashboard.
3. In the Scores section, paste it under *API-Sports*, then *Add a league → Search for a league…*.

The free tier allows 100 requests per day and per sport. Lookout caches responses to stay within it, and does
not switch these leagues to once-a-minute updates during a game.

### TMDB

1. Create an account at `themoviedb.org`.
2. Under *Settings → API*, request a key (personal use).
3. Paste the short key (v3) or the long token (v4) into the Releases section.

This product uses the TMDB API but is not endorsed or certified by TMDB.

### Anthropic

1. Create an account at `platform.claude.com` and add a payment method.
2. Under *Settings → API keys*, create a key.
3. Paste it into the Daily summary section.

| Model | Use |
|---|---|
| Claude Opus 5.5 | Default; the most capable |
| Claude Sonnet 5.5 | About half the price |
| Claude Haiku 5.5 | The cheapest |

A summary with Opus 5.5 costs a few cents. Lookout only asks for a new one when the headlines have changed,
and never more than once an hour per section.

### Home Assistant

1. In Home Assistant, install a travel-time integration (*Waze Travel Time* or *Google Maps*).
2. In your Home Assistant profile, create a *long-lived access token*.
3. In the Commute section, choose *Home Assistant*, give the address, the token, and for each route the
   entity name (for example `sensor.waze_work`).

### Google (YouTube subscriptions)

The administrator creates the client ID: see the
[administration guide](administration.md#google-sign-in-for-youtube).

## Exporting your YouTube subscriptions (Google Takeout)

Without Google sign-in, you can still bring in all your subscriptions at once.

1. Open `takeout.google.com`, signed in to the account you use on YouTube.
2. Click *Deselect all*.
3. At the very bottom, tick *YouTube and YouTube Music*.
4. On that line, click *All YouTube data included*, then *Deselect all*, and tick only *subscriptions*.
5. *Next step*, then *Create export*. Google emails you when the archive is ready.
6. In the archive: *Takeout → YouTube and YouTube Music → subscriptions → subscriptions.csv*.
7. In the YouTube section: *Import my subscriptions…*.

The list does not follow your future subscriptions: add a new channel by hand, or import the file again.

## The feed catalogue

*Suggestions*, in a feed section, offers 23 categories:

News · World · Politics · Business · Tech · Artificial intelligence · Science · Space · Health · Environment ·
Sports · Culture · Movies · Series and TV · Music · Books · Video games · Cars · Food · Travel · Home and
lifestyle · Photo and design · Humour

Every feed was checked with Lookout's reader when it was added. A site may change its address afterwards: the
*Source status* pane flags it to the administrator.

Any other RSS or Atom feed can be pasted by its address.

## JSON API

To show a list taken from an API that returns JSON.

| Field | Role | Example |
|---|---|---|
| Address | The call to make | `https://hn.algolia.com/api/v1/search?tags=front_page` |
| Headers | One per line, `Name: value`; values are masked once saved | `Authorization: Bearer …` |
| List path | Where the array sits in the response | `hits` |
| Title | Title field in each item | `title` |
| Subtitle | Optional | `author` or `author.name` |
| Link | Optional | `url` |
| Date | Optional | `created_at` |
| Image | Optional | `thumbnail.url` |

A path walks down into objects with dots: `data.items`, `author.name`.

## Request frequency

Lookout goes easy on sources.

- Each section has an interval; a source is not requested again before it elapses, however many reloads or
  profiles look at it.
- *Update now* forces a request, at most once a minute.
- After an error, a new attempt is made two minutes later (fifteen for the summary).
- At most eight outbound requests at a time.
- With notifications, the server also watches your sections while the page is closed, through the same cache:
  weather at its interval, scores only when a followed game is near or under way.

## Disclaimer

ESPN, HockeyTech and YouTube's public feeds are undocumented interfaces that can change without notice.
Respect the terms of use of every service you connect.
