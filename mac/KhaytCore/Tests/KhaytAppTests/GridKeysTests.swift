import SwiftUI
import Testing
@testable import KhaytApp

/// Arrow keys in the library grid.
struct GridKeysTests {

    @Test("the arrows move in reading order, which is mirrored in Arabic")
    func readingOrder() {
        // Left to right: right is forward.
        #expect(LibraryGrid.step(for: .rightArrow, columns: 4, layout: .leftToRight) == 1)
        #expect(LibraryGrid.step(for: .leftArrow, columns: 4, layout: .leftToRight) == -1)
        // Mirrored: LEFT is forward. A grid whose right arrow walks backwards in
        // a mirrored window is worse than one with no arrow keys at all.
        #expect(LibraryGrid.step(for: .leftArrow, columns: 4, layout: .rightToLeft) == 1)
        #expect(LibraryGrid.step(for: .rightArrow, columns: 4, layout: .rightToLeft) == -1)
    }

    @Test("up and down move a whole row, whichever way the window reads")
    func rowsDoNotMirror() {
        // Vertical is vertical in both: only the horizontal axis mirrors.
        for layout in [LayoutDirection.leftToRight, .rightToLeft] {
            #expect(LibraryGrid.step(for: .downArrow, columns: 5, layout: layout) == 5)
            #expect(LibraryGrid.step(for: .upArrow, columns: 5, layout: layout) == -5)
        }
    }

    @Test("the column count follows the width, and is never zero")
    func columnsFitTheWidth() {
        // A pane narrower than one cell still gets one, or the grid divides by
        // nothing and the arrow keys stop meaning anything.
        #expect(LibraryGrid.columns(across: 0) == 1)
        #expect(LibraryGrid.columns(across: 40) == 1)
        #expect(LibraryGrid.columns(across: 240) == 1)
        #expect(LibraryGrid.columns(across: 420) == 2)
        #expect(LibraryGrid.columns(across: 800) == 4)
        // Monotonic: a wider pane never fits fewer.
        var last = 0
        for width in stride(from: 100.0, through: 2000.0, by: 37.0) {
            let n = LibraryGrid.columns(across: width)
            #expect(n >= last, "\(width)pt fits \(n), narrower fitted \(last)")
            last = n
        }
    }
}
