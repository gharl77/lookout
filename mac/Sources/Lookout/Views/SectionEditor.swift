import SwiftUI

struct SectionEditor: View {
    @Binding var section: SectionConfig
    @Environment(BriefingStore.self) private var store

    var body: some View {
        Form {
            Section {
                TextField("Titre", text: $section.title)
                LabeledContent("Icône") {
                    IconPicker(symbol: $section.icon, color: Color(hex: section.colorHex))
                }
                LabeledContent("Couleur") {
                    ColorSwatchPicker(hex: $section.colorHex)
                }
                Toggle("Afficher dans le tableau de bord", isOn: $section.enabled)
                Picker("Largeur", selection: $section.span) {
                    Text("1 colonne").tag(1)
                    Text("2 colonnes").tag(2)
                    Text("Pleine largeur").tag(99)
                }
                if section.kind != .weather {
                    Stepper(value: $section.maxItems, in: 1...40) {
                        LabeledContent(itemsLabel, value: "\(section.maxItems)")
                    }
                }
            } header: {
                Text(section.kind.label)
            } footer: {
                Text(section.kind.detail)
            }

            switch section.kind {
            case .feed:
                FeedSourcesEditor(section: $section)
                ArticleDisplayEditor(options: $section.feed, isFeed: true)
            case .weather:
                WeatherEditor(options: $section.weather)
            case .commute:
                CommuteEditor(options: $section.commute)
            case .sports:
                SportsEditor(section: $section)
            case .api:
                APIEditor(options: $section.api)
                ArticleDisplayEditor(options: $section.feed, isFeed: false)
            }
        }
        .formStyle(.grouped)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var itemsLabel: String {
        switch section.kind {
        case .feed, .api: "Nombre d'articles"
        case .sports: "Nombre de matchs"
        case .commute: "Nombre de trajets"
        case .weather: ""
        }
    }
}

// MARK: - Éléments de liste réutilisables

/// Boutons monter / descendre / supprimer pour un élément d'une liste modifiable.
private struct RowControls<Item: Identifiable>: View {
    @Binding var items: [Item]
    let id: Item.ID

    var body: some View {
        let index = items.firstIndex { $0.id == id } ?? 0
        HStack(spacing: 0) {
            Button { items.swapAt(index, index - 1) } label: { Image(systemName: "chevron.up") }
                .disabled(index == 0)
                .help("Monter")
            Button { items.swapAt(index, index + 1) } label: { Image(systemName: "chevron.down") }
                .disabled(index >= items.count - 1)
                .help("Descendre")
            Button(role: .destructive) { items.removeAll { $0.id == id } } label: { Image(systemName: "trash") }
                .help("Supprimer")
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
    }
}

private struct StatusDot: View {
    let error: String?
    let loaded: Bool

    var body: some View {
        if let error {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .help(error)
                .accessibilityLabel("Erreur : \(error)")
        } else if loaded {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .help("Source fonctionnelle")
                .accessibilityLabel("Source fonctionnelle")
        }
    }
}

// MARK: - Fils RSS

private struct FeedSourcesEditor: View {
    @Binding var section: SectionConfig
    @Environment(BriefingStore.self) private var store

