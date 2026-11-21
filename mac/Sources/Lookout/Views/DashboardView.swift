import SwiftUI

struct DashboardView: View {
    @Environment(ConfigStore.self) private var configStore
    @Environment(BriefingStore.self) private var store
    @Environment(\.openSettings) private var openSettings
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewState private var editing = false

    var body: some View {
        let general = configStore.config.general
        let visible = configStore.config.sections.filter(\.enabled)

        ScrollView {
            VStack(alignment: .leading, spacing: general.density.gridSpacing + 6) {
                if general.showGreeting { HeaderView() }
                if editing { editBanner }
                if visible.isEmpty {
                    emptyState
                } else {
                    MasonryLayout(fixedColumns: general.columns, spacing: general.density.gridSpacing) {
                        ForEach(visible) { section in
                            SectionCard(section: section, editing: editing)
                                .layoutValue(key: SpanKey.self, value: section.span)
                        }
                    }
                    .animation(reduceMotion ? nil : .smooth(duration: 0.35), value: visible.map { "\($0.id)\($0.span)" })
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
            .frame(maxWidth: 1900)
            .frame(maxWidth: .infinity)
        }
        .background(Backdrop(tinted: general.tintedBackdrop))
        .navigationTitle("Lookout")
        .navigationSubtitle(subtitle)
        .toolbar { toolbar }
        .task {
            store.refreshAll(configStore.config)
            restartTimer()
        }
        .onChange(of: configStore.config.sections) { store.sync(configStore.config) }
        .onChange(of: general.units) { store.sync(configStore.config) }
        .onChange(of: general.refreshMinutes) { restartTimer() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            // Au retour dans l'app, rattrape une actualisation manquée (veille de l'ordinateur, etc.).
            let minutes = configStore.config.general.refreshMinutes
            if minutes > 0, let last = store.lastRefresh, Date().timeIntervalSince(last) > Double(minutes * 60) {
                store.refreshAll(configStore.config)
            }
        }
        .alert("Erreur", isPresented: Binding(get: { configStore.lastError != nil }, set: { if !$0 { configStore.lastError = nil } })) {
            Button("OK") {}
        } message: {
            Text(configStore.lastError ?? "")
        }
    }

    private var subtitle: String {
        if store.isRefreshing { return "Actualisation…" }
        guard let last = store.lastRefresh else { return "" }
        return "Mis à jour à \(Format.time(last))"
    }

    private func restartTimer() {
        store.startTimer(minutes: configStore.config.general.refreshMinutes) { [configStore] in configStore.config }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                store.refreshAll(configStore.config)
            } label: {
                Label("Actualiser", systemImage: "arrow.clockwise")
            }
            .help("Actualiser toutes les sections (⌘R)")
            .disabled(store.isRefreshing)

            Toggle(isOn: $editing.animation(reduceMotion ? nil : .smooth)) {
                Label("Organiser", systemImage: "square.grid.2x2")
            }
            .help("Réorganiser, redimensionner ou masquer les sections")

            Button {
                configStore.settingsTab = "sections"
                openSettings()
            } label: {
                Label("Réglages", systemImage: "gearshape")
            }
            .help("Configurer les sections et les sources (⌘,)")
        }
    }

    private var editBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "hand.draw.fill").foregroundStyle(.tint)
            Text("Glissez une section pour la déplacer, ou utilisez les boutons de chaque carte.")
                .font(.callout)
            Spacer()
            Menu {
                ForEach(SectionKind.allCases) { kind in
                    Button {
                        configStore.add(kind)
                        configStore.settingsTab = "sections"
                        openSettings()
                    } label: {
                        Label(kind.label, systemImage: kind.icon)
                    }
                }
            } label: {
                Label("Ajouter une section", systemImage: "plus")
            }
            .fixedSize()
            Button("Terminé") { withAnimation(reduceMotion ? nil : .smooth) { editing = false } }
                .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Votre tableau de bord est vide", systemImage: "rectangle.stack.badge.plus")
        } description: {
            Text("Ajoutez ou réactivez des sections dans les réglages.")
        } actions: {
            Button("Ouvrir les réglages") {
                configStore.settingsTab = "sections"
                openSettings()
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, minHeight: 360)
    }
}

// MARK: - En-tête

struct HeaderView: View {
    @Environment(ConfigStore.self) private var configStore
    @Environment(BriefingStore.self) private var store

