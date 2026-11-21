import Foundation
import Observation

/// Configuration persistante : ~/Library/Application Support/Lookout/config.json
@MainActor
@Observable
final class ConfigStore {
    var config: AppConfig { didSet { if config != oldValue { scheduleSave() } } }
    /// Section à afficher à l'ouverture des réglages.
    var selectedSectionID: UUID?
    var settingsTab = "sections"
    var lastError: String?

    @ObservationIgnored private var saveTask: Task<Void, Never>?

    static let fileURL: URL = {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = support.appendingPathComponent("Lookout", isDirectory: true)
        let file = dir.appendingPathComponent("config.json")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        // L'app s'appelait « Briefing » avant la version 0.1 : on reprend sa configuration au premier lancement.
        let legacy = support.appendingPathComponent("Briefing/config.json")
        if !FileManager.default.fileExists(atPath: file.path), FileManager.default.fileExists(atPath: legacy.path) {
            try? FileManager.default.copyItem(at: legacy, to: file)
        }
        return file
    }()

    init() {
        if let data = try? Data(contentsOf: Self.fileURL) {
            if let loaded = try? JSONDecoder().decode(AppConfig.self, from: data) {
                config = loaded
                return
            }
            // Fichier illisible : on le met de côté plutôt que de l'écraser.
            let backup = Self.fileURL.deletingLastPathComponent().appendingPathComponent("config-illisible.json")
            try? FileManager.default.removeItem(at: backup)
            try? FileManager.default.moveItem(at: Self.fileURL, to: backup)
        }
        config = .defaults
        save()
    }

    static func encode(_ config: AppConfig) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(config)
    }

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            self?.save()
        }
    }

    func save() {
        do {
            try Self.encode(config).write(to: Self.fileURL, options: .atomic)
        } catch {
            lastError = "Impossible d'enregistrer la configuration : \(error.localizedDescription)"
        }
    }

    func exportConfig(to url: URL) throws { try Self.encode(config).write(to: url, options: .atomic) }

    func importConfig(from url: URL) throws {
        let data = try Data(contentsOf: url)
        guard let imported = try? JSONDecoder().decode(AppConfig.self, from: data) else {
            throw BriefingError("Ce fichier n'est pas une configuration Lookout valide.")
        }
        config = imported
    }

    func resetToDefaults() {
        config = .defaults
        selectedSectionID = nil
    }

    // MARK: Sections

    func index(of id: UUID) -> Int? { config.sections.firstIndex { $0.id == id } }

    func move(_ id: UUID, by offset: Int) {
        // Déplace parmi les sections visibles quand la section l'est elle-même.
        guard let from = index(of: id) else { return }
        var target = from + offset
        while config.sections.indices.contains(target), config.sections[from].enabled, !config.sections[target].enabled {
            target += offset
        }
        guard config.sections.indices.contains(target) else { return }
        config.sections.swapAt(from, target)
    }

    func move(_ id: UUID, before targetID: UUID) {
        guard id != targetID, let from = index(of: id) else { return }
        let section = config.sections.remove(at: from)
        let to = index(of: targetID) ?? config.sections.endIndex
        config.sections.insert(section, at: to)
    }

    @discardableResult
    func add(_ kind: SectionKind) -> UUID {
        let section = SectionConfig.template(kind)
        config.sections.append(section)
        selectedSectionID = section.id
        return section.id
    }

    func duplicate(_ id: UUID) {
        guard let i = index(of: id) else { return }
        var copy = config.sections[i]
        copy.id = UUID()
        copy.title += " (copie)"
        config.sections.insert(copy, at: i + 1)
        selectedSectionID = copy.id
    }

    func remove(_ id: UUID) {
        guard let i = index(of: id) else { return }
        config.sections.remove(at: i)
        if selectedSectionID == id {
            selectedSectionID = config.sections[safe: min(i, config.sections.count - 1)]?.id
        }
    }
}

