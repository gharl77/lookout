import Foundation

/// Pointages sportifs : ESPN (sans clé), HockeyTech (ligues de hockey canadiennes) et API-Sports (clé personnelle).
enum SportsService {
    struct Result {
        var games: [Game] = []
        var errors: [UUID: String] = [:]
    }

    /// Fenêtre de dates demandée, en heure locale.
    struct Window {
        let start: Date
        let end: Date
        var days: [Date] {
            var out: [Date] = [], day = start
            while day <= end {
                out.append(day)
                day = Calendar.current.date(byAdding: .day, value: 1, to: day)!
            }
            return out
        }
    }

    static func fetch(_ options: SportsOptions) async throws -> Result {
        let leagues = options.leagues.filter(\.enabled)
        guard !leagues.isEmpty else { throw BriefingError("Aucune ligue active") }

        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let window = Window(start: calendar.date(byAdding: .day, value: options.showYesterday ? -1 : 0, to: today)!,
                            end: calendar.date(byAdding: .day, value: options.showUpcoming ? 1 : 0, to: today)!)

        var result = Result()
        await withTaskGroup(of: (League, Swift.Result<[Game], Error>).self) { group in
            for league in leagues {
                group.addTask {
                    do {
                        switch league.provider {
                        case .espn: return (league, .success(try await ESPN.games(league, window: window)))
                        case .hockeytech: return (league, .success(try await HockeyTech.games(league, window: window)))
                        case .apisports:
                            return (league, .success(try await APISports.games(league, window: window, key: options.apiSportsKey)))
                        }
                    } catch {
                        return (league, .failure(error))
                    }
                }
            }
            for await (league, outcome) in group {
                switch outcome {
                case .success(let games): result.games += games
                case .failure(let error): result.errors[league.id] = error.localizedDescription
                }
            }
        }
        if result.games.isEmpty, result.errors.count == leagues.count, let first = result.errors.values.first {
            throw BriefingError(first)
        }
        let upper = calendar.date(byAdding: .day, value: 1, to: window.end)!
        result.games = result.games.filter { $0.date >= window.start && $0.date < upper }.sorted { $0.date < $1.date }
        return result
    }

    /// Équipes d'une ligue, pour le sélecteur des réglages.
    static func teams(for league: League, apiSportsKey: String) async throws -> [TeamRef] {
        let teams: [TeamRef]
        switch league.provider {
        case .espn: teams = try await ESPN.teams(league)
        case .hockeytech: teams = try await HockeyTech.teams(league)
        case .apisports: teams = try await APISports.teams(league, key: apiSportsKey)
        }
        return teams.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    static func json(_ url: URL, headers: [String: String] = [:]) async throws -> [String: Any] {
        let data = try await HTTP.data(url, headers: headers)
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw BriefingError("Réponse inattendue")
        }
        return root
    }

    static func string(_ value: Any?) -> String? {
        if let s = value as? String { return s }
        if let n = value as? NSNumber { return n.stringValue }
        return nil
    }
}

// MARK: - ESPN

private enum ESPN {
    static func path(_ league: League) throws -> String {
        let path = league.path.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        guard path.split(separator: "/").count == 2 else { throw BriefingError("Chemin de ligue invalide (ex. hockey/nhl)") }
        return path
    }

    static func games(_ league: League, window: SportsService.Window) async throws -> [Game] {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd"
        var byID: [String: Game] = [:]
        // L'API n'accepte qu'une date à la fois.
        for day in window.days {
            for game in try await games(league, date: formatter.string(from: day)) { byID[game.id] = game }
        }
        return Array(byID.values)
    }

