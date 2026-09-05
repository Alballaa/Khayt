import Foundation
import KhaytCore

/// A customer as the shop actually wrote them down.
///
/// The `clients` collection, which this app did not read at all: customers were
/// derived from the names denormalised onto orders, so a customer with no jobs
/// yet did not exist here, and nobody's phone number, email or VAT number was
/// ever shown.
///
/// It matters more than a missing screen. A job's `clientId` points at a row in
/// THIS collection — everything that follows a customer through the app reads
/// it — so a job created with an id invented from a name is a job with no
/// customer at all as far as the rest of Khayt is concerned.
struct Client: Identifiable, Hashable, Sendable, Decodable {
    let id: String
    let nameEn: String
    let nameAr: String
    let phone: String
    let email: String
    /// Commercial registration and VAT number, which a Saudi invoice carries.
    let cr: String
    let vat: String
    let notes: String
    let defaultDiscount: Double
    let createdAt: String?

    private enum CodingKeys: String, CodingKey {
        case id, nameEn, nameAr, phone, email, cr, vat, notes, defaultDiscount, createdAt
    }

    /// Is there anything under the heading?
    ///
    /// A client written down in a hurry has a name and nothing else — the very
    /// case the initialiser below exists for — and the customer screen printed
    /// a CLIENT heading with nothing beneath it for exactly those. The name is
    /// not counted: it is the title of the pane, said above.
    var hasContactDetails: Bool {
        !phone.isEmpty || !email.isEmpty || !cr.isEmpty || !vat.isEmpty || !notes.isEmpty
    }

    /// Every field but the id is optional, because a client written down in a
    /// hurry has a name and nothing else — and a row this app refuses to read
    /// is a customer who disappears.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nameEn = try c.decodeIfPresent(String.self, forKey: .nameEn) ?? ""
        nameAr = try c.decodeIfPresent(String.self, forKey: .nameAr) ?? ""
        phone = try c.decodeIfPresent(String.self, forKey: .phone) ?? ""
        email = try c.decodeIfPresent(String.self, forKey: .email) ?? ""
        cr = try c.decodeIfPresent(String.self, forKey: .cr) ?? ""
        vat = try c.decodeIfPresent(String.self, forKey: .vat) ?? ""
        notes = try c.decodeIfPresent(String.self, forKey: .notes) ?? ""
        defaultDiscount = try c.decodeIfPresent(Double.self, forKey: .defaultDiscount) ?? 0
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
    }

    init(id: String, nameEn: String = "", nameAr: String = "", phone: String = "",
         email: String = "", cr: String = "", vat: String = "", notes: String = "",
         defaultDiscount: Double = 0, createdAt: String? = nil) {
        self.id = id; self.nameEn = nameEn; self.nameAr = nameAr
        self.phone = phone; self.email = email; self.cr = cr; self.vat = vat
        self.notes = notes; self.defaultDiscount = defaultDiscount; self.createdAt = createdAt
    }

    /// The record, as `clients` holds it.
    var record: [String: JSONValue] {
        [
            "id": .string(id),
            "nameEn": .string(nameEn), "nameAr": .string(nameAr),
            "phone": .string(phone), "email": .string(email),
            "cr": .string(cr), "vat": .string(vat), "notes": .string(notes),
            "defaultDiscount": .number(defaultDiscount),
            "createdAt": createdAt.map(JSONValue.string) ?? .null,
        ]
    }

    /// Whichever name is filled in, English first. The SHOP's own language
    /// order is `KhaytContentLanguages`' answer and is resolved by the engine
    /// when the screen asks; this is the fallback for a list that has not.
    var anyName: String {
        if !nameEn.isEmpty { return nameEn }
        if !nameAr.isEmpty { return nameAr }
        return id
    }

    /// The same customer with one field changed.
    ///
    /// A record is a value: editing one produces another rather than mutating
    /// this one, so the shape stays defined in exactly one place.
    func with(_ key: KeyPath<Client, String>, _ value: String) -> Client {
        Client(
            id: id,
            nameEn: key == \Client.nameEn ? value : nameEn,
            nameAr: key == \Client.nameAr ? value : nameAr,
            phone: key == \Client.phone ? value : phone,
            email: key == \Client.email ? value : email,
            cr: key == \Client.cr ? value : cr,
            vat: key == \Client.vat ? value : vat,
            notes: key == \Client.notes ? value : notes,
            defaultDiscount: defaultDiscount,
            createdAt: createdAt)
    }
}
