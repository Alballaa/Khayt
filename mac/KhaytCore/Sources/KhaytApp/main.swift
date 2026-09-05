import Foundation

// The writing direction must be settled before AppKit starts, so this runs
// first and `KhaytApp` is not `@main`. See `Direction.swift` for why the
// SwiftUI environment cannot be used for this.
// Before anything else that could fail: an uncaught Objective-C exception
// produces a crash report with a backtrace and NO REASON, and finding out why
// the app died should not require reproducing it.
LastWords.listen()
Direction.settle()
// The menu bar is built as the scene is created and its item titles are never
// rewritten, so the shop's own words for the stages have to be in hand BEFORE
// AppKit starts. See `Words.warm`.
Words.preload(Direction.shopLanguage())
KhaytApp.main()