    private static func games(_ league: League, date: String) async throws -> [Game] {
        let url = try HTTP.url("https://site.api.espn.com/apis/site/v2/sports/\(try path(league))/scoreboard?dates=\(date)")
        let root: [String: Any]
        do { root = try await SportsService.json(url) } catch { throw BriefingError("Ligue introuvable ou indisponible") }
        guard let events = root["events"] as? [[String: Any]] else { throw BriefingError("Réponse inattendue") }

        let iso = ISO8601DateFormatter()
        return events.compactMap { event -> Game? in
            guard let id = event["id"] as? String,
                  let dateString = event["date"] as? String,
                  let date = iso.date(from: dateString) ?? iso.date(from: dateString.replacingOccurrences(of: "Z", with: ":00Z")),
                  let competition = (event["competitions"] as? [[String: Any]])?.first,
                  let competitors = competition["competitors"] as? [[String: Any]], competitors.count == 2
            else { return nil }

            func team(_ side: String) -> Game.Team? {
                guard let c = competitors.first(where: { $0["homeAway"] as? String == side }),
                      let t = c["team"] as? [String: Any] else { return nil }
                let abbreviation = t["abbreviation"] as? String ?? "?"
                return Game.Team(id: abbreviation, abbreviation: abbreviation,
                                 name: (t["shortDisplayName"] ?? t["displayName"]) as? String ?? "?",
                                 score: c["score"] as? String ?? "",
                                 logo: (t["logo"] as? String).flatMap(URL.init(string:)),
                                 isWinner: c["winner"] as? Bool ?? false)
            }
            guard let home = team("home"), let away = team("away") else { return nil }

            let status = (event["status"] as? [String: Any])?["type"] as? [String: Any]
            let stateName = status?["state"] as? String ?? "pre"
            let short = status?["shortDetail"] as? String ?? ""
            var state: Game.State = stateName == "in" ? .live : (stateName == "post" ? .final : .scheduled)
            var detail = short
            if state == .final {
                if status?["completed"] as? Bool == false {
                    state = .other   // reporté, annulé…
                } else {
                    detail = short.contains("SO") ? "Final (TB)" : (short.contains("OT") ? "Final (Prol.)" : "Final")
                }
            }
            let link = ((event["links"] as? [[String: Any]])?.first?["href"] as? String).flatMap(URL.init(string:))
            return Game(id: league.id.uuidString + id, leagueID: league.id, league: league.name, date: date,
                        state: state, detail: detail, away: away, home: home, link: link)
        }
    }

    static func teams(_ league: League) async throws -> [TeamRef] {
        let url = try HTTP.url("https://site.api.espn.com/apis/site/v2/sports/\(try path(league))/teams?limit=400")
        let root = try await SportsService.json(url)
        guard let sport = (root["sports"] as? [[String: Any]])?.first,
              let entry = (sport["leagues"] as? [[String: Any]])?.first,
              let teams = entry["teams"] as? [[String: Any]] else { throw BriefingError("Liste d'équipes indisponible") }
        return teams.compactMap { item in
            guard let t = item["team"] as? [String: Any], let abbreviation = t["abbreviation"] as? String else { return nil }
            return TeamRef(id: abbreviation, name: t["displayName"] as? String ?? abbreviation,
                           logo: ((t["logos"] as? [[String: Any]])?.first?["href"]) as? String)
        }
    }
}

// MARK: - HockeyTech (LHJMQ, LPHF, OHL, WHL, LAH…)

private enum HockeyTech {
    private static func feed(_ league: League, view: String, extra: [URLQueryItem] = [], lang: String) async throws -> [String: Any] {
        guard !league.path.isEmpty, !league.key.isEmpty else { throw BriefingError("Code ou clé HockeyTech manquant") }
        var comps = URLComponents(string: "https://lscluster.hockeytech.com/feed/")!
        comps.queryItems = [.init(name: "feed", value: "modulekit"), .init(name: "view", value: view),
                            .init(name: "key", value: league.key), .init(name: "client_code", value: league.path),
                            .init(name: "fmt", value: "json"), .init(name: "lang", value: lang)] + extra
        let root: [String: Any]
        do { root = try await SportsService.json(comps.url!) } catch { throw BriefingError("Ligue introuvable ou indisponible") }
        guard let kit = root["SiteKit"] as? [String: Any] else { throw BriefingError("Réponse inattendue") }
        return kit
    }

