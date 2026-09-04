import Foundation

// The writing direction must be settled before AppKit starts, so this runs
// first and `KhaytApp` is not `@main`. See `Direction.swift` for why the
// SwiftUI environment cannot be used for this.
Direction.settle()
// The menu bar is built as the scene is created and its item titles are never
// rewritten, so the shop's own words for the stages have to be in hand BEFORE
// AppKit starts. See `Words.warm`.
Words.preload(Direction.shopLanguage())
KhaytApp.main()
