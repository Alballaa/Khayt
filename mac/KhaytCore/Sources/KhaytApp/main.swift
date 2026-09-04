import Foundation

// The writing direction must be settled before AppKit starts, so this runs
// first and `KhaytApp` is not `@main`. See `Direction.swift` for why the
// SwiftUI environment cannot be used for this.
Direction.settle()
KhaytApp.main()
