import AppKit
import SwiftUI

/// `@State` est une macro dans le SDK récent, dont le plugin n'est fourni qu'avec Xcode.
/// Cet alias utilise directement le property wrapper, ce qui permet de compiler avec les Command Line Tools.
typealias ViewState<Value> = SwiftUI.State<Value>

extension Locale {
    static let app = Locale(identifier: "fr_CA")
}

extension Color {
    init(hex: String) {
        var value: UInt64 = 0
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard cleaned.count == 6, Scanner(string: cleaned).scanHexInt64(&value) else {
            self = .accentColor
            return
        }
        self.init(.sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
                  blue: Double(value & 0xFF) / 255)
    }

    var hexString: String {
        guard let c = NSColor(self).usingColorSpace(.sRGB) else { return "#3B82F6" }
        return String(format: "#%02X%02X%02X", Int(round(c.redComponent * 255)), Int(round(c.greenComponent * 255)),
                      Int(round(c.blueComponent * 255)))
    }
}

enum Palette {
    static let swatches = ["#EF4444", "#F97316", "#F59E0B", "#22C55E", "#10B981", "#14B8A6",
                           "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#64748B"]
}

enum Format {
    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = .app
        f.unitsStyle = .short
        return f
    }()

    static func ago(_ date: Date, now: Date = Date()) -> String {
        if abs(now.timeIntervalSince(date)) < 60 { return "à l'instant" }
        return relative.localizedString(for: date, relativeTo: now)
    }

    static func duration(_ seconds: TimeInterval) -> String {
        let minutes = max(1, Int((seconds / 60).rounded()))
        if minutes < 60 { return "\(minutes) min" }
        return "\(minutes / 60) h \(String(format: "%02d", minutes % 60))"
    }

    static func distance(_ meters: Double, units: UnitSystem) -> String {
        let value = units == .metric ? meters / 1000 : meters / 1609.344
        let unit = units == .metric ? "km" : "mi"
        return value < 10 ? String(format: "%.1f %@", value, unit).replacingOccurrences(of: ".", with: ",")
            : "\(Int(value.rounded())) \(unit)"
    }

    static func time(_ date: Date, timeZone: TimeZone = .current) -> String {
        var style = Date.FormatStyle(date: .omitted, time: .shortened)
        style.locale = .app
        style.timeZone = timeZone
        return date.formatted(style)
    }
}

enum Links {
    @MainActor
    static func open(_ url: URL?, inBackground: Bool) {
        guard let url else { return }
        let config = NSWorkspace.OpenConfiguration()
        config.activates = !inBackground
        NSWorkspace.shared.open(url, configuration: config)
    }

    @MainActor
    static func copy(_ url: URL?) {
        guard let url else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
    }
}

extension String {
    /// Liste de mots-clés séparés par des virgules, normalisés.
    var keywordList: [String] {
        split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
    }
}
