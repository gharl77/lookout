import Foundation
import MapKit

/// Temps de parcours : Plans d'Apple (MapKit, circulation en direct) ou OSRM (libre, sans circulation).
@MainActor
enum CommuteService {
    private static var geocodeCache: [String: MKMapItem] = [:]

    static func fetch(_ options: CommuteOptions) async throws -> [RouteResult] {
        let routes = options.routes.filter(\.enabled)
        guard !routes.isEmpty else { throw BriefingError("Aucun trajet actif") }
        var results: [RouteResult] = []
        for route in routes {
            var result = RouteResult(id: route.id, name: route.name, mode: route.mode)
            do {
                try await fill(&result, route: route, options: options)
            } catch {
                result.error = message(for: error)
            }
            results.append(result)
        }
        return results
    }

    private static func fill(_ result: inout RouteResult, route: CommuteRoute, options: CommuteOptions) async throws {
        guard !route.from.trimmingCharacters(in: .whitespaces).isEmpty,
              !route.to.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw BriefingError("Indiquez un départ et une destination dans les réglages")
        }
        let origin = try await geocode(route.from)
        let destination = try await geocode(route.to)

        if options.provider == .osrm, route.mode != .transit {
            try await fillOSRM(&result, from: origin, to: destination, mode: route.mode)
            return
        }

        let request = MKDirections.Request()
        request.source = origin
        request.destination = destination
        request.departureDate = Date()
        switch route.mode {
        case .driving: request.transportType = .automobile
        case .walking: request.transportType = .walking
        case .transit: request.transportType = .transit
        }

        if route.mode == .transit {
            // Plans ne fournit que l'heure d'arrivée estimée pour le transport en commun.
            let eta = try await MKDirections(request: request).calculateETA()
            result.duration = eta.expectedTravelTime
            result.distance = eta.distance
            return
        }

        request.requestsAlternateRoutes = options.showAlternates
        let response = try await MKDirections(request: request).calculate()
        let sorted = response.routes.sorted { $0.expectedTravelTime < $1.expectedTravelTime }
        guard let best = sorted.first else { throw BriefingError("Aucun itinéraire trouvé") }
        result.via = best.name
        result.duration = best.expectedTravelTime
        result.distance = best.distance
        result.notices = best.advisoryNotices
        result.alternates = sorted.dropFirst().prefix(2).map { .init(name: $0.name, duration: $0.expectedTravelTime) }
    }

    private static func fillOSRM(_ result: inout RouteResult, from: MKMapItem, to: MKMapItem, mode: CommuteMode) async throws {
        let a = from.location.coordinate, b = to.location.coordinate
        let profile = mode == .walking ? "foot" : "driving"
        let host = mode == .walking ? "routing.openstreetmap.de/routed-foot" : "router.project-osrm.org"
        let url = try HTTP.url("https://\(host)/route/v1/\(profile)/\(a.longitude),\(a.latitude);\(b.longitude),\(b.latitude)?overview=false&alternatives=true&steps=false")
        let data = try await HTTP.data(url)
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let routes = root["routes"] as? [[String: Any]], let best = routes.first,
              let duration = best["duration"] as? Double, let distance = best["distance"] as? Double else {
            throw BriefingError("Aucun itinéraire trouvé")
        }
        result.duration = duration
        result.distance = distance
        result.alternates = routes.dropFirst().prefix(2).compactMap {
            ($0["duration"] as? Double).map { .init(name: "Autre itinéraire", duration: $0) }
        }
    }

    private static func geocode(_ text: String) async throws -> MKMapItem {
        let key = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let cached = geocodeCache[key] { return cached }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = text
        let response: MKLocalSearch.Response
        do {
            response = try await MKLocalSearch(request: request).start()
        } catch {
            throw BriefingError("Adresse introuvable : « \(text) »")
        }
        guard let item = response.mapItems.first else { throw BriefingError("Adresse introuvable : « \(text) »") }
        geocodeCache[key] = item
        return item
    }

    private static func message(for error: Error) -> String {
        if let e = error as? BriefingError { return e.message }
        if let e = error as? MKError {
            switch e.code {
            case .directionsNotFound: return "Aucun itinéraire trouvé"
            case .placemarkNotFound: return "Adresse introuvable"
            case .serverFailure, .loadingThrottled: return "Service Plans indisponible, réessayez"
            default: break
            }
        }
        return error.localizedDescription
    }
}
