import SwiftUI

struct SectionCard: View {
    let section: SectionConfig
    let editing: Bool

    @Environment(ConfigStore.self) private var configStore
    @Environment(BriefingStore.self) private var store
    @Environment(\.openSettings) private var openSettings
    @ViewState private var isDropTarget = false

    private var general: GeneralSettings { configStore.config.general }
    private var color: Color { Color(hex: section.colorHex) }

    var body: some View {
        let state = store.state(for: section.id)
        let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)

        VStack(alignment: .leading, spacing: general.density.rowSpacing + 4) {
            header(state)
            content(state)
                .allowsHitTesting(!editing)
                .opacity(editing ? 0.55 : 1)
        }
        .padding(general.density.cardPadding)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(.regularMaterial, in: shape)
        .overlay(shape.strokeBorder(isDropTarget ? AnyShapeStyle(.tint) : AnyShapeStyle(.separator.opacity(0.55)),
                                    lineWidth: isDropTarget ? 2 : 0.5))
        .shadow(color: .black.opacity(0.06), radius: 10, y: 4)
        .contentShape(.dragPreview, shape)
        .modifier(Reorderable(id: section.id, active: editing, isTarget: $isDropTarget) { dragged in
            configStore.move(dragged, before: section.id)
        })
        .contextMenu { menuItems }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(section.title)
    }

    // MARK: En-tête

    private func header(_ state: SectionState) -> some View {
        HStack(spacing: 10) {
            Image(systemName: section.icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(color.gradient, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text(section.title)
                    .font(.headline)
                    .lineLimit(1)
                if section.kind == .weather {
                    Text(section.weather.locationName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            if editing {
                editControls
            } else {
                if state.isLoading {
                    ProgressView().controlSize(.small)
                } else if !state.sourceErrors.isEmpty {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .help(sourceErrorHelp(state))
                        .accessibilityLabel("Certaines sources sont en erreur")
                }
                Menu {
                    menuItems
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 22, height: 22)
                        .contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .foregroundStyle(.secondary)
                .help(state.updatedAt.map { "Mis à jour \(Format.ago($0))" } ?? "Options")
                .accessibilityLabel("Options de la section \(section.title)")
            }
        }
    }

    private func sourceErrorHelp(_ state: SectionState) -> String {
        let names: [UUID: String] = Dictionary(
            uniqueKeysWithValues: section.feed.sources.map { ($0.id, $0.name) } + section.sports.leagues.map { ($0.id, $0.name) })
        return state.sourceErrors.map { "\(names[$0.key] ?? "Source") : \($0.value)" }.sorted().joined(separator: "\n")
    }

    private var editControls: some View {
        HStack(spacing: 2) {
            editButton("Déplacer vers le début", "chevron.left") { configStore.move(section.id, by: -1) }
            editButton("Déplacer vers la fin", "chevron.right") { configStore.move(section.id, by: 1) }
            editButton(section.span == 1 ? "Élargir" : (section.span == 2 ? "Pleine largeur" : "Réduire"),
                       section.span == 1 ? "arrow.left.and.right" : "arrow.right.and.line.vertical.and.arrow.left") { cycleWidth() }
            editButton("Masquer la section", "eye.slash") { update { $0.enabled = false } }
        }
    }

    private func editButton(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(title)
        .accessibilityLabel(title)
    }

    @ViewBuilder
    private var menuItems: some View {
        Button("Actualiser", systemImage: "arrow.clockwise") {
            store.refresh(section, units: general.units)
        }
        if case .articles(let articles)? = store.state(for: section.id).content {
            Button("Tout marquer comme lu", systemImage: "checkmark.circle") { store.markAllRead(articles) }
        }
        Divider()
        Picker("Largeur", systemImage: "arrow.left.and.right", selection: Binding(get: { section.span }, set: { v in update { $0.span = v } })) {
            Text("1 colonne").tag(1)
            Text("2 colonnes").tag(2)
            Text("Pleine largeur").tag(99)
        }
        Button("Configurer…", systemImage: "gearshape") {
            configStore.selectedSectionID = section.id
            configStore.settingsTab = "sections"
            openSettings()
        }
        Divider()
        Button("Masquer", systemImage: "eye.slash") { update { $0.enabled = false } }
    }

    private func cycleWidth() {
        update { $0.span = $0.span == 1 ? 2 : ($0.span == 2 ? 99 : 1) }
    }

    private func update(_ change: (inout SectionConfig) -> Void) {
        guard let i = configStore.index(of: section.id) else { return }
        change(&configStore.config.sections[i])
    }

    // MARK: Contenu

    @ViewBuilder
    private func content(_ state: SectionState) -> some View {
        if let content = state.content {
            VStack(alignment: .leading, spacing: 8) {
                switch content {
                case .articles(let articles):
                    ArticleListView(section: section, articles: articles)
                case .weather(let weather):
                    WeatherView(options: section.weather, data: weather)
                case .sports(let games):
                    SportsView(section: section, games: games)
                case .commute(let routes):
                    CommuteView(section: section, results: routes)
                }
                if let error = state.error {
                    Label("Actualisation impossible : \(error)", systemImage: "wifi.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        } else if let error = state.error {
            VStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                HStack {
                    Button("Réessayer") { store.refresh(section, units: general.units) }
                    Button("Configurer…") {
                        configStore.selectedSectionID = section.id
                        configStore.settingsTab = "sections"
                        openSettings()
                    }
                }
                .controlSize(.small)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
        } else {
            SkeletonView(rows: section.kind == .weather ? 3 : min(section.maxItems, 5))
        }
    }
}

/// Glisser-déposer pour réordonner, actif seulement en mode « Organiser ».
private struct Reorderable: ViewModifier {
    let id: UUID
    let active: Bool
    @Binding var isTarget: Bool
    let onDrop: (UUID) -> Void

    func body(content: Content) -> some View {
        if active {
            content
                .draggable(id.uuidString)
                .dropDestination(for: String.self) { items, _ in
                    guard let dragged = items.first.flatMap(UUID.init(uuidString:)), dragged != id else { return false }
                    withAnimation(.smooth) { onDrop(dragged) }
                    return true
                } isTargeted: { isTarget = $0 }
        } else {
            content
        }
    }
}

struct SkeletonView: View {
    let rows: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewState private var pulse = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(0..<max(rows, 1), id: \.self) { i in
                VStack(alignment: .leading, spacing: 6) {
                    RoundedRectangle(cornerRadius: 4).frame(height: 12)
                    RoundedRectangle(cornerRadius: 4).frame(width: i.isMultiple(of: 2) ? 180 : 120, height: 10)
                }
            }
        }
        .foregroundStyle(.quaternary)
        .opacity(pulse ? 0.45 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
        .accessibilityLabel("Chargement")
    }
}

/// Ligne cliquable avec surbrillance au survol.
struct HoverRow<Content: View>: View {
    let action: () -> Void
    @ViewBuilder let content: Content
    @ViewState private var hovering = false

    var body: some View {
        Button(action: action) {
            content
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(hovering ? AnyShapeStyle(.primary.opacity(0.07)) : AnyShapeStyle(.clear),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, -8)
        .onHover { hovering = $0 }
    }
}

struct EmptyHint: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 12)
    }
}
