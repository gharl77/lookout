import ImageIO
import SwiftUI

// MARK: - Articles (RSS et API JSON)

struct ArticleListView: View {
    let section: SectionConfig
    let articles: [Article]

    @Environment(ConfigStore.self) private var configStore
    @Environment(BriefingStore.self) private var store

    var body: some View {
        let options = section.feed
        let shown = FeedService.present(articles, options: options, sourceOrder: options.sources.map(\.name),
                                        limit: max(1, section.maxItems))
        if shown.isEmpty {
            EmptyHint(text: "Aucun article ne correspond aux filtres.")
        } else {
            VStack(alignment: .leading, spacing: max(0, configStore.config.general.density.rowSpacing - 6)) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, article in
                    ArticleRow(article: article, options: options,
                               style: options.layout == .headline ? (index == 0 ? .headline : .list) : options.layout,
                               showSource: options.showSource && section.kind == .feed && options.sources.filter(\.enabled).count > 1)
                }
            }
        }
    }
}

private struct ArticleRow: View {
    let article: Article
    let options: FeedOptions
    let style: FeedLayout
    let showSource: Bool

    @Environment(ConfigStore.self) private var configStore
    @Environment(BriefingStore.self) private var store

    var body: some View {
        let general = configStore.config.general
        let read = store.isRead(article)
        HoverRow {
            Links.open(article.link, inBackground: general.openLinksInBackground)
            store.setRead(article, true)
        } content: {
            Group {
                switch style {
                case .headline: headline
                case .compact: compact(read: read)
                case .list: list(read: read)
                }
            }
            .opacity(read && general.dimReadArticles ? 0.5 : 1)
        }
        .contextMenu {
            Button("Ouvrir", systemImage: "safari") {
                Links.open(article.link, inBackground: false)
                store.setRead(article, true)
            }
            Button("Copier le lien", systemImage: "link") { Links.copy(article.link) }
            if let link = article.link {
                ShareLink(item: link) { Label("Partager…", systemImage: "square.and.arrow.up") }
            }
            Divider()
            Button(read ? "Marquer comme non lu" : "Marquer comme lu", systemImage: read ? "circle" : "checkmark.circle") {
                store.setRead(article, !read)
            }
        }
        .help(article.summary.isEmpty ? article.title : article.summary)
        .accessibilityHint("Ouvre l'article dans le navigateur")
    }

