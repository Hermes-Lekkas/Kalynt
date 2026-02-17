// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KalyntHelper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "KalyntHelper", targets: ["KalyntHelper"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "KalyntHelper",
            dependencies: []
        )
    ]
)
