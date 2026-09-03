// swift-tools-version: 6.0
import PackageDescription

/// KhaytCore — the shared heart of Khayt, on macOS.
///
/// Khayt's business logic is 29,121 lines of dependency-free JavaScript in
/// `lib/`: the tax engine, pricing, payment plans, split-order money, loyalty,
/// the estimator. It carries the corrections from twenty-two review passes and
/// is pinned by 3,598 tests.
///
/// This package does NOT reimplement any of it. macOS ships JavaScriptCore as a
/// system framework, so that code runs here unchanged, with nothing bundled and
/// no Node — and a differential test suite proves Swift and Node agree to the
/// byte. Reimplementing `computeTax` in Swift would earn the right to be wrong
/// in a second, different way, and every future fix would have to be made twice.
///
/// What IS written in Swift: the store, the platform layer, and the interface.
let package = Package(
    name: "KhaytCore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "KhaytCore", targets: ["KhaytCore"]),
    ],
    targets: [
        .target(name: "KhaytCore", resources: [.copy("JS")]),
        .testTarget(name: "KhaytCoreTests", dependencies: ["KhaytCore"]),
    ]
)
