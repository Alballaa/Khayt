// Decode the captured LAN-server responses with the REAL companion models.
//
// Compiled together with ios/KhaytCompanion/Models/KhaytModels.swift — no copy
// of the structs lives here, so this cannot drift from what the phone runs.
// A failure is not cosmetic: JSONDecoder throwing is exactly what the app does
// on device, and the screen that asked for the data comes up empty.
//
// Usage: swiftc <models> this.swift -o decoder && ./decoder <capture-dir>

import Foundation

@main
enum ContractDecoder {
    nonisolated(unsafe) static var failures: [String] = []
    nonisolated(unsafe) static var notes: [String] = []
    nonisolated(unsafe) static var dir = ".ios-contract"

    static func load(_ name: String) -> Data? {
        let p = "\(dir)/\(name).json"
        guard let d = FileManager.default.contents(atPath: p) else {
            failures.append("\(name): capture missing at \(p)")
            return nil
        }
        return d
    }

    /// Decode one capture into `T`, reporting the error the way the app would see it.
    static func check<T: Decodable>(_ name: String, _ type: T.Type, _ inspect: ((T) -> Void)? = nil) {
        guard let data = load(name) else { return }
        do {
            let value = try JSONDecoder().decode(type, from: data)
            inspect?(value)
            print("  ok    \(name) → \(type)")
        } catch {
            failures.append("\(name) → \(type): \(error)")
            print("  FAIL  \(name) → \(type)")
        }
    }

    static func main() {
        if CommandLine.arguments.count > 1 { dir = CommandLine.arguments[1] }
        print("Decoding captures in \(dir):")

        check("status", ShopStatus.self) { s in
            // The dashboard's six counters. A zero here where the fixture had
            // work queued would mean the key decoded but the meaning drifted.
            notes.append("status: queued=\(s.queued) pending=\(s.pending) printing=\(s.printing) post=\(s.post) qc=\(s.qc) completedToday=\(s.completedToday)")
        }

        check("orders", [OrderLogEntry].self) { orders in
            // OrderStatus is a CLOSED enum on the phone. Any status the desktop
            // can write that it cannot represent is a silently unhandled order.
            let unknown = orders.map(\.status).filter { OrderStatus(rawValue: $0) == nil }
            if !unknown.isEmpty {
                notes.append("orders: statuses with no OrderStatus case → \(Set(unknown).sorted().joined(separator: ", "))")
            }
        }

        check("queue", [QueueOrder].self) { q in
            let unknown = q.map(\.status).filter { OrderStatus(rawValue: $0) == nil }
            if !unknown.isEmpty {
                notes.append("queue: statuses with no OrderStatus case → \(Set(unknown).sorted().joined(separator: ", "))")
            }
        }

        check("machines", [MachineInfo].self)
        check("machinesLive", [MachineLiveStatus].self)
        check("inventory", [InventorySpool].self)
        check("clients", [Client].self)
        check("waitingList", [WaitingListItem].self) { items in
            if items.contains(where: { $0.id == "w-declined" }) {
                failures.append("waitingList: a declined item reached the phone; the server is meant to filter those")
            }
        }

        if !notes.isEmpty {
            print("\nObservations:")
            for n in notes { print("  - \(n)") }
        }

        if failures.isEmpty {
            print("\nAll captures decode with the shipping models.")
            exit(0)
        } else {
            print("\n\(failures.count) contract failure(s):")
            for f in failures { print("  * \(f)") }
            exit(1)
        }
    }
}
