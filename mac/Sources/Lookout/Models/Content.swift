import Foundation

struct Article: Identifiable, Hashable {
    var id: String
    var title: String
    var summary: String
    var link: URL?
    var date: Date?
    var imageURL: URL?
    var source: String
}

struct WeatherData {
    struct Hour: Identifiable {
        let time: Date
        let temperature: Double
        let code: Int
        let isDay: Bool
        let precipitationChance: Int
        var id: Date { time }
    }

    struct Day: Identifiable {
        let date: Date
        let code: Int
        let low: Double
        let high: Double
        let precipitationChance: Int
        var id: Date { date }
    }

    var timeZone: TimeZone
    var temperature: Double
    var apparent: Double
    var humidity: Int
    var windSpeed: Double
    var windGusts: Double
    var code: Int
    var isDay: Bool
    var sunrise: Date?
    var sunset: Date?
    var hours: [Hour]
    var days: [Day]
    var temperatureUnit: String
    var windUnit: String
}

struct Game: Identifiable {
    /// `other` : reporté, annulé, etc. — on affiche alors le libellé du fournisseur.
    enum State { case scheduled, live, final, other }

    struct Team {
        /// Identifiant utilisé pour le choix d'équipes (voir `TeamRef`).
        let id: String
        let abbreviation: String
        let name: String
        let score: String
        let logo: URL?
        let isWinner: Bool
    }

    let id: String
    let leagueID: UUID
    let league: String
    let date: Date
    let state: State
    let detail: String
    let away: Team
    let home: Team
    let link: URL?
}

struct RouteResult: Identifiable {
    struct Alternate: Identifiable {
        let id = UUID()
        let name: String
        let duration: TimeInterval
    }

    let id: UUID
    let name: String
    let mode: CommuteMode
    var via = ""
    var duration: TimeInterval = 0
    var distance: Double = 0
    var notices: [String] = []
    var alternates: [Alternate] = []
    var error: String?
}

enum SectionContent {
    case articles([Article])
    case weather(WeatherData)
    case sports([Game])
    case commute([RouteResult])

    var isEmpty: Bool {
        switch self {
        case .articles(let a): a.isEmpty
        case .weather: false
        case .sports(let g): g.isEmpty
        case .commute(let r): r.isEmpty
        }
    }
}

struct SectionState {
    var content: SectionContent?
    var isLoading = false
    var error: String?
    var updatedAt: Date?
    /// Erreurs par source (identifiant de la source → message).
    var sourceErrors: [UUID: String] = [:]
}

struct BriefingError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

// MARK: - Météo : codes WMO

enum WMO {
    static func label(_ code: Int) -> String {
        switch code {
        case 0: "Dégagé"
        case 1: "Généralement dégagé"
        case 2: "Partiellement nuageux"
        case 3: "Couvert"
        case 45, 48: "Brouillard"
        case 51, 53, 55: "Bruine"
        case 56, 57: "Bruine verglaçante"
        case 61: "Pluie faible"
        case 63: "Pluie"
        case 65: "Pluie forte"
        case 66, 67: "Pluie verglaçante"
        case 71: "Neige faible"
        case 73: "Neige"
        case 75: "Neige forte"
        case 77: "Grains de neige"
        case 80, 81: "Averses"
        case 82: "Averses fortes"
        case 85, 86: "Averses de neige"
        case 95: "Orage"
        case 96, 99: "Orage et grêle"
        default: "—"
        }
    }

    static func symbol(_ code: Int, isDay: Bool = true) -> String {
        switch code {
        case 0, 1: isDay ? "sun.max.fill" : "moon.stars.fill"
        case 2: isDay ? "cloud.sun.fill" : "cloud.moon.fill"
        case 3: "cloud.fill"
        case 45, 48: "cloud.fog.fill"
        case 51, 53, 55: "cloud.drizzle.fill"
        case 56, 57, 66, 67: "cloud.sleet.fill"
        case 61, 63: "cloud.rain.fill"
        case 65, 82: "cloud.heavyrain.fill"
        case 71, 73, 75, 77, 85, 86: "cloud.snow.fill"
        case 80, 81: isDay ? "cloud.sun.rain.fill" : "cloud.moon.rain.fill"
        case 95, 96, 99: "cloud.bolt.rain.fill"
        default: "cloud.fill"
        }
    }
}