    private var meta: String {
        var parts: [String] = []
        if showSource { parts.append(article.source) }
        if options.showTime, let date = article.date { parts.append(Format.ago(date)) }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var metaLine: some View {
        if !meta.isEmpty {
            Text(meta)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: 8) {
            if options.showImages, let url = article.imageURL {
                RemoteImage(url: url)
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            Text(article.title)
                .font(.title3.weight(.semibold))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            if !article.summary.isEmpty {
                Text(article.summary)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            metaLine
        }
        .padding(.bottom, 4)
    }

    private func list(read: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(article.title)
                    .font(.body.weight(.medium))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                if options.showSummary, !article.summary.isEmpty {
                    Text(article.summary)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                metaLine
            }
            Spacer(minLength: 0)
            if options.showImages, let url = article.imageURL {
                RemoteImage(url: url)
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
        }
    }

    private func compact(read: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle()
                .fill(read ? AnyShapeStyle(.clear) : AnyShapeStyle(.tint))
                .frame(width: 6, height: 6)
                .offset(y: -2)
                .accessibilityHidden(true)
            Text(article.title)
                .lineLimit(1)
            Spacer(minLength: 8)
            if options.showTime, let date = article.date {
                Text(Format.ago(date))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .layoutPriority(1)
            }
        }
    }
}

struct RemoteImage: View {
    let url: URL

    var body: some View {
        Color.primary.opacity(0.06)
            .overlay {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().aspectRatio(contentMode: .fill)
                    } else if phase.error != nil {
                        Image(systemName: "photo").foregroundStyle(.tertiary)
                    }
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

// MARK: - Météo

struct WeatherView: View {
    let options: WeatherOptions
    let data: WeatherData

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            current
            if options.showDetails { details }
            if options.showHourly, !data.hours.isEmpty { hourly }
            if options.showDaily, !data.days.isEmpty { daily }
        }
    }

    private func degrees(_ value: Double) -> String { "\(Int(value.rounded()))°" }

    private var current: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: WMO.symbol(data.code, isDay: data.isDay))
                .symbolRenderingMode(.multicolor)
                .font(.system(size: 44))
                .frame(width: 60)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(degrees(data.temperature))
                    .font(.system(size: 46, weight: .semibold, design: .rounded))
                    .contentTransition(.numericText())
                Text(WMO.label(data.code))
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if let today = data.days.first {
                VStack(alignment: .trailing, spacing: 2) {
                    Label(degrees(today.high), systemImage: "arrow.up")
                    Label(degrees(today.low), systemImage: "arrow.down")
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var details: some View {
        HStack(spacing: 0) {
            detail("thermometer.medium", "Ressenti", degrees(data.apparent))
            detail("wind", "Vent", "\(Int(data.windSpeed.rounded())) \(data.windUnit)")
            detail("humidity.fill", "Humidité", "\(data.humidity) %")
            if let sunset = data.sunset, let sunrise = data.sunrise {
                let showSunset = Date() < sunset && Date() > sunrise
                detail(showSunset ? "sunset.fill" : "sunrise.fill", showSunset ? "Coucher" : "Lever",
                       Format.time(showSunset ? sunset : sunrise, timeZone: data.timeZone))
            }
        }
        .padding(.vertical, 8)
        .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func detail(_ icon: String, _ label: String, _ value: String) -> some View {
        VStack(spacing: 3) {
            Image(systemName: icon)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.secondary)
                .frame(height: 16)
            Text(value).font(.callout.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var hourly: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 14) {
                ForEach(Array(data.hours.prefix(options.hourlyCount).enumerated()), id: \.element.id) { index, hour in
                    VStack(spacing: 5) {
                        Text(index == 0 ? "Maint." : hourLabel(hour.time))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Image(systemName: WMO.symbol(hour.code, isDay: hour.isDay))
                            .symbolRenderingMode(.multicolor)
                            .frame(height: 20)
                        Text(degrees(hour.temperature))
                            .font(.callout.weight(.medium))
                            .monospacedDigit()
                        Text(hour.precipitationChance >= 20 ? "\(hour.precipitationChance) %" : " ")
                            .font(.caption2)
                            .foregroundStyle(.cyan)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, 2)
        }
        .scrollIndicators(.never)
    }

    private func hourLabel(_ date: Date) -> String {
        var calendar = Calendar.current
        calendar.timeZone = data.timeZone
        return "\(calendar.component(.hour, from: date)) h"
    }

    private var daily: some View {
        let days = Array(data.days.prefix(options.dailyCount))
        let low = days.map(\.low).min() ?? 0
        let high = max(days.map(\.high).max() ?? 1, low + 1)
        return VStack(spacing: 7) {
            ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                HStack(spacing: 8) {
                    Text(index == 0 ? "Auj." : dayLabel(day.date))
                        .frame(width: 42, alignment: .leading)
                    Image(systemName: WMO.symbol(day.code))
                        .symbolRenderingMode(.multicolor)
                        .frame(width: 24)
                    Text(day.precipitationChance >= 20 ? "\(day.precipitationChance) %" : "")
                        .font(.caption2)
                        .foregroundStyle(.cyan)
                        .frame(width: 32, alignment: .leading)
                    Text(degrees(day.low))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .frame(width: 34, alignment: .trailing)
                    RangeBar(low: (day.low - low) / (high - low), high: (day.high - low) / (high - low))
                        .frame(height: 5)
                    Text(degrees(day.high))
                        .monospacedDigit()
                        .frame(width: 34, alignment: .trailing)
                }
                .font(.callout)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(dayLabel(day.date)) : \(WMO.label(day.code)), minimum \(degrees(day.low)), maximum \(degrees(day.high))")
            }
        }
    }

    private func dayLabel(_ date: Date) -> String {
        var style = Date.FormatStyle().weekday(.abbreviated)
        style.locale = .app
        style.timeZone = data.timeZone
        return date.formatted(style).capitalizedFirst
    }
}

private struct RangeBar: View {
    let low: Double
    let high: Double

    var body: some View {
        GeometryReader { geo in
            let start = geo.size.width * low
            let width = max(6, geo.size.width * (high - low))
            ZStack(alignment: .leading) {
                Capsule().fill(.primary.opacity(0.08))
                Capsule()
                    .fill(LinearGradient(colors: [.cyan, .yellow, .orange], startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width)
                    .mask(alignment: .leading) { Capsule().frame(width: width).offset(x: start) }
            }
        }
    }
}

// MARK: - Sports

struct SportsView: View {
    let section: SectionConfig
    let games: [Game]

    @Environment(ConfigStore.self) private var configStore

    var body: some View {
        // Pour chaque ligue : les équipes choisies, ou toutes si aucune n'est choisie.
        let chosen: [UUID: Set<String>] = Dictionary(
            uniqueKeysWithValues: section.sports.leagues.map { ($0.id, Set($0.teams.map(\.id))) })
        let filtered = games.filter { game in
            guard let teams = chosen[game.leagueID], !teams.isEmpty else { return true }
            return teams.contains(game.home.id) || teams.contains(game.away.id)
        }
        // Aujourd'hui d'abord, puis hier, puis demain : la limite ne doit jamais cacher les matchs du jour.
        let calendar = Calendar.current
        let rank: (Date) -> Int = { calendar.isDateInToday($0) ? 0 : (calendar.isDateInYesterday($0) ? 1 : 2) }
        let limited = Array(filtered.sorted { (rank($0.date), $0.date) < (rank($1.date), $1.date) }
            .prefix(max(1, section.maxItems)))
        let groups = Dictionary(grouping: limited) { calendar.startOfDay(for: $0.date) }

        if limited.isEmpty {
            EmptyHint(text: games.isEmpty ? "Aucun match pour le moment." : "Aucun match pour vos équipes ces jours-ci.")
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(groups.keys.sorted { (rank($0), $0) < (rank($1), $1) }, id: \.self) { day in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(dayTitle(day))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                        ForEach(groups[day]!.sorted { $0.date < $1.date }) { game in
                            GameRow(game: game, showLogos: section.sports.showLogos,
                                    showLeague: section.sports.leagues.filter(\.enabled).count > 1)
                        }
                    }
                }
            }
        }
    }

    private func dayTitle(_ day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) { return "Aujourd'hui" }
        if calendar.isDateInYesterday(day) { return "Hier" }
        if calendar.isDateInTomorrow(day) { return "Demain" }
        var style = Date.FormatStyle().weekday(.wide).day().month(.wide)
        style.locale = .app
        return day.formatted(style)
    }
}

private struct GameRow: View {
    let game: Game
    let showLogos: Bool
    let showLeague: Bool

    @Environment(ConfigStore.self) private var configStore

    var body: some View {
        HoverRow {
            Links.open(game.link, inBackground: configStore.config.general.openLinksInBackground)
        } content: {
            HStack(spacing: 12) {
                VStack(spacing: 4) {
                    teamLine(game.away, other: game.home)
                    teamLine(game.home, other: game.away)
                }
                VStack(alignment: .trailing, spacing: 2) {
                    status
                    if showLeague {
                        Text(game.league).font(.caption2).foregroundStyle(.tertiary)
                    }
                }
                .frame(width: 78, alignment: .trailing)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var status: some View {
        switch game.state {
        case .scheduled:
            Text(Format.time(game.date)).font(.callout).foregroundStyle(.secondary).monospacedDigit()
        case .live:
            HStack(spacing: 4) {
                Circle().fill(.red).frame(width: 6, height: 6)
                Text(game.detail).font(.caption.weight(.semibold)).foregroundStyle(.red).lineLimit(1)
            }
        case .final:
            Text(game.detail).font(.caption.weight(.medium)).foregroundStyle(.secondary).lineLimit(1)
        case .other:
            Text(game.detail).font(.caption.weight(.medium)).foregroundStyle(.orange).lineLimit(2)
                .multilineTextAlignment(.trailing)
        }
    }

    private func teamLine(_ team: Game.Team, other: Game.Team) -> some View {
        let lost = game.state == .final && other.isWinner
        return HStack(spacing: 8) {
            if showLogos {
                TeamLogo(url: team.logo)
            }
            Text(team.name)
                .lineLimit(1)
            Spacer(minLength: 4)
            if game.state == .live || game.state == .final {
                Text(team.score)
                    .font(.body.weight(team.isWinner ? .bold : .regular))
                    .monospacedDigit()
            }
        }
        .foregroundStyle(lost ? .secondary : .primary)
    }
}

/// Logo d'équipe. Plusieurs logos sont noirs (Flyers, Penguins…) : en mode sombre,
/// une pastille claire garantit qu'ils restent lisibles.
private struct TeamLogo: View {
    let url: URL?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var displayScale
    @ViewState private var image: CGImage?
    private static let side: CGFloat = 24

    var body: some View {
        Group {
            if let image {
                Image(decorative: image, scale: displayScale).resizable().interpolation(.high).scaledToFit()
            } else if url == nil {
                Image(systemName: "shield.fill").foregroundStyle(.gray)
            } else {
                Color.clear
            }
        }
        .frame(width: Self.side, height: Self.side)
        .task(id: url) {
            guard let url else { return }
            image = await LogoCache.shared.image(for: url, pixels: Int(Self.side * displayScale))
        }
        .padding(3)
        .background(scheme == .dark ? Color.white.opacity(0.92) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityHidden(true)
    }
}

// MARK: - Trajets

struct CommuteView: View {
    let section: SectionConfig
    let results: [RouteResult]

    @Environment(ConfigStore.self) private var configStore

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(results.prefix(max(1, section.maxItems))) { result in
                HoverRow {
                    openInMaps(result)
                } content: {
                    row(result)
                }
                .help("Ouvrir l'itinéraire dans Plans")
            }
        }
    }

    private func row(_ result: RouteResult) -> some View {
        let units = configStore.config.general.units
        return HStack(alignment: .center, spacing: 12) {
            Image(systemName: result.mode.icon)
                .foregroundStyle(.secondary)
                .frame(width: 22)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(result.name).font(.body.weight(.medium)).lineLimit(1)
                if let error = result.error {
                    Text(error).font(.caption).foregroundStyle(.orange).lineLimit(2)
                } else {
                    Text(subtitle(result, units: units)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    ForEach(result.notices, id: \.self) { notice in
                        Label(notice, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(.orange)
                            .lineLimit(2)
                    }
                    if section.commute.showAlternates {
                        ForEach(result.alternates) { alt in
                            Text("ou \(alt.name.isEmpty ? "autre itinéraire" : "via \(alt.name)") · \(Format.duration(alt.duration))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .opacity(0.8)
                                .lineLimit(1)
                        }
                    }
                }
            }
            Spacer(minLength: 4)
            if result.error == nil {
                Text(Format.duration(result.duration))
                    .font(.system(.title2, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func subtitle(_ result: RouteResult, units: UnitSystem) -> String {
        var parts: [String] = []
        if !result.via.isEmpty { parts.append("via \(result.via)") }
        if result.distance > 0 { parts.append(Format.distance(result.distance, units: units)) }
        parts.append("arrivée \(Format.time(Date().addingTimeInterval(result.duration)))")
        return parts.joined(separator: " · ")
    }

    private func openInMaps(_ result: RouteResult) {
        guard let route = section.commute.routes.first(where: { $0.id == result.id }) else { return }
        // Schéma local : ouvre directement l'app Plans, sans passer par le Web.
        var comps = URLComponents(string: "maps://")!
        let flag = route.mode == .driving ? "d" : (route.mode == .walking ? "w" : "r")
        comps.queryItems = [.init(name: "saddr", value: route.from), .init(name: "daddr", value: route.to),
                            .init(name: "dirflg", value: flag)]
        Links.open(comps.url, inBackground: false)
    }
}

/// Les logos sont fournis en 500 px : réduits à la volée ils deviennent crénelés.
/// On les rééchantillonne une fois (ImageIO, haute qualité) à la taille exacte en pixels.
actor LogoCache {
    static let shared = LogoCache()
    private var cache: [String: CGImage] = [:]

    func image(for url: URL, pixels: Int) async -> CGImage? {
        let key = "\(url.absoluteString)@\(pixels)"
        if let cached = cache[key] { return cached }
        guard let data = try? await HTTP.data(url),
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(pixels, 16),
        ]
        let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        cache[key] = image
        return image
    }
}
