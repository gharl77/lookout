import Foundation

/// Fils RSS suggérés (tous vérifiés), regroupés par catégorie.
enum FeedCatalog {
    struct Category: Identifiable {
        let name: String
        let feeds: [(name: String, url: String)]
        var id: String { name }
    }

    static let categories: [Category] = [
        Category(name: "Actualités", feeds: [
            ("Radio-Canada – À la une", "https://ici.radio-canada.ca/rss/4159"),
            ("Radio-Canada – En continu", "https://ici.radio-canada.ca/rss/1000524"),
            ("La Presse", "https://www.lapresse.ca/actualites/rss"),
            ("Le Devoir", "https://www.ledevoir.com/rss/manchettes.xml"),
            ("Le Journal de Montréal", "https://www.journaldemontreal.com/rss.xml"),
            ("CBC Top Stories", "https://www.cbc.ca/webfeed/rss/rss-topstories"),
        ]),
        Category(name: "International", feeds: [
            ("Le Monde", "https://www.lemonde.fr/rss/une.xml"),
            ("BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"),
        ]),
        Category(name: "Techno", feeds: [
            ("Numerama", "https://www.numerama.com/feed/"),
            ("MacGeneration", "https://www.macg.co/news/feed"),
            ("The Verge", "https://www.theverge.com/rss/index.xml"),
            ("Ars Technica", "https://feeds.arstechnica.com/arstechnica/index"),
            ("9to5Mac", "https://9to5mac.com/feed/"),
            ("TechCrunch", "https://techcrunch.com/feed/"),
            ("Hacker News", "https://hnrss.org/frontpage"),
        ]),
        Category(name: "Sports", feeds: [
            ("La Presse – Sports", "https://www.lapresse.ca/sports/rss"),
            ("Radio-Canada – Sports", "https://ici.radio-canada.ca/rss/771"),
        ]),
        Category(name: "Économie", feeds: [
            ("Radio-Canada – Économie", "https://ici.radio-canada.ca/rss/5717"),
            ("La Presse – Affaires", "https://www.lapresse.ca/affaires/rss"),
        ]),
    ]

    static func source(_ name: String) -> FeedSource {
        let feed = categories.flatMap(\.feeds).first { $0.name == name }!
        return FeedSource(name: feed.name, url: feed.url)
    }
}

enum LeagueCatalog {
    static let espn: [(name: String, path: String)] = [
        ("LNH", "hockey/nhl"),
        ("NFL", "football/nfl"),
        ("NBA", "basketball/nba"),
        ("MLB", "baseball/mlb"),
        ("MLS", "soccer/usa.1"),
        ("LCF", "football/cfl"),
        ("WNBA", "basketball/wnba"),
        ("Premier League", "soccer/eng.1"),
        ("Ligue 1", "soccer/fra.1"),
        ("Ligue des champions", "soccer/uefa.champions"),
    ]

    /// Ligues HockeyTech : code de la ligue et clé publique de son flux de statistiques.
    static let hockeyTech: [(name: String, code: String, key: String)] = [
        ("LHJMQ", "lhjmq", "f322673b6bcae299"),
        ("LPHF", "pwhl", "446521baf8c38984"),
        ("OHL", "ohl", "2976319eb44abe94"),
        ("WHL", "whl", "41b145a848f4bd67"),
        ("LAH", "ahl", "50c2cd9b5e18e390"),
    ]

    /// Sports offerts par API-Sports (nom affiché, identifiant du service).
    static let apiSports: [(name: String, sport: String)] = [
        ("Soccer", "football"), ("Hockey", "hockey"), ("Basketball", "basketball"), ("Baseball", "baseball"),
        ("Football américain", "american-football"), ("Rugby", "rugby"), ("Handball", "handball"),
        ("Volleyball", "volleyball"),
    ]
}

extension SectionConfig {
    /// Nouvelle section prête à l'emploi pour un type donné.
    static func template(_ kind: SectionKind) -> SectionConfig {
        var s = SectionConfig(kind: kind)
        switch kind {
        case .feed:
            s.title = "Nouveau fil"
            s.feed.sources = [FeedCatalog.source("Radio-Canada – À la une")]
        case .weather:
            break
        case .commute:
            s.commute.routes = [CommuteRoute(name: "Nouveau trajet", from: "", to: "")]
        case .sports:
            s.sports.leagues = [League(name: "LNH", path: "hockey/nhl")]
        case .api:
            s.title = "Hacker News"
            s.icon = "flame.fill"
            s.api = APIOptions(url: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
                               itemsPath: "hits", titlePath: "title", subtitlePath: "author",
                               linkPath: "url", datePath: "created_at")
        }
        return s
    }
}

extension AppConfig {
    static var defaults: AppConfig {
        var config = AppConfig()
        config.general.displayName = NSFullUserName().split(separator: " ").first.map(String.init) ?? ""

        let weather = SectionConfig(kind: .weather)

        var commute = SectionConfig(kind: .commute)
        commute.commute.routes = [
            CommuteRoute(name: "Vers l'aéroport", from: "Place Ville Marie, Montréal",
                         to: "Aéroport Montréal-Trudeau"),
            CommuteRoute(name: "Montréal → Québec", from: "Montréal, QC", to: "Québec, QC"),
        ]

        var news = SectionConfig(kind: .feed, title: "À la une", span: 2, maxItems: 7)
        news.feed.layout = .headline
        news.feed.showSummary = true
        news.feed.sources = ["Radio-Canada – À la une", "La Presse", "Le Devoir"].map(FeedCatalog.source)

        var scores = SectionConfig.template(.sports)
        scores.title = "Pointages"

        var tech = SectionConfig(kind: .feed, title: "Techno", icon: "cpu.fill", colorHex: "#6366F1", maxItems: 7)
        tech.feed.sources = ["Numerama", "MacGeneration", "The Verge", "Ars Technica"].map(FeedCatalog.source)

        var sportsNews = SectionConfig(kind: .feed, title: "Sports", icon: "figure.hockey", colorHex: "#F97316")
        sportsNews.feed.sources = ["La Presse – Sports", "Radio-Canada – Sports"].map(FeedCatalog.source)

        var world = SectionConfig(kind: .feed, title: "International", icon: "globe.europe.africa.fill",
                                  colorHex: "#14B8A6")
        world.feed.sources = ["Le Monde", "BBC World"].map(FeedCatalog.source)

        var economy = SectionConfig(kind: .feed, title: "Économie", icon: "chart.line.uptrend.xyaxis",
                                    colorHex: "#22C55E", maxItems: 5)
        economy.feed.sources = ["Radio-Canada – Économie", "La Presse – Affaires"].map(FeedCatalog.source)
        economy.feed.layout = .compact

        var hn = SectionConfig.template(.api)
        hn.feed.layout = .compact

        config.sections = [weather, news, commute, scores, tech, sportsNews, world, economy, hn]
        return config
    }
}
