import Foundation
import Testing
@testable import KhaytApp

/// Three kinds of customer, and the middle one was missing.
///
/// There is the customer nobody has written down, the one written down with a
/// phone number, and the one written down as a name and nothing else. That last
/// is ordinary — the decoder exists so a row "written down in a hurry" still
/// reads — and it printed a CLIENT heading with nothing beneath it, which reads
/// as a screen that failed to load.
///
/// Sending it down the other branch instead would say "Not written down yet"
/// about somebody who is, so the answer is a third state and not a swapped
/// condition. This is the test that tells the two mistakes apart.
struct CustomerRecordTests {

    static func client(_ json: String) throws -> Client {
        try JSONDecoder().decode(Client.self, from: Data(json.utf8))
    }

    @Test("a name and nothing else has nothing to put under a heading")
    func aNameOnly() throws {
        let bare = try Self.client(#"{"id":"C1","nameEn":"Najd Architects"}"#)
        #expect(bare.nameEn == "Najd Architects", "and it is still a real record")
        #expect(!bare.hasContactDetails)
    }

    @Test("any one of the five is enough to draw the section")
    func anyFieldCounts() throws {
        let fields = ["phone": "+966 50 123 4567", "email": "a@b.example",
                      "cr": "1010000000", "vat": "300000000000003", "notes": "Pays late"]
        for (key, value) in fields {
            let one = try Self.client(#"{"id":"C1","nameEn":"Najd","\#(key)":"\#(value)"}"#)
            #expect(one.hasContactDetails, "\(key) alone should be enough")
        }
    }

    /// The name is the title of the pane, said above the section. Counting it
    /// would bring the empty heading straight back.
    @Test("the name is not one of the details")
    func theNameDoesNotCount() throws {
        let bilingual = try Self.client(#"{"id":"C1","nameEn":"Najd","nameAr":"نجد"}"#)
        #expect(!bilingual.hasContactDetails)
    }

    /// A field present and empty is a field that is not there. The decoder
    /// turns every missing string into "", so these are the same case.
    @Test("an empty string is not a detail")
    func emptyIsAbsent() throws {
        let blank = try Self.client(#"{"id":"C1","nameEn":"Najd","phone":"","email":"","notes":""}"#)
        #expect(!blank.hasContactDetails)
    }
}