    var body: some View {
        let state = store.state(for: section.id)
        Section {
            ForEach($section.feed.sources) { $source in
                HStack(spacing: 10) {
                    Toggle("Activer \(source.name)", isOn: $source.enabled).labelsHidden()
                    VStack(alignment: .leading, spacing: 2) {
                        TextField("Nom", text: $source.name, prompt: Text("Nom de la source"))
                        TextField("Adresse", text: $source.url, prompt: Text("https://exemple.com/rss"))
                            .font(.callout.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    .labelsHidden()
                    .textFieldStyle(.plain)
                    if source.enabled {
                        StatusDot(error: state.sourceErrors[source.id] ?? (state.content == nil ? state.error : nil),
                                  loaded: state.content != nil && !state.isLoading)
                    }
                    RowControls(items: $section.feed.sources, id: source.id)
                }
            }
            HStack {
                Button("Ajouter un fil RSS", systemImage: "plus") {
                    section.feed.sources.append(FeedSource(name: "", url: ""))
                }
                Spacer()
                Menu("Suggestions") {
                    ForEach(FeedCatalog.categories) { category in
                        Section(category.name) {
                            ForEach(category.feeds, id: \.url) { feed in
                                Button(feed.name) {
                                    section.feed.sources.append(FeedSource(name: feed.name, url: feed.url))
                                }
                                .disabled(section.feed.sources.contains { $0.url == feed.url })
                            }
                        }
                    }
                }
                .fixedSize()
            }
        } header: {
            Text("Sources")
        } footer: {
            Text("Collez l'adresse de n'importe quel fil RSS ou Atom. L'ordre des sources sert à alterner les articles.")
        }
    }
}

private struct ArticleDisplayEditor: View {
    @Binding var options: FeedOptions
    let isFeed: Bool

    var body: some View {
        Section("Affichage") {
            Picker("Présentation", selection: $options.layout) {
                ForEach(FeedLayout.allCases) { Text($0.label).tag($0) }
            }
            if isFeed {
                Picker("Ordre", selection: $options.ordering) {
                    ForEach(FeedOrdering.allCases) { Text($0.label).tag($0) }
                }
            }
            if options.layout != .compact {
                Toggle("Images", isOn: $options.showImages)
                if options.layout == .list {
                    Toggle(isFeed ? "Résumé" : "Sous-titre", isOn: $options.showSummary)
                }
            }
            if isFeed, options.layout != .compact {
                Toggle("Nom de la source", isOn: $options.showSource)
            }
            Toggle("Heure de publication", isOn: $options.showTime)
        }

        Section {
            Picker("Âge maximal", selection: $options.maxAgeHours) {
                Text("Aucune limite").tag(0)
                Text("12 heures").tag(12)
                Text("24 heures").tag(24)
                Text("48 heures").tag(48)
                Text("3 jours").tag(72)
                Text("7 jours").tag(168)
            }
            TextField("Doit contenir", text: $options.includeKeywords, prompt: Text("ex. Canadiens, budget"))
            TextField("Exclure", text: $options.excludeKeywords, prompt: Text("ex. horoscope, publicité"))
        } header: {
            Text("Filtres")
        } footer: {
            Text("Mots-clés séparés par des virgules, recherchés dans le titre et le résumé.")
        }
    }
}

// MARK: - Météo

private struct WeatherEditor: View {
    @Binding var options: WeatherOptions
    @ViewState private var query = ""
    @ViewState private var results: [WeatherService.Place] = []
    @ViewState private var searching = false
    @ViewState private var message: String?

    var body: some View {
        Section {
            LabeledContent("Lieu actuel") {
                Label(options.locationName, systemImage: "mappin.and.ellipse")
            }
            HStack {
                TextField("Changer de lieu", text: $query, prompt: Text("Ville ou code postal"))
                    .onSubmit { search() }
                if searching { ProgressView().controlSize(.small) }
                Button("Rechercher") { search() }
                    .disabled(query.trimmingCharacters(in: .whitespaces).count < 2)
            }
            ForEach(results) { place in
                Button {
                    options.locationName = place.shortLabel
                    options.latitude = place.latitude
                    options.longitude = place.longitude
                    results = []
                    query = ""
                } label: {
                    HStack {
                        Text(place.label)
                        Spacer()
                        Image(systemName: "arrow.right.circle").foregroundStyle(.tint)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let message {
                Text(message).foregroundStyle(.secondary)
            }
        } header: {
            Text("Lieu")
        }

        Section("Affichage") {
            Toggle("Ressenti, vent, humidité et soleil", isOn: $options.showDetails)
            Toggle("Prévisions horaires", isOn: $options.showHourly)
            if options.showHourly {
                Stepper(value: $options.hourlyCount, in: 4...24) {
                    LabeledContent("Heures affichées", value: "\(options.hourlyCount)")
                }
            }
            Toggle("Prévisions quotidiennes", isOn: $options.showDaily)
            if options.showDaily {
                Stepper(value: $options.dailyCount, in: 2...10) {
                    LabeledContent("Jours affichés", value: "\(options.dailyCount)")
                }
            }
        }
    }

    private func search() {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 2 else { return }
        searching = true
        message = nil
        Task {
            do {
                results = try await WeatherService.search(text)
                message = results.isEmpty ? "Aucun lieu trouvé pour « \(text) »." : nil
            } catch {
                results = []
                message = error.localizedDescription
            }
            searching = false
        }
    }
}

// MARK: - Trajets

private struct CommuteEditor: View {
    @Binding var options: CommuteOptions

    var body: some View {
        Section {
            ForEach($options.routes) { $route in
                HStack(alignment: .top, spacing: 10) {
                    Toggle("Activer \(route.name)", isOn: $route.enabled).labelsHidden()
                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Nom", text: $route.name, prompt: Text("Nom du trajet (ex. Maison → Bureau)"))
                            .fontWeight(.medium)
                        TextField("Départ", text: $route.from, prompt: Text("Adresse de départ"))
                        TextField("Destination", text: $route.to, prompt: Text("Adresse de destination"))
                        Picker("Mode", selection: $route.mode) {
                            ForEach(CommuteMode.allCases) { Label($0.label, systemImage: $0.icon).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .fixedSize()
                    }
                    .labelsHidden()
                    RowControls(items: $options.routes, id: route.id)
                }
                .padding(.vertical, 2)
            }
            Button("Ajouter un trajet", systemImage: "plus") {
                options.routes.append(CommuteRoute(name: "", from: "", to: ""))
            }
        } header: {
            Text("Trajets")
        } footer: {
            Text("Entrez des adresses complètes ou des noms de lieux. Le temps de parcours est calculé pour un départ immédiat.")
        }

        Section {
            Picker("Service", selection: $options.provider) {
                ForEach(CommuteProvider.allCases) { Text($0.label).tag($0) }
            }
            Toggle("Afficher les itinéraires de rechange", isOn: $options.showAlternates)
        } header: {
            Text("Calcul")
        } footer: {
            Text("Plans tient compte de la circulation en direct. OSRM est un service libre sans données de circulation ; le transport en commun passe toujours par Plans.")
        }
    }
}

// MARK: - Sports

private struct SportsEditor: View {
    @Binding var section: SectionConfig
    @Environment(BriefingStore.self) private var store
    @ViewState private var searchingAPISports = false

    var body: some View {
        let state = store.state(for: section.id)
        let hasKey = !section.sports.apiSportsKey.trimmingCharacters(in: .whitespaces).isEmpty

        Section {
            ForEach($section.sports.leagues) { $league in
                HStack(spacing: 10) {
                    Toggle("Activer \(league.name)", isOn: $league.enabled).labelsHidden()
                    VStack(alignment: .leading, spacing: 2) {
                        TextField("Nom", text: $league.name, prompt: Text("Nom de la ligue"))
                            .fontWeight(.medium)
                        HStack(spacing: 4) {
                            Text(league.provider.label)
                            if league.provider == .espn {
                                Text("·")
                                TextField("Chemin", text: $league.path, prompt: Text("sport/ligue"))
                                    .font(.caption.monospaced())
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    .labelsHidden()
                    .textFieldStyle(.plain)

                    TeamPickerButton(league: $league, apiSportsKey: section.sports.apiSportsKey,
                                     seenTeams: seenTeams(in: state, league: league.id))
                    if league.enabled {
                        StatusDot(error: state.sourceErrors[league.id], loaded: state.content != nil && !state.isLoading)
                    }
                    RowControls(items: $section.sports.leagues, id: league.id)
                }
            }

            Menu {
                Section("ESPN") {
                    ForEach(LeagueCatalog.espn, id: \.path) { item in
                        Button(item.name) { add(League(name: item.name, path: item.path)) }
                            .disabled(has(.espn, item.path))
                    }
                    Button("Autre ligue ESPN…") { add(League(name: "", path: "")) }
                }
                Section("HockeyTech — hockey junior, féminin et LAH") {
                    ForEach(LeagueCatalog.hockeyTech, id: \.code) { item in
                        Button(item.name) {
                            add(League(name: item.name, path: item.code, provider: .hockeytech, key: item.key))
                        }
                        .disabled(has(.hockeytech, item.code))
                    }
                }
                Section("API-Sports") {
                    Button(hasKey ? "Rechercher une ligue…" : "Rechercher une ligue… (clé requise ci-dessous)") {
                        searchingAPISports = true
                    }
                    .disabled(!hasKey)
                }
            } label: {
                Label("Ajouter une ligue", systemImage: "plus")
            }
            .fixedSize()
        } header: {
            Text("Ligues et équipes")
        } footer: {
            Text("Pour chaque ligue, choisissez « Toutes les équipes » ou seulement celles que vous suivez. Chemin ESPN : sport/ligue (ex. hockey/nhl, soccer/ita.1).")
        }
        .sheet(isPresented: $searchingAPISports) {
            APISportsLeagueSearch(apiKey: section.sports.apiSportsKey) { add($0) }
        }

        Section {
            TextField("Clé API-Sports", text: $section.sports.apiSportsKey, prompt: Text("Facultatif"))
                .font(.callout.monospaced())
            Link("Obtenir une clé gratuite sur api-sports.io", destination: URL(string: "https://dashboard.api-football.com/register")!)
                .font(.callout)
        } header: {
            Text("API-Sports")
        } footer: {
            Text("Nécessaire seulement pour les ligues API-Sports. Le forfait gratuit permet 100 requêtes par jour et par sport ; Lookout met les réponses en cache pour le respecter. La clé est enregistrée en clair dans le fichier de configuration.")
        }

        Section("Affichage") {
            Toggle("Résultats d'hier", isOn: $section.sports.showYesterday)
            Toggle("Matchs de demain", isOn: $section.sports.showUpcoming)
            Toggle("Logos des équipes", isOn: $section.sports.showLogos)
        }
    }

    private func add(_ league: League) { section.sports.leagues.append(league) }

    private func has(_ provider: SportsProvider, _ path: String) -> Bool {
        section.sports.leagues.contains { $0.provider == provider && $0.path == path }
    }

    /// Équipes vues dans les matchs déjà chargés : complète la liste si le fournisseur ne la donne pas.
    private func seenTeams(in state: SectionState, league: UUID) -> [TeamRef] {
        guard case .sports(let games)? = state.content else { return [] }
        return games.filter { $0.leagueID == league }.flatMap { [$0.home, $0.away] }
            .map { TeamRef(id: $0.id, name: $0.name, logo: $0.logo?.absoluteString) }
    }
}

/// Bouton « Toutes les équipes / N équipes » qui ouvre la liste à cocher.
private struct TeamPickerButton: View {
    @Binding var league: League
    let apiSportsKey: String
    let seenTeams: [TeamRef]

    @ViewState private var open = false
    @ViewState private var teams: [TeamRef] = []
    @ViewState private var loading = false
    @ViewState private var message: String?
    @ViewState private var query = ""

    var body: some View {
        Button {
            open = true
        } label: {
            HStack(spacing: 4) {
                Text(title).lineLimit(1)
                Image(systemName: "chevron.down").font(.caption2)
            }
            .font(.callout)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(league.teams.isEmpty ? AnyShapeStyle(.primary.opacity(0.07)) : AnyShapeStyle(.tint.opacity(0.2)),
                        in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 190, alignment: .trailing)
        .help("Choisir les équipes à afficher")
        .popover(isPresented: $open, arrowEdge: .bottom) { picker }
    }

    private var title: String {
        switch league.teams.count {
        case 0: "Toutes les équipes"
        case 1: league.teams[0].name
        default: "\(league.teams.count) équipes"
        }
    }

    private var shown: [TeamRef] {
        // Liste du fournisseur, complétée par les équipes déjà choisies ou vues dans les matchs.
        var byID: [String: TeamRef] = [:]
        for team in seenTeams + league.teams + teams { byID[team.id] = team }
        let all = byID.values.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty ? all : all.filter { $0.name.localizedCaseInsensitiveContains(q) }
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Rechercher une équipe", text: $query)
                .textFieldStyle(.roundedBorder)
            Button {
                league.teams = []
            } label: {
                row(name: "Toutes les équipes", selected: league.teams.isEmpty, bold: true)
            }
            .buttonStyle(.plain)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(shown) { team in
                        Button {
                            toggle(team)
                        } label: {
                            row(name: team.name, selected: league.teams.contains { $0.id == team.id }, bold: false)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(height: 300)
            if loading {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Chargement des équipes…").font(.caption).foregroundStyle(.secondary)
                }
            } else if let message {
                Text(message).font(.caption).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(width: 300)
        .task { await load() }
    }

    private func row(name: String, selected: Bool, bold: Bool) -> some View {
        HStack {
            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(selected ? AnyShapeStyle(.tint) : AnyShapeStyle(.tertiary))
            Text(name).fontWeight(bold ? .medium : .regular).lineLimit(1)
            Spacer()
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func toggle(_ team: TeamRef) {
        if let index = league.teams.firstIndex(where: { $0.id == team.id }) {
            league.teams.remove(at: index)
        } else {
            league.teams.append(team)
        }
    }

    private func load() async {
        guard teams.isEmpty else { return }
        loading = true
        message = nil
        do {
            teams = try await SportsService.teams(for: league, apiSportsKey: apiSportsKey)
        } catch {
            message = "Liste complète indisponible (\(error.localizedDescription)). Les équipes des matchs récents restent sélectionnables."
        }
        loading = false
    }
}

/// Recherche d'une ligue dans le catalogue API-Sports.
private struct APISportsLeagueSearch: View {
    let apiKey: String
    let onAdd: (League) -> Void

    @Environment(\.dismiss) private var dismiss
    @ViewState private var sport = "hockey"
    @ViewState private var query = ""
    @ViewState private var results: [APISports.LeagueResult] = []
    @ViewState private var loading = false
    @ViewState private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ajouter une ligue API-Sports").font(.headline)
            HStack {
                Picker("Sport", selection: $sport) {
                    ForEach(LeagueCatalog.apiSports, id: \.sport) { Text($0.name).tag($0.sport) }
                }
                .labelsHidden()
                .fixedSize()
                TextField("Nom de la ligue", text: $query, prompt: Text("ex. NHL, Canada, Premier League"))
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { search() }
                Button("Rechercher") { search() }
                    .disabled(query.trimmingCharacters(in: .whitespaces).count < 3)
            }
            List(results) { result in
                Button {
                    let name = LeagueCatalog.apiSports.first { $0.sport == sport }?.name ?? sport
                    onAdd(League(name: result.name, path: "\(sport)/\(result.id)", provider: .apisports, key: result.season))
                    message = "« \(result.name) » ajoutée (\(name))."
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(result.name)
                            Text([result.country, result.season].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "plus.circle").foregroundStyle(.tint)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .frame(height: 260)
            .overlay {
                if loading {
                    ProgressView()
                } else if results.isEmpty {
                    Text("Tapez au moins 3 lettres, puis Rechercher.").foregroundStyle(.secondary)
                }
            }
            HStack {
                if let message {
                    Text(message).font(.callout).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                Button("Terminé") { dismiss() }.keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 520)
    }

    private func search() {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 3 else { return }
        loading = true
        message = nil
        Task {
            do {
                results = try await APISports.searchLeagues(sport: sport, query: text, key: apiKey)
                message = results.isEmpty ? "Aucune ligue trouvée." : nil
            } catch {
                results = []
                message = error.localizedDescription
            }
            loading = false
        }
    }
}

// MARK: - API JSON

private struct APIEditor: View {
    @Binding var options: APIOptions

    var body: some View {
        Section {
            TextField("Adresse", text: $options.url, prompt: Text("https://api.exemple.com/v1/articles"))
                .font(.callout.monospaced())
            LabeledContent("En-têtes HTTP") {
                TextEditor(text: $options.headers)
                    .font(.callout.monospaced())
                    .frame(height: 48)
                    .scrollContentBackground(.hidden)
                    .padding(4)
                    .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
            }
        } header: {
            Text("Requête")
        } footer: {
            Text("Un en-tête par ligne, au format « Nom: valeur » (ex. Authorization: Bearer …). Les clés sont enregistrées en clair dans le fichier de configuration.")
        }

        Section {
            TextField("Liste des éléments", text: $options.itemsPath, prompt: Text("ex. data.items (vide = racine)"))
            TextField("Titre", text: $options.titlePath, prompt: Text("ex. title"))
            TextField("Sous-titre", text: $options.subtitlePath, prompt: Text("facultatif"))
            TextField("Lien", text: $options.linkPath, prompt: Text("ex. url"))
            TextField("Date", text: $options.datePath, prompt: Text("facultatif — ISO 8601 ou Unix"))
            TextField("Image", text: $options.imagePath, prompt: Text("facultatif"))
        } header: {
            Text("Correspondance des champs")
        } footer: {
            Text("Chemins pointés dans le JSON : « hits » pour la liste, puis « title » ou « author.name » dans chaque élément.")
        }
        .font(.callout.monospaced())
    }
}
