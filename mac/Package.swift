// swift-tools-version:6.2
import PackageDescription

let package = Package(
    name: "Lookout",
    defaultLocalization: "fr",
    platforms: [.macOS(.v26)],
    targets: [
        .executableTarget(
            name: "Lookout",
            path: "Sources/Lookout",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
