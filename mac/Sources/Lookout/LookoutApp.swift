import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        UserDefaults.standard.set(false, forKey: "NSQuitAlwaysKeepsWindows")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main
struct LookoutApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @ViewState private var configStore = ConfigStore()
    @ViewState private var store = BriefingStore()

    var body: some Scene {
        Window("Lookout", id: "main") {
            DashboardView()
                .environment(configStore)
                .environment(store)
                .modifier(Theme(general: configStore.config.general))
                .frame(minWidth: 420, minHeight: 480)
        }
        .defaultSize(width: 1240, height: 880)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Actualiser tout") { store.refreshAll(configStore.config) }
                    .keyboardShortcut("r", modifiers: .command)
                Divider()
            }
        }

        Settings {
            SettingsView()
                .environment(configStore)
                .environment(store)
                .modifier(Theme(general: configStore.config.general))
        }
    }
}

/// Apparence globale : mode clair/sombre, couleur d'accent, langue des formats.
struct Theme: ViewModifier {
    let general: GeneralSettings

    func body(content: Content) -> some View {
        content
            .tint(Color(hex: general.accentHex))
            .preferredColorScheme(general.appearance == .system ? nil : (general.appearance == .dark ? .dark : .light))
            .environment(\.locale, .app)
    }
}