    /// Certaines ligues ne publient leur flux qu'en anglais : on essaie le français d'abord.
    private static func list(_ league: League, view: String, key: String, extra: [URLQueryItem] = []) async throws -> [[String: Any]] {
        let french = try await feed(league, view: view, extra: extra, lang: "fr")[key] as? [[String: Any]] ?? []
        if !french.isEmpty { return french }
        return try await feed(league, view: view, extra: extra, lang: "en")[key] as? [[String: Any]] ?? []
    }

    static func games(_ league: League, window: SportsService.Window) async throws -> [Game] {
        let today = Calendar.current.startOfDay(for: Date())
        let back = Calendar.current.dateComponents([.day], from: window.start, to: today).day ?? 1
        let ahead = Calendar.current.dateComponents([.day], from: today, to: window.end).day ?? 1
        let items = try await list(league, view: "scorebar", key: "Scorebar", extra: [
            .init(name: "numberofdaysback", value: String(back + 1)),
            .init(name: "numberofdaysahead", value: String(ahead + 1)),
            .init(name: "limit", value: "200"),
        ])
        let iso = ISO8601DateFormatter()
        return items.compactMap { g -> Game? in
            guard let id = SportsService.string(g["ID"]),
                  let date = (g["GameDateISO8601"] as? String).flatMap(iso.date(from:)) else { return nil }
            let status = SportsService.string(g["GameStatus"]) ?? "1"
            let label = (g["GameStatusStringLong"] as? String) ?? (g["GameStatusString"] as? String) ?? ""
            let homeGoals = Int(SportsService.string(g["HomeGoals"]) ?? "") ?? 0
            let awayGoals = Int(SportsService.string(g["VisitorGoals"]) ?? "") ?? 0

            var state = Game.State.other
            var detail = label
            switch status {
            case "1":
                state = .scheduled
            case "2", "3":
                state = .live
                let period = SportsService.string(g["PeriodNameShort"]) ?? ""
                let clock = SportsService.string(g["GameClock"]) ?? ""
                detail = g["Intermission"] as? String == "1" ? "Entracte \(period)" : "P\(period) \(clock)"
            case "4":
                state = .final
                let upper = label.uppercased()
                detail = upper.contains("TB") || upper.contains("FUS") || upper.contains("SO") ? "Final (TB)"
                    : (upper.contains("PROL") || upper.contains("OT") ? "Final (Prol.)" : "Final")
            default:
                break
            }

            func team(_ prefix: String, goals: Int, other: Int) -> Game.Team {
                let code = SportsService.string(g["\(prefix)Code"]) ?? "?"
                return Game.Team(id: SportsService.string(g["\(prefix)ID"]) ?? code, abbreviation: code,
                                 name: (g["\(prefix)Nickname"] as? String)?.trimmingCharacters(in: .whitespaces) ?? code,
                                 score: String(goals),
                                 logo: (g["\(prefix)Logo"] as? String).flatMap(URL.init(string:)),
                                 isWinner: state == .final && goals > other)
            }
            return Game(id: league.id.uuidString + id, leagueID: league.id, league: league.name, date: date,
                        state: state, detail: detail,
                        away: team("Visitor", goals: awayGoals, other: homeGoals),
                        home: team("Home", goals: homeGoals, other: awayGoals),
                        link: gameCentre(league.path, id: id))
        }
    }

    private static func gameCentre(_ code: String, id: String) -> URL? {
        switch code.lowercased() {
        case "lhjmq", "ohl", "whl": URL(string: "https://chl.ca/\(code.lowercased())/gamecentre/\(id)/")
        case "ahl": URL(string: "https://theahl.com/stats/game-center/\(id)")
        case "pwhl": URL(string: "https://www.thepwhl.com/en/stats/game-center/\(id)")
        default: nil
        }
    }

