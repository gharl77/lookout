# User guide

*[Français](../fr/guide.md) · [Back to contents](../README.md)*

This guide covers everything you can do in Lookout once signed in. For installation, accounts and backups, see
the [administration guide](administration.md); for external services and their keys, see
[Sources and keys](sources.md).

## Contents

- [First sign-in](#first-sign-in)
- [The dashboard](#the-dashboard)
- [Arranging cards](#arranging-cards)
- [Section types](#section-types)
- [Reading articles](#reading-articles)
- [Search](#search)
- [Read later](#read-later)
- [Notifications](#notifications)
- [Display mode](#display-mode)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [On iPhone and iPad](#on-iphone-and-ipad)

## First sign-in

An administrator creates your profile and gives you a name and a **temporary** password. The first time you
sign in, Lookout asks you to choose your own password: the administrator does not know it.

If your profile is brand new, a few questions then set up your dashboard:

1. your first name and the city for your weather;
2. the topics you care about (each becomes a feed section);
3. the sports leagues you follow;
4. your teams in those leagues.

You can skip these questions at any point. Everything they set can be changed later in the settings.

Once signed in on a device you stay signed in, across server restarts and updates, until you sign out or your
password changes.

## The dashboard

- **Top left**: the logo, then the time of the last update and of the next one.
- **Top right**, in order: *Read later* (shown once an article is saved), *Search*, *Refresh*, *Arrange*,
  *Settings*, and your account badge.
- **Greeting**: the date, a greeting with your first name, and an *at a glance* strip (weather and first commute).
- **Page tabs**, when there is more than one page.
- **Cards**: one per section.

Each card has two buttons in its header: the circular arrow updates that section only, and `⋯` opens its menu:

| Menu entry | Effect |
|---|---|
| Update now | Requests the section's data again (at most once a minute) |
| Mark all as read | For article sections |
| Width | 1, 2 or 3 columns, or full width |
| Configure… | Opens that section's settings |
| Move to page | When there are several pages |
| Send to a profile… | Administrators only: drops a copy into another profile |
| Hide | Removes the card without deleting the section |

The account badge leads to *My account*, *Display mode*, *Profiles* (administrators) and sign-out.

## Arranging cards

- **With a mouse**: drag a card by its header, at any time. A line shows where it will land.
- **By touch**: tap *Arrange* first, then drag.
- Each card keeps the column you drop it in: the others do not move.
- After a move, a hide or a width change, a banner offers to **undo** for a few seconds.
- In *Arrange* mode, a banner offers *Auto-arrange* (puts cards back into the least-filled columns),
  *Add a section* and *Done*.

The number of columns follows the screen width, or can be fixed in *Settings → Appearance*. On a narrow screen
everything moves to a single column.

## Section types

*Add a section* offers seven types, plus two shortcuts.

### RSS feeds

Articles from one or more RSS or Atom feeds.

- **Sources**: paste a feed address, or pick from *Suggestions* (23 categories, over 150 verified feeds). The
  order of sources is used to alternate articles.
- **Layout**: *List*, *Top stories* (first article large), *Thumbnails* or *Headlines only*.
- **Order**: newest first, or alternating between sources so a very active feed does not take over.
- **Display**: images, summary, source name, publication time.
- **Filters**: maximum age, required words, excluded words, highlighted words. Words are separated by commas
  and searched in the title and summary.
- **Notifications**: *Notify about new articles* (see [Notifications](#notifications)).

*Feeds by category…* creates a ready-made section for a topic in one step (Movies, Series and TV, Culture,
Science, Video games and so on), with three sources in the interface language.

### YouTube

The latest videos from your channels, as thumbnails. No key is needed.

- **Add a channel**: paste its address (`youtube.com/@name`) or its `@name`.
- **Import my subscriptions…**: brings in all your channels at once from a Google Takeout file. The `i` button
  lists the steps.
- **Google account**: if the administrator has set it up, *Link my Google account* keeps the list in step with
  your subscriptions, once a day. Lookout only asks to read your subscriptions. In this mode, channels added by
  hand that are not among your subscriptions are removed at each sync.
- **Play videos inside Lookout**: a click opens the video over the dashboard. `Cmd`-click or `Ctrl`-click opens
  it on youtube.com.
- **Hide Shorts and live streams**.

### Weather

Current conditions, hourly and daily forecast for a place, from Open-Meteo. In Canada, Environment Canada
alerts are shown at the top of the card. Options: alerts, details (feels like, wind, humidity, sun), number of
hours and days.

### Commute

Travel time for one or more routes (origin, destination, travel mode).

| Service | Live traffic | Key |
|---|---|---|
| OSRM | No | None |
| TomTom | Yes | Free key |
| Home Assistant | Depends on your sensor (Waze, Google Maps) | Your Home Assistant address and token |

### Sports scores

Results, live and upcoming games, standings.

- **Leagues**: ESPN (NHL, NFL, NBA, MLB, MLS, CFL and others, or any league by its path), HockeyTech (QMJHL,
  PWHL, OHL, WHL, AHL), API-Sports (with a key).
- **Teams**: for each league, *All teams* or only the ones you follow.
- During a game of a team you follow, the section updates every minute.

### JSON API

A list taken from any API that returns JSON. You give the address, any headers and the path of the fields
(list, title, subtitle, link, date, image). See [Sources and keys](sources.md#json-api).

### Releases

Season premieres of series (TVmaze, no key) and movies in theatres or upcoming (TMDB, free key), for a country
and a period.

### Daily summary

The essentials of your feeds in a few points, written by Claude. It needs an Anthropic key, either yours or
the one the administrator has opened to you.

- **Model**: Claude Opus 5.5 (default), Sonnet 5.5 or Haiku 5.5, from most capable to cheapest.
- **Particular emphasis**: a free-form instruction, for example “Quebec and tech first”.
- **Summarized sections**: all your feeds, or only the ones you tick.
- Only headlines from the last 24 hours are sent to Anthropic. A new summary is requested only when the
  headlines have changed, and never more than once an hour.

## Reading articles

- A click opens the article in a new tab and marks it as read.
- Read articles are dimmed (adjustable). The read state is stored on the server: it follows you across devices.
- The **New** badge marks articles published since your previous visit on this device. The marker only moves
  forward if you were away for at least ten minutes.
- Right-click an article (desktop): open, copy link, save for later, mark read or unread.

## Search

The magnifying glass, or the `/` key, searches the articles of **all** your sections, across every page, and
*Read later*. With several words, all must be present.

## Read later

The bookmark on an article keeps it in a personal list. It appears on hover with a mouse and is always visible
on touch screens. The list (200 articles at most) is stored on the server and shared across your devices. Open
it with the bookmark button in the top bar.

## Notifications

*Settings → Notifications.* Lookout can alert you even when the page is closed.

**Requirements**
- The address must be **HTTPS**.
- On **iPhone or iPad**, first add Lookout to the Home Screen (*Share → Add to Home Screen*) and open it from
  its icon.
- On **Mac or PC**, use Safari, Chrome, Edge or Firefox, and allow that browser's notifications in the system
  settings.

**What triggers a notification**
- a new **weather alert** for one of your weather sections;
- the **start of a game** of a team you follow, and its **final score** if you turn that on;
- a **new article** in a section where you turned on *Notify about new articles*. Tapping the notification
  opens the article. Beyond three new items at once, a single notification announces them.

Each device subscribes separately. The *Send a test notification* button checks the full path for this device.
How quickly an article notification arrives depends on the section's interval.

## Display mode

For a wall screen, a tablet or a TV: full screen, no buttons, with the time. Pages rotate (duration set in
*Settings → Display mode*) and the screen stays on.

- **Enter**: account badge → *Display mode*, or the settings.
- **Leave**: `Escape`, or touch the screen then *Leave*.
- The address keeps `?affichage=1`: bookmark it to come straight back.

## Settings

The gear, or `Cmd`+`,`. Changes are saved automatically. A search field at the top of the navigation finds a
setting by keyword.

| Group | Pane | What it holds |
|---|---|---|
| Dashboard | Sections | Add, delete, duplicate, order and configure each section |
| | Pages | Create, rename, order and delete pages |
| Preferences | General | Language, units, greeting, default update interval |
| | Appearance | Theme, accent colour, backdrop, density, number of columns |
| | Reading and filters | Dim read articles; words hidden or highlighted in every feed |
| | Notifications | Subscribe this device; choose what triggers a notification |
| | Display mode | Duration of each page; start the mode |
| Account | My account | Password, sign-out |
| | My data | Export, import or reset your own configuration |
| — | About | Version, location of your settings, links |

Administrators also see the *Administration* group: see the [administration guide](administration.md).

**Updating sources.** Each source is queried at most once per interval, even if you reload the page more
often: this keeps sites from blocking you. The default interval is 30 minutes; scores and commutes use
5 minutes, releases and the summary 2 hours. Each section can have its own.

**Export and import.** The exported file contains your sections, sources and preferences, but neither your
keys nor your tokens.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` or `Cmd`/`Ctrl`+`K` | Search articles |
| `R` | Refresh all sections |
| `Cmd`/`Ctrl`+`,` | Open settings |
| `Escape` | Close a window, cancel a drag, leave display mode |

## On iPhone and iPad

In Safari: *Share → Add to Home Screen*. Lookout then opens like an app, full screen, and can receive
notifications. Cards move to a single column and settings show one pane at a time, with a *Back* button.
