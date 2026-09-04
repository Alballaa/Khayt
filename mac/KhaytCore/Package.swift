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
        .executable(name: "Khayt", targets: ["KhaytApp"]),
    ],
    targets: [
        .target(name: "KhaytCore", resources: [.copy("JS")]),
        // The interface. It writes now — jobs, customers, payments, moves —
        // through `StoreWriter`, which reads the book from disk inside every
        // write and swaps the file atomically. `Resources` carries the sample
        // shop and the invoice's stylesheet, synced from the renderer.
        .executableTarget(name: "KhaytApp", dependencies: ["KhaytCore"],
                          resources: [.process("Resources")]),
        .testTarget(name: "KhaytCoreTests", dependencies: ["KhaytCore"]),
        .testTarget(name: "KhaytAppTests", dependencies: ["KhaytApp", "KhaytCore"]),
    ]
)