    static func teams(_ league: League) async throws -> [TeamRef] {
        let items = try await list(league, view: "teamsbyseason", key: "Teamsbyseason")
        let teams = items.compactMap { t -> TeamRef? in
            guard let id = SportsService.string(t["id"]), let name = t["name"] as? String,
                  !name.hasPrefix("-") else { return nil }   // « - … - » : adversaires hors ligue
            return TeamRef(id: id, name: name.trimmingCharacters(in: .whitespaces), logo: t["team_logo_url"] as? String)
        }
        if teams.isEmpty { throw BriefingError("Liste d'équipes indisponible") }
        return teams
    }
}

// MARK: - API-Sports (api-sports.io, clé personnelle)

enum APISports {
    struct LeagueResult: Identifiable {
        let id: String
        let name: String
        let country: String
        let season: String
    }

    /// Le forfait gratuit est limité à 100 requêtes par jour : les réponses sont mises en cache.
    private actor Cache {
        private var store: [String: (date: Date, value: [String: Any])] = [:]
        func get(_ key: String, maxAge: TimeInterval) -> [String: Any]? {
            guard let entry = store[key], Date().timeIntervalSince(entry.date) < maxAge else { return nil }
            return entry.value
        }
        func set(_ key: String, _ value: [String: Any]) { store[key] = (Date(), value) }
    }

    private static let cache = Cache()

    private static func host(_ sport: String) -> String {
        sport == "football" ? "v3.football.api-sports.io" : "v1.\(sport).api-sports.io"
    }

    private static func parts(_ league: League) throws -> (sport: String, id: String) {
        let parts = league.path.split(separator: "/").map(String.init)
        guard parts.count == 2 else { throw BriefingError("Ligue API-Sports invalide") }
        return (parts[0], parts[1])
    }

    private static func request(sport: String, path: String, query: [URLQueryItem], key: String,
                                maxAge: TimeInterval) async throws -> [[String: Any]] {
        let key = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { throw BriefingError("Clé API-Sports manquante (voir les réglages de la section)") }
        var comps = URLComponents(string: "https://\(host(sport))/\(path)")!
        comps.queryItems = query
        let cacheKey = comps.url!.absoluteString
        var root = await cache.get(cacheKey, maxAge: maxAge)
        if root == nil {
            let fresh = try await SportsService.json(comps.url!, headers: ["x-apisports-key": key])
            // L'API signale ses erreurs (clé, quota, forfait) dans le corps de la réponse.
            if let errors = fresh["errors"] as? [String: Any], let first = errors.values.first {
                throw BriefingError("API-Sports : \(SportsService.string(first) ?? "erreur")")
            }
            if let errors = fresh["errors"] as? [Any], let first = errors.first {
                throw BriefingError("API-Sports : \(SportsService.string(first) ?? "erreur")")
            }
            await cache.set(cacheKey, fresh)
            root = fresh
        }
        return root?["response"] as? [[String: Any]] ?? []
    }

    static func games(_ league: League, window: SportsService.Window, key: String) async throws -> [Game] {
        let (sport, leagueID) = try parts(league)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = Calendar.current.startOfDay(for: Date())
        var games: [String: Game] = [:]
        for day in window.days {
            // Une requête par jour et par sport, toutes ligues confondues, filtrée ensuite localement.
            let items = try await request(
                sport: sport, path: sport == "football" ? "fixtures" : "games",
                query: [.init(name: "date", value: formatter.string(from: day)),
                        .init(name: "timezone", value: TimeZone.current.identifier)],
                key: key, maxAge: day == today ? 20 * 60 : 6 * 3600)
            for item in items {
                guard SportsService.string((item["league"] as? [String: Any])?["id"]) == leagueID,
                      let game = parse(item, league: league) else { continue }
                games[game.id] = game
            }
        }
        return Array(games.values)
    }

