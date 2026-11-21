import Foundation

// MARK: - Configuration complète (sérialisée en JSON)

struct AppConfig: Codable, Equatable {
    var version = 1
    var general = GeneralSettings()
    var sections: [SectionConfig] = []
}

enum Appearance: String, Codable, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: "Automatique"
        case .light: "Clair"
        case .dark: "Sombre"
        }
    }
}

enum Density: String, Codable, CaseIterable, Identifiable {
    case compact, comfortable, spacious
    var id: String { rawValue }
    var label: String {
        switch self {
        case .compact: "Compacte"
        case .comfortable: "Confortable"
        case .spacious: "Aérée"
        }
    }
    var rowSpacing: CGFloat { [.compact: 6, .comfortable: 10, .spacious: 14][self]! }
    var cardPadding: CGFloat { [.compact: 12, .comfortable: 16, .spacious: 20][self]! }
    var gridSpacing: CGFloat { [.compact: 12, .comfortable: 16, .spacious: 22][self]! }
}

enum UnitSystem: String, Codable, CaseIterable, Identifiable {
    case metric, imperial
    var id: String { rawValue }
    var label: String { self == .metric ? "Métrique (°C, km)" : "Impérial (°F, mi)" }
}

struct GeneralSettings: Codable, Equatable {
    var displayName = ""
    var showGreeting = true
    var showGlance = true
    var appearance = Appearance.system
    var accentHex = "#3B82F6"
    var tintedBackdrop = true
    /// 0 = automatique selon la largeur de la fenêtre.
    var columns = 0
    var density = Density.comfortable
    /// 0 = actualisation manuelle seulement.
    var refreshMinutes = 15
    var openLinksInBackground = false
    var dimReadArticles = true
    var units = UnitSystem.metric
}

// MARK: - Sections

enum SectionKind: String, Codable, CaseIterable, Identifiable {
    case feed, weather, commute, sports, api
    var id: String { rawValue }

    var label: String {
        switch self {
        case .feed: "Fils RSS"
        case .weather: "Météo"
        case .commute: "Trajets"
        case .sports: "Pointages sportifs"
        case .api: "API JSON"
        }
    }

    var detail: String {
        switch self {
        case .feed: "Articles de un ou plusieurs fils RSS / Atom"
        case .weather: "Conditions et prévisions (API Open-Meteo)"
        case .commute: "Temps de parcours en direct (API Plans ou OSRM)"
        case .sports: "Résultats et matchs à venir (API ESPN, HockeyTech ou API-Sports)"
        case .api: "Liste tirée de n'importe quelle API JSON"
        }
    }

    var icon: String {
        switch self {
        case .feed: "newspaper.fill"
        case .weather: "cloud.sun.fill"
        case .commute: "car.fill"
        case .sports: "sportscourt.fill"
        case .api: "curlybraces"
        }
    }

    var colorHex: String {
        switch self {
        case .feed: "#EF4444"
        case .weather: "#0EA5E9"
        case .commute: "#10B981"
        case .sports: "#F59E0B"
        case .api: "#8B5CF6"
        }
    }

    var defaultMaxItems: Int {
        switch self {
        case .feed, .api: 6
        case .weather: 1
        case .commute: 4
        case .sports: 8
        }
    }
}

struct SectionConfig: Codable, Identifiable, Equatable {
    var id = UUID()
    var kind: SectionKind
    var title: String
    var icon: String
    var colorHex: String
    var enabled = true
    /// Largeur en colonnes : 1, 2, ou 99 (pleine largeur).
    var span = 1
    var maxItems: Int
    var feed = FeedOptions()
    var weather = WeatherOptions()
    var commute = CommuteOptions()
    var sports = SportsOptions()
    var api = APIOptions()

    init(kind: SectionKind, title: String? = nil, icon: String? = nil, colorHex: String? = nil,
         span: Int = 1, maxItems: Int? = nil) {
        self.kind = kind
        self.title = title ?? kind.label
        self.icon = icon ?? kind.icon
        self.colorHex = colorHex ?? kind.colorHex
        self.span = span
        self.maxItems = maxItems ?? kind.defaultMaxItems
    }

    /// Empreinte des réglages qui exigent de retélécharger les données (pas la présentation).
    func fetchSignature(units: UnitSystem) -> String {
        struct Sig: Encodable {
            let kind: SectionKind, units: UnitSystem
            let feed: [FeedSource]?, weather: WeatherOptions?, commute: CommuteOptions?
            let sports: SportsFetchSig?, api: APIOptions?
        }
        struct SportsFetchSig: Encodable { let leagues: [League], upcoming: Bool, yesterday: Bool, key: String }
        let sig = Sig(
            kind: kind, units: units,
            feed: kind == .feed ? feed.sources : nil,
            weather: kind == .weather ? weather : nil,
            commute: kind == .commute ? commute : nil,
            sports: kind == .sports
                ? SportsFetchSig(leagues: sports.leagues, upcoming: sports.showUpcoming, yesterday: sports.showYesterday,
                                 key: sports.apiSportsKey) : nil,
            api: kind == .api ? api : nil)
        let enc = JSONEncoder()
        enc.outputFormatting = .sortedKeys
        return (try? enc.encode(sig)).flatMap { String(data: $0, encoding: .utf8) } ?? UUID().uuidString
    }
}

