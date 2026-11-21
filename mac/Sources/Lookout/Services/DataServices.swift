import Foundation

// MARK: - Météo (Open-Meteo, sans clé)

enum WeatherService {
    struct Place: Identifiable, Decodable {
        let id: Int
        let name: String
        let latitude: Double
        let longitude: Double
        let admin1: String?
        let country: String?

        var label: String { [name, admin1, country].compactMap { $0 }.joined(separator: ", ") }
        var shortLabel: String { [name, admin1].compactMap { $0 }.joined(separator: ", ") }
    }

    static func search(_ query: String) async throws -> [Place] {
        struct Response: Decodable { let results: [Place]? }
        var comps = URLComponents(string: "https://geocoding-api.open-meteo.com/v1/search")!
        comps.queryItems = [.init(name: "name", value: query), .init(name: "count", value: "8"),
                            .init(name: "language", value: "fr")]
        let data = try await HTTP.data(comps.url!)
        return try JSONDecoder().decode(Response.self, from: data).results ?? []
    }

    private struct Response: Decodable {
        struct Current: Decodable {
            let temperature_2m: Double, apparent_temperature: Double, relative_humidity_2m: Double
            let weather_code: Int, wind_speed_10m: Double, wind_gusts_10m: Double, is_day: Int
        }
        struct Hourly: Decodable {
            let time: [Double], temperature_2m: [Double?], weather_code: [Int?]
            let precipitation_probability: [Int?], is_day: [Int?]
        }
        struct Daily: Decodable {
            let time: [Double], weather_code: [Int?], temperature_2m_max: [Double?], temperature_2m_min: [Double?]
            let precipitation_probability_max: [Int?], sunrise: [Double?], sunset: [Double?]
        }
        let utc_offset_seconds: Int
        let current: Current
        let hourly: Hourly
        let daily: Daily
    }

    static func fetch(_ options: WeatherOptions, units: UnitSystem) async throws -> WeatherData {
        var comps = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        comps.queryItems = [
            .init(name: "latitude", value: String(options.latitude)),
            .init(name: "longitude", value: String(options.longitude)),
            .init(name: "current", value: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day"),
            .init(name: "hourly", value: "temperature_2m,weather_code,precipitation_probability,is_day"),
            .init(name: "daily", value: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"),
            .init(name: "timezone", value: "auto"),
            .init(name: "timeformat", value: "unixtime"),
            .init(name: "forecast_days", value: "10"),
        ]
        if units == .imperial {
            comps.queryItems! += [.init(name: "temperature_unit", value: "fahrenheit"),
                                  .init(name: "wind_speed_unit", value: "mph")]
        }
        let r: Response
        do {
            r = try JSONDecoder().decode(Response.self, from: try await HTTP.data(comps.url!))
        } catch is DecodingError {
            throw BriefingError("Réponse météo inattendue")
        }

        let now = Date()
        var hours: [WeatherData.Hour] = []
        for (i, t) in r.hourly.time.enumerated() {
            let time = Date(timeIntervalSince1970: t)
            guard time > now.addingTimeInterval(-3600), hours.count < 24,
                  let temp = r.hourly.temperature_2m[safe: i] ?? nil else { continue }
            hours.append(.init(time: time, temperature: temp, code: (r.hourly.weather_code[safe: i] ?? nil) ?? 0,
                               isDay: ((r.hourly.is_day[safe: i] ?? nil) ?? 1) == 1,
                               precipitationChance: (r.hourly.precipitation_probability[safe: i] ?? nil) ?? 0))
        }
        var days: [WeatherData.Day] = []
        for (i, t) in r.daily.time.enumerated() {
            guard let lo = r.daily.temperature_2m_min[safe: i] ?? nil,
                  let hi = r.daily.temperature_2m_max[safe: i] ?? nil else { continue }
            days.append(.init(date: Date(timeIntervalSince1970: t), code: (r.daily.weather_code[safe: i] ?? nil) ?? 0,
                              low: lo, high: hi,
                              precipitationChance: (r.daily.precipitation_probability_max[safe: i] ?? nil) ?? 0))
        }
        return WeatherData(
            timeZone: TimeZone(secondsFromGMT: r.utc_offset_seconds) ?? .current,
            temperature: r.current.temperature_2m, apparent: r.current.apparent_temperature,
            humidity: Int(r.current.relative_humidity_2m), windSpeed: r.current.wind_speed_10m,
            windGusts: r.current.wind_gusts_10m, code: r.current.weather_code, isDay: r.current.is_day == 1,
            sunrise: (r.daily.sunrise.first ?? nil).map(Date.init(timeIntervalSince1970:)),
            sunset: (r.daily.sunset.first ?? nil).map(Date.init(timeIntervalSince1970:)),
            hours: hours, days: days,
            temperatureUnit: units == .metric ? "°C" : "°F", windUnit: units == .metric ? "km/h" : "mi/h")
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

// MARK: - API JSON générique

enum JSONAPIService {
    static func fetch(_ options: APIOptions, sourceName: String) async throws -> [Article] {
        var headers: [String: String] = ["Accept": "application/json"]
        for line in options.headers.split(whereSeparator: \.isNewline) {
            let parts = line.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
            if parts.count == 2, !parts[0].isEmpty { headers[parts[0]] = parts[1] }
        }
        let data = try await HTTP.data(try HTTP.url(options.url), headers: headers)
        guard let root = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
            throw BriefingError("La réponse n'est pas du JSON valide")
        }
        guard let list = value(at: options.itemsPath, in: root) as? [Any] else {
            throw BriefingError("Aucune liste trouvée au chemin « \(options.itemsPath.isEmpty ? "(racine)" : options.itemsPath) »")
        }
        let articles = list.prefix(100).enumerated().compactMap { index, item -> Article? in
            guard let title = string(at: options.titlePath, in: item), !title.isEmpty else { return nil }
            let link = string(at: options.linkPath, in: item).flatMap(URL.init(string:))
            return Article(id: link?.absoluteString ?? "\(options.url)#\(index)#\(title)",
                           title: HTMLText.plain(title),
                           summary: HTMLText.plain(string(at: options.subtitlePath, in: item) ?? ""),
                           link: link, date: date(value(at: options.datePath, in: item)),
                           imageURL: string(at: options.imagePath, in: item).flatMap(URL.init(string:)),
                           source: sourceName)
        }
        if articles.isEmpty { throw BriefingError("Aucun élément avec le champ « \(options.titlePath) »") }
        return articles
    }

    /// Navigue dans le JSON avec un chemin pointé : « data.items », « 0.title ».
    static func value(at path: String, in root: Any) -> Any? {
        var current: Any = root
        for key in path.split(separator: ".").map(String.init) where !key.isEmpty {
            if let dict = current as? [String: Any], let next = dict[key] {
                current = next
            } else if let array = current as? [Any], let index = Int(key), array.indices.contains(index) {
                current = array[index]
            } else {
                return nil
            }
        }
        return current is NSNull ? nil : current
    }

    private static func string(at path: String, in root: Any) -> String? {
        guard !path.trimmingCharacters(in: .whitespaces).isEmpty, let v = value(at: path, in: root) else { return nil }
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return nil
    }

    private static func date(_ value: Any?) -> Date? {
        if let s = value as? String { return FeedDate.parse(s) }
        if let n = value as? Double { return Date(timeIntervalSince1970: n > 1e11 ? n / 1000 : n) }
        return nil
    }
}