    private static func parse(_ item: [String: Any], league: League) -> Game? {
        // Selon le sport, l'essentiel est sous « fixture », « game » ou à la racine.
        let core = (item["fixture"] as? [String: Any]) ?? (item["game"] as? [String: Any]) ?? item
        guard let id = SportsService.string(core["id"]) else { return nil }

        var date: Date?
        if let t = core["timestamp"] as? Double { date = Date(timeIntervalSince1970: t) }
        if date == nil, let t = (core["date"] as? [String: Any])?["timestamp"] as? Double { date = Date(timeIntervalSince1970: t) }
        if date == nil, let s = core["date"] as? String { date = FeedDate.parse(s) }
        guard let date else { return nil }

        let status = core["status"] as? [String: Any]
        let short = (SportsService.string(status?["short"]) ?? "NS").uppercased()
        let long = SportsService.string(status?["long"]) ?? short
        let state: Game.State
        var detail = long
        if ["NS", "TBD"].contains(short) {
            state = .scheduled
        } else if ["FT", "AET", "PEN", "AOT", "AP", "AW", "WO"].contains(short) {
            state = .final
            detail = ["PEN", "AP"].contains(short) ? "Final (TB)" : (["AET", "AOT"].contains(short) ? "Final (Prol.)" : "Final")
        } else if ["PST", "POST", "CANC", "ABD", "SUSP", "INTR", "AWD"].contains(short) {
            state = .other
        } else {
            state = .live
            if let elapsed = SportsService.string(status?["elapsed"]) ?? SportsService.string(status?["timer"]) {
                detail = "\(short) \(elapsed)′"
            }
        }

        let teams = item["teams"] as? [String: Any]
        let scores = (item["goals"] as? [String: Any]) ?? (item["scores"] as? [String: Any])
        func score(_ side: String) -> Int? {
            if let n = scores?[side] as? Int { return n }
            return (scores?[side] as? [String: Any])?["total"] as? Int
        }
        func team(_ side: String, other: String) -> Game.Team? {
            guard let t = teams?[side] as? [String: Any], let teamID = SportsService.string(t["id"]) else { return nil }
            let name = t["name"] as? String ?? "?"
            let mine = score(side), theirs = score(other)
            return Game.Team(id: teamID, abbreviation: String(name.prefix(3)).uppercased(), name: name,
                             score: mine.map(String.init) ?? "",
                             logo: (t["logo"] as? String).flatMap(URL.init(string:)),
                             isWinner: state == .final && (mine ?? 0) > (theirs ?? 0))
        }
        guard let home = team("home", other: "away"), let away = team("away", other: "home") else { return nil }
        return Game(id: league.id.uuidString + id, leagueID: league.id, league: league.name, date: date,
                    state: state, detail: detail, away: away, home: home, link: nil)
    }

    static func teams(_ league: League, key: String) async throws -> [TeamRef] {
        let (sport, leagueID) = try parts(league)
        let items = try await request(sport: sport, path: "teams",
                                      query: [.init(name: "league", value: leagueID), .init(name: "season", value: league.key)],
                                      key: key, maxAge: 24 * 3600)
        return items.compactMap { item in
            let t = (item["team"] as? [String: Any]) ?? item
            guard let id = SportsService.string(t["id"]), let name = t["name"] as? String else { return nil }
            return TeamRef(id: id, name: name, logo: t["logo"] as? String)
        }
    }

    static func searchLeagues(sport: String, query: String, key: String) async throws -> [LeagueResult] {
        let items = try await request(sport: sport, path: "leagues", query: [.init(name: "search", value: query)],
                                      key: key, maxAge: 24 * 3600)
        return items.compactMap { item in
            let l = (item["league"] as? [String: Any]) ?? item
            guard let id = SportsService.string(l["id"]), let name = l["name"] as? String else { return nil }
            let seasons = item["seasons"] as? [[String: Any]] ?? []
            let current = seasons.first { $0["current"] as? Bool == true } ?? seasons.last
            let season = SportsService.string(current?["year"]) ?? SportsService.string(current?["season"]) ?? ""
            return LeagueResult(id: id, name: name, country: (item["country"] as? [String: Any])?["name"] as? String ?? "",
                                season: season)
        }
    }
}