// MARK: - Fils RSS

struct FeedSource: Codable, Identifiable, Equatable, Hashable {
    var id = UUID()
    var name: String
    var url: String
    var enabled = true
}

enum FeedLayout: String, Codable, CaseIterable, Identifiable {
    case list, headline, compact
    var id: String { rawValue }
    var label: String {
        switch self {
        case .list: "Liste"
        case .headline: "À la une"
        case .compact: "Titres seulement"
        }
    }
}

enum FeedOrdering: String, Codable, CaseIterable, Identifiable {
    case newest, balanced
    var id: String { rawValue }
    var label: String { self == .newest ? "Plus récents d'abord" : "Alterner entre les sources" }
}

struct FeedOptions: Codable, Equatable {
    var sources: [FeedSource] = []
    var layout = FeedLayout.list
    var ordering = FeedOrdering.balanced
    var showImages = true
    var showSummary = false
    var showSource = true
    var showTime = true
    /// 0 = aucune limite d'âge.
    var maxAgeHours = 48
    /// Mots-clés séparés par des virgules.
    var includeKeywords = ""
    var excludeKeywords = ""
}

// MARK: - Météo

struct WeatherOptions: Codable, Equatable {
    var locationName = "Montréal, Québec"
    var latitude = 45.5019
    var longitude = -73.5674
    var showDetails = true
    var showHourly = true
    var hourlyCount = 12
    var showDaily = true
    var dailyCount = 7
}

// MARK: - Trajets

enum CommuteProvider: String, Codable, CaseIterable, Identifiable {
    case apple, osrm
    var id: String { rawValue }
    var label: String { self == .apple ? "Plans (avec circulation)" : "OSRM (sans circulation)" }
}

enum CommuteMode: String, Codable, CaseIterable, Identifiable {
    case driving, walking, transit
    var id: String { rawValue }
    var label: String {
        switch self {
        case .driving: "Voiture"
        case .walking: "À pied"
        case .transit: "Transport en commun"
        }
    }
    var icon: String {
        switch self {
        case .driving: "car.fill"
        case .walking: "figure.walk"
        case .transit: "tram.fill"
        }
    }
}

struct CommuteRoute: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String
    var from: String
    var to: String
    var mode = CommuteMode.driving
    var enabled = true
}

struct CommuteOptions: Codable, Equatable {
    var routes: [CommuteRoute] = []
    var provider = CommuteProvider.apple
    var showAlternates = true
}

// MARK: - Sports

enum SportsProvider: String, Codable, CaseIterable, Identifiable {
    case espn, hockeytech, apisports
    var id: String { rawValue }
    var label: String {
        switch self {
        case .espn: "ESPN"
        case .hockeytech: "HockeyTech"
        case .apisports: "API-Sports"
        }
    }
}

/// Équipe choisie dans une ligue. L'identifiant dépend du fournisseur
/// (abréviation pour ESPN, numéro d'équipe pour HockeyTech et API-Sports).
struct TeamRef: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var name: String
    var logo: String?
}

struct League: Codable, Identifiable, Equatable, Hashable {
    var id = UUID()
    var name: String
    /// ESPN : « hockey/nhl ». HockeyTech : code de la ligue (« lhjmq »). API-Sports : « sport/idLigue » (« hockey/57 »).
    var path: String
    var enabled = true
    var provider = SportsProvider.espn
    /// HockeyTech : clé publique du flux. API-Sports : saison en cours.
    var key = ""
    /// Équipes à afficher ; vide = toutes les équipes de la ligue.
    var teams: [TeamRef] = []
}

extension League {
    // Décodage tolérant : les configurations d'avant l'ajout des fournisseurs restent lisibles.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        path = try c.decodeIfPresent(String.self, forKey: .path) ?? ""
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        provider = try c.decodeIfPresent(SportsProvider.self, forKey: .provider) ?? .espn
        key = try c.decodeIfPresent(String.self, forKey: .key) ?? ""
        teams = try c.decodeIfPresent([TeamRef].self, forKey: .teams) ?? []
    }
}

struct SportsOptions: Codable, Equatable {
    var leagues: [League] = []
    var showYesterday = true
    var showUpcoming = true
    var showLogos = true
    /// Clé personnelle API-Sports (api-sports.io), requise seulement pour les ligues de ce fournisseur.
    var apiSportsKey = ""
}

extension SportsOptions {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        leagues = try c.decodeIfPresent([League].self, forKey: .leagues) ?? []
        showYesterday = try c.decodeIfPresent(Bool.self, forKey: .showYesterday) ?? true
        showUpcoming = try c.decodeIfPresent(Bool.self, forKey: .showUpcoming) ?? true
        showLogos = try c.decodeIfPresent(Bool.self, forKey: .showLogos) ?? true
        apiSportsKey = try c.decodeIfPresent(String.self, forKey: .apiSportsKey) ?? ""
    }
}

// MARK: - API JSON générique

struct APIOptions: Codable, Equatable {
    var url = ""
    /// Une entrée « Nom: valeur » par ligne.
    var headers = ""
    var itemsPath = ""
    var titlePath = "title"
    var subtitlePath = ""
    var linkPath = "url"
    var datePath = ""
    var imagePath = ""
}