    var body: some View {
        TimelineView(.everyMinute) { context in
            let general = configStore.config.general
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .lastTextBaseline, spacing: 16) {
                    titles(now: context.date, name: general.displayName)
                    Spacer(minLength: 16)
                    if general.showGlance { glance }
                }
                VStack(alignment: .leading, spacing: 12) {
                    titles(now: context.date, name: general.displayName)
                    if general.showGlance { glance }
                }
            }
        }
        .padding(.top, 4)
    }

    private func titles(now: Date, name: String) -> some View {
        let hour = Calendar.current.component(.hour, from: now)
        let greeting = hour < 5 ? "Bonne nuit" : (hour < 12 ? "Bonjour" : (hour < 18 ? "Bon après-midi" : "Bonsoir"))
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        var style = Date.FormatStyle().weekday(.wide).day().month(.wide)
        style.locale = .app
        return VStack(alignment: .leading, spacing: 2) {
            Text(now.formatted(style).capitalizedFirst)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(trimmed.isEmpty ? greeting : "\(greeting), \(trimmed)")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .accessibilityElement(children: .combine)
    }

    /// Résumé en un coup d'œil : météo et premier trajet.
    @ViewBuilder
    private var glance: some View {
        let sections = configStore.config.sections.filter(\.enabled)
        HStack(spacing: 8) {
            if let section = sections.first(where: { $0.kind == .weather }),
               case .weather(let w)? = store.state(for: section.id).content {
                GlanceChip(icon: WMO.symbol(w.code, isDay: w.isDay),
                           text: "\(Int(w.temperature.rounded()))° · \(WMO.label(w.code))", multicolor: true)
            }
            if let section = sections.first(where: { $0.kind == .commute }),
               case .commute(let routes)? = store.state(for: section.id).content,
               let route = routes.first(where: { $0.error == nil }) {
                GlanceChip(icon: route.mode.icon, text: "\(route.name) · \(Format.duration(route.duration))")
            }
        }
    }
}

private struct GlanceChip: View {
    let icon: String
    let text: String
    var multicolor = false

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .symbolRenderingMode(multicolor ? .multicolor : .hierarchical)
            Text(text).lineLimit(1)
        }
        .font(.callout.weight(.medium))
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.separator.opacity(0.6), lineWidth: 0.5))
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

// MARK: - Arrière-plan

struct Backdrop: View {
    let tinted: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor)
            if tinted {
                LinearGradient(colors: [Color.accentColor.opacity(scheme == .dark ? 0.16 : 0.12), .clear],
                               startPoint: .topLeading, endPoint: .center)
                RadialGradient(colors: [Color.accentColor.opacity(scheme == .dark ? 0.10 : 0.07), .clear],
                               center: .bottomTrailing, startRadius: 0, endRadius: 700)
            }
        }
        .ignoresSafeArea()
    }
}

// MARK: - Grille « maçonnerie » adaptative

struct SpanKey: LayoutValueKey {
    static let defaultValue = 1
}

struct MasonryLayout: Layout {
    var fixedColumns = 0
    var minColumnWidth: CGFloat = 330
    var spacing: CGFloat = 16

    private func columnCount(_ width: CGFloat) -> Int {
        if fixedColumns > 0 {
            // Même avec un nombre fixe, une colonne ne descend jamais sous 260 pt.
            return min(fixedColumns, max(1, Int((width + spacing) / (260 + spacing))))
        }
        return min(4, max(1, Int((width + spacing) / (minColumnWidth + spacing))))
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> (frames: [CGRect], height: CGFloat) {
        let columns = columnCount(width)
        let columnWidth = (width - CGFloat(columns - 1) * spacing) / CGFloat(columns)
        var heights = [CGFloat](repeating: 0, count: columns)
        var frames: [CGRect] = []
        for subview in subviews {
            let span = min(max(1, subview[SpanKey.self]), columns)
            let itemWidth = columnWidth * CGFloat(span) + spacing * CGFloat(span - 1)
            let height = subview.sizeThatFits(ProposedViewSize(width: itemWidth, height: nil)).height
            var best = 0
            var bestY = CGFloat.infinity
            for start in 0...(columns - span) {
                let y = heights[start..<(start + span)].max() ?? 0
                if y < bestY - 0.5 {
                    bestY = y
                    best = start
                }
            }
            frames.append(CGRect(x: CGFloat(best) * (columnWidth + spacing), y: bestY, width: itemWidth, height: height))
            for i in best..<(best + span) { heights[i] = bestY + height + spacing }
        }
        return (frames, max(0, (heights.max() ?? 0) - spacing))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 900
        return CGSize(width: width, height: arrange(width: width, subviews: subviews).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let frames = arrange(width: bounds.width, subviews: subviews).frames
        for (subview, frame) in zip(subviews, frames) {
            subview.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), anchor: .topLeading,
                          proposal: ProposedViewSize(width: frame.width, height: frame.height))
        }
    }
}
