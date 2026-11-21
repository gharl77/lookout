import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(ConfigStore.self) private var configStore

    var body: some View {
        @Bindable var configStore = configStore
        TabView(selection: $configStore.settingsTab) {
            Tab("Sections", systemImage: "square.grid.2x2", value: "sections") {
                SectionsSettingsView()
            }
            Tab("Général", systemImage: "gearshape", value: "general") {
                GeneralSettingsView()
            }
            Tab("Données", systemImage: "externaldrive", value: "data") {
                DataSettingsView()
            }
        }
        .frame(minWidth: 900, idealWidth: 940, minHeight: 600, idealHeight: 680)
    }
}

// MARK: - Général

struct GeneralSettingsView: View {
    @Environment(ConfigStore.self) private var configStore

    var body: some View {
        @Bindable var configStore = configStore
        Form {
            Section("Accueil") {
                Toggle("Afficher le message d'accueil", isOn: $configStore.config.general.showGreeting)
                TextField("Votre prénom", text: $configStore.config.general.displayName, prompt: Text("Facultatif"))
                    .disabled(!configStore.config.general.showGreeting)
                Toggle("Afficher le coup d'œil (météo et premier trajet)", isOn: $configStore.config.general.showGlance)
                    .disabled(!configStore.config.general.showGreeting)
            }

            Section("Apparence") {
                Picker("Thème", selection: $configStore.config.general.appearance) {
                    ForEach(Appearance.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                LabeledContent("Couleur d'accent") {
                    ColorSwatchPicker(hex: $configStore.config.general.accentHex)
                }
                Toggle("Arrière-plan teinté", isOn: $configStore.config.general.tintedBackdrop)
                Picker("Densité", selection: $configStore.config.general.density) {
                    ForEach(Density.allCases) { Text($0.label).tag($0) }
                }
                Picker("Colonnes", selection: $configStore.config.general.columns) {
                    Text("Automatique").tag(0)
                    ForEach(1...4, id: \.self) { Text("\($0)").tag($0) }
                }
            }

            Section("Actualisation et unités") {
                Picker("Actualiser automatiquement", selection: $configStore.config.general.refreshMinutes) {
                    Text("Jamais (manuel)").tag(0)
                    Text("Toutes les 5 minutes").tag(5)
                    Text("Toutes les 15 minutes").tag(15)
                    Text("Toutes les 30 minutes").tag(30)
                    Text("Toutes les heures").tag(60)
                }
                Picker("Unités", selection: $configStore.config.general.units) {
                    ForEach(UnitSystem.allCases) { Text($0.label).tag($0) }
                }
            }

            Section("Lecture") {
                Toggle("Ouvrir les liens en arrière-plan", isOn: $configStore.config.general.openLinksInBackground)
                Toggle("Atténuer les articles déjà lus", isOn: $configStore.config.general.dimReadArticles)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Données

struct DataSettingsView: View {
    @Environment(ConfigStore.self) private var configStore
    @ViewState private var confirmReset = false
    @ViewState private var message: String?

    var body: some View {
        Form {
            Section {
                LabeledContent("Exporter la configuration") {
                    Button("Exporter…") { export() }
                }
                LabeledContent("Importer une configuration") {
                    Button("Importer…") { importFile() }
                }
            } header: {
                Text("Sauvegarde")
            } footer: {
                Text("Le fichier JSON contient toutes vos sections, sources et préférences. Il peut aussi être modifié à la main.")
            }

            Section("Fichier de configuration") {
                LabeledContent("Emplacement") {
                    Button("Afficher dans le Finder") {
                        configStore.save()
                        NSWorkspace.shared.activateFileViewerSelecting([ConfigStore.fileURL])
                    }
                }
            }

            Section {
                LabeledContent("Revenir à la configuration de départ") {
                    Button("Réinitialiser…", role: .destructive) { confirmReset = true }
                }
            } footer: {
                if let message {
                    Text(message).foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .confirmationDialog("Réinitialiser toute la configuration ?", isPresented: $confirmReset) {
            Button("Réinitialiser", role: .destructive) {
                configStore.resetToDefaults()
                message = "Configuration réinitialisée."
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Toutes vos sections et sources seront remplacées par celles de départ. Exportez d'abord votre configuration si vous voulez la conserver.")
        }
    }

    private func export() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "Lookout-configuration.json"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try configStore.exportConfig(to: url)
            message = "Configuration exportée."
        } catch {
            message = "Échec de l'exportation : \(error.localizedDescription)"
        }
    }

    private func importFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.message = "La configuration actuelle sera remplacée."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try configStore.importConfig(from: url)
            message = "Configuration importée."
        } catch {
            message = error.localizedDescription
        }
    }
}

// MARK: - Sections : liste + éditeur

struct SectionsSettingsView: View {
    @Environment(ConfigStore.self) private var configStore
    @ViewState private var pendingDelete: UUID?

    var body: some View {
        @Bindable var configStore = configStore
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                List(selection: $configStore.selectedSectionID) {
                    ForEach(configStore.config.sections) { section in
                        SectionListRow(section: section)
                            .tag(section.id)
                            .contextMenu {
                                Button("Dupliquer") { configStore.duplicate(section.id) }
                                Button("Supprimer…", role: .destructive) { pendingDelete = section.id }
                            }
                    }
                    .onMove { configStore.config.sections.move(fromOffsets: $0, toOffset: $1) }
                }
                .listStyle(.sidebar)
                .scrollContentBackground(.hidden)

                Divider()
                HStack(spacing: 4) {
                    Menu {
                        ForEach(SectionKind.allCases) { kind in
                            Button {
                                configStore.add(kind)
                            } label: {
                                Label(kind.label, systemImage: kind.icon)
                                Text(kind.detail)
                            }
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .fixedSize()
                    .help("Ajouter une section")

                    Button {
                        pendingDelete = configStore.selectedSectionID
                    } label: {
                        Image(systemName: "minus")
                    }
                    .disabled(configStore.selectedSectionID == nil)
                    .help("Supprimer la section sélectionnée")

                    Button {
                        if let id = configStore.selectedSectionID { configStore.duplicate(id) }
                    } label: {
                        Image(systemName: "plus.square.on.square")
                    }
                    .disabled(configStore.selectedSectionID == nil)
                    .help("Dupliquer la section sélectionnée")
                    Spacer()
                }
                .buttonStyle(.borderless)
                .padding(8)
            }
            .frame(width: 250)

            Divider()

            if let id = configStore.selectedSectionID, let index = configStore.index(of: id) {
                SectionEditor(section: safeBinding(id: id, fallback: configStore.config.sections[index]))
                    .id(id)
            } else {
                ContentUnavailableView("Aucune section sélectionnée", systemImage: "sidebar.left",
                                       description: Text("Choisissez une section à gauche, ou ajoutez-en une avec le bouton +.\nGlissez les sections pour changer leur ordre."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onAppear {
            if configStore.selectedSectionID == nil { configStore.selectedSectionID = configStore.config.sections.first?.id }
        }
        .confirmationDialog("Supprimer cette section ?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })) {
            Button("Supprimer", role: .destructive) {
                if let id = pendingDelete { configStore.remove(id) }
                pendingDelete = nil
            }
            Button("Annuler", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("La section et ses sources seront supprimées. Pour la retirer temporairement, désactivez-la plutôt.")
        }
    }

    /// Liaison qui reste valide même si la section est supprimée pendant l'édition.
    private func safeBinding(id: UUID, fallback: SectionConfig) -> Binding<SectionConfig> {
        Binding {
            configStore.config.sections.first { $0.id == id } ?? fallback
        } set: { newValue in
            if let i = configStore.index(of: id) { configStore.config.sections[i] = newValue }
        }
    }
}

private struct SectionListRow: View {
    let section: SectionConfig

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: section.icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(Color(hex: section.colorHex).gradient, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                Text(section.title).lineLimit(1)
                Text(section.kind.label).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if !section.enabled {
                Image(systemName: "eye.slash")
                    .foregroundStyle(.secondary)
                    .help("Section masquée")
            }
        }
        .padding(.vertical, 3)
        .opacity(section.enabled ? 1 : 0.6)
    }
}

// MARK: - Contrôles partagés

struct ColorSwatchPicker: View {
    @Binding var hex: String

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Palette.swatches, id: \.self) { swatch in
                Button {
                    hex = swatch
                } label: {
                    Circle()
                        .fill(Color(hex: swatch))
                        .frame(width: 18, height: 18)
                        .overlay {
                            if swatch.caseInsensitiveCompare(hex) == .orderedSame {
                                Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Couleur \(swatch)")
            }
            ColorPicker("Couleur personnalisée", selection: Binding(get: { Color(hex: hex) }, set: { hex = $0.hexString }),
                        supportsOpacity: false)
                .labelsHidden()
                .help("Couleur personnalisée")
        }
    }
}

struct IconPicker: View {
    @Binding var symbol: String
    let color: Color
    @ViewState private var open = false

    static let symbols = [
        "newspaper.fill", "globe.americas.fill", "globe.europe.africa.fill", "building.columns.fill", "megaphone.fill",
        "cpu.fill", "desktopcomputer", "iphone", "gamecontroller.fill", "atom", "flame.fill", "bolt.fill",
        "cloud.sun.fill", "sun.max.fill", "snowflake", "umbrella.fill", "thermometer.medium", "leaf.fill",
        "car.fill", "tram.fill", "bicycle", "airplane", "figure.walk", "map.fill",
        "sportscourt.fill", "figure.hockey", "hockey.puck.fill", "soccerball", "football.fill", "basketball.fill",
        "baseball.fill", "tennis.racket", "flag.checkered", "trophy.fill", "figure.run", "dumbbell.fill",
        "chart.line.uptrend.xyaxis", "dollarsign.circle.fill", "briefcase.fill", "cart.fill", "house.fill", "heart.fill",
        "film.fill", "music.note", "book.fill", "fork.knife", "cross.case.fill", "graduationcap.fill",
        "star.fill", "bookmark.fill", "tag.fill", "bell.fill", "curlybraces", "antenna.radiowaves.left.and.right",
    ]

    var body: some View {
        Button {
            open = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(color.gradient, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                Image(systemName: "chevron.down").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Choisir une icône")
        .popover(isPresented: $open, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(30), spacing: 6), count: 9), spacing: 6) {
                    ForEach(Self.symbols, id: \.self) { name in
                        Button {
                            symbol = name
                            open = false
                        } label: {
                            Image(systemName: name)
                                .frame(width: 30, height: 30)
                                .background(name == symbol ? AnyShapeStyle(color.opacity(0.25)) : AnyShapeStyle(.clear),
                                            in: RoundedRectangle(cornerRadius: 7))
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(name)
                    }
                }
                TextField("Nom de symbole SF", text: $symbol)
                    .textFieldStyle(.roundedBorder)
                    .font(.callout.monospaced())
            }
            .padding(14)
            .frame(width: 350)
        }
    }
}