/// Données téléchargées pour chaque section, et état de lecture des articles.
@MainActor
@Observable
final class BriefingStore {
    private(set) var states: [UUID: SectionState] = [:]
    private(set) var readIDs: Set<String>
    private(set) var lastRefresh: Date?

    @ObservationIgnored private var signatures: [UUID: String] = [:]
    @ObservationIgnored private var tasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var syncTask: Task<Void, Never>?
    @ObservationIgnored private var timer: Task<Void, Never>?
    private static let readKey = "readArticleIDs"

    init() {
        readIDs = Set(UserDefaults.standard.stringArray(forKey: Self.readKey) ?? [])
    }

    var isRefreshing: Bool { states.values.contains(where: \.isLoading) }

    func state(for id: UUID) -> SectionState { states[id] ?? SectionState(isLoading: true) }

    // MARK: Actualisation

    func refreshAll(_ config: AppConfig) {
        for section in config.sections where section.enabled {
            refresh(section, units: config.general.units)
        }
        lastRefresh = Date()
    }

    func refresh(_ section: SectionConfig, units: UnitSystem) {
        tasks[section.id]?.cancel()
        signatures[section.id] = section.fetchSignature(units: units)
        var state = states[section.id] ?? SectionState()
        state.isLoading = true
        states[section.id] = state

        tasks[section.id] = Task { [weak self] in
            var content: SectionContent?
            var sourceErrors: [UUID: String] = [:]
            var failure: String?
            do {
                switch section.kind {
                case .feed:
                    let result = try await FeedService.fetch(section.feed.sources)
                    content = .articles(result.articles)
                    sourceErrors = result.errors
                case .weather:
                    content = .weather(try await WeatherService.fetch(section.weather, units: units))
                case .commute:
                    content = .commute(try await CommuteService.fetch(section.commute))
                case .sports:
                    let result = try await SportsService.fetch(section.sports)
                    content = .sports(result.games)
                    sourceErrors = result.errors
                case .api:
                    content = .articles(try await JSONAPIService.fetch(section.api, sourceName: section.title))
                }
            } catch {
                failure = error.localizedDescription
            }
            guard !Task.isCancelled, let self else { return }
            var state = self.states[section.id] ?? SectionState()
            state.isLoading = false
            state.error = failure
            state.sourceErrors = sourceErrors
            if let content {
                state.content = content
                state.updatedAt = Date()
            }
            self.states[section.id] = state
        }
    }

    /// Après une modification des réglages : ne recharge que les sections dont les sources ont changé.
    func sync(_ config: AppConfig) {
        syncTask?.cancel()
        syncTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled, let self else { return }
            let ids = Set(config.sections.map(\.id))
            for id in self.states.keys where !ids.contains(id) {
                self.tasks[id]?.cancel()
                self.states[id] = nil
                self.signatures[id] = nil
            }
            for section in config.sections where section.enabled {
                if self.signatures[section.id] != section.fetchSignature(units: config.general.units) {
                    self.refresh(section, units: config.general.units)
                }
            }
        }
    }

    func startTimer(minutes: Int, config: @escaping @MainActor () -> AppConfig) {
        timer?.cancel()
        guard minutes > 0 else { return }
        timer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(minutes * 60))
                guard !Task.isCancelled, let self else { return }
                self.refreshAll(config())
            }
        }
    }

    // MARK: Lecture

    func isRead(_ article: Article) -> Bool { readIDs.contains(article.id) }

    func setRead(_ article: Article, _ read: Bool) {
        if read { readIDs.insert(article.id) } else { readIDs.remove(article.id) }
        persistRead()
    }

    func markAllRead(_ articles: [Article]) {
        readIDs.formUnion(articles.map(\.id))
        persistRead()
    }

    private func persistRead() {
        // Garde l'historique borné.
        if readIDs.count > 4000 { readIDs = Set(readIDs.shuffled().prefix(3000)) }
        UserDefaults.standard.set(Array(readIDs), forKey: Self.readKey)
    }
}
