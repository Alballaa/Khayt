import Foundation
import Testing
import KhaytCore
@testable import KhaytApp

/// The whole exchange with a printer, per protocol.
///
/// The READING is `lib/octoprint.js` and `lib/prusalink.js`, pinned in
/// test/octoprint.test.js and test/prusalink.test.js against per-endpoint
/// payloads. What is tested here is the ORCHESTRATION — which endpoints are
/// asked for and which failures may be survived — because that is the half a
/// parser test cannot reach, and it is where the 2026-08-27 protocol audit
/// found its defects.
///
/// **No printer is involved.** `read` takes its fetch as a parameter.
@MainActor
struct PrinterConversationTests {

    static func machine(_ type: String) -> Machine {
        let row: JSONValue = .object([
            "id": .string("M-1"), "name": .string("Bench"),
            "printerApi": .object(["type": .string(type), "host": .string("192.168.1.9")]),
        ])
        return try! JSONDecoder().decode(Machine.self, from: JSONEncoder().encode(row))
    }

    /// Answers each path with a status and a body, and records what was asked.
    static func server(_ routes: [String: (Int, String)],
                       asked: @escaping (String) -> Void = { _ in })
        -> (URLRequest) async throws -> (Data, URLResponse) {
        { request in
            let path = (request.url?.path ?? "") + (request.url?.query.map { "?" + $0 } ?? "")
            asked(path)
            let (code, body) = routes[request.url?.path ?? ""] ?? (404, "")
            return (Data(body.utf8),
                    HTTPURLResponse(url: request.url!, statusCode: code,
                                    httpVersion: nil, headerFields: nil)!)
        }
    }

    static let base = URL(string: "http://192.168.1.9:80")!

    // MARK: - OctoPrint

    @Test("OctoPrint answering 409 for the printer still reports the job")
    func octoprintSurvives409() async throws {
        // `abort(409, "Printer is not operational")` guards GET /api/printer in
        // the 1.11 and 2.0 lines alike. That is not a fault — it is OctoPrint
        // running with the printer switched off, which is most of any working
        // day — and GET /api/job carries no such guard.
        var seen: [String] = []
        let status = try await PrinterWatch.read(
            Self.machine("octoprint"), engine: try KhaytEngine(), base: Self.base, key: "k",
            fetch: Self.server([
                "/api/printer": (409, #"{"error":"Printer is not operational"}"#),
                "/api/job": (200, #"{"state":"Offline","job":{"file":{"name":null}},"progress":{}}"#),
            ], asked: { seen.append($0) }))
        #expect(status.state == "Offline", "the card must say Offline, not fail the whole poll")
        #expect(seen.contains("/api/job"))
        #expect(seen.contains("/api/printer"))
    }

    @Test("OctoPrint answering anything else IS a fault")
    func octoprintOtherStatusFails() async throws {
        // Only 409 may be survived. Any other status is a real failure and must
        // reach the card as one.
        await #expect(throws: (any Error).self) {
            try await PrinterWatch.read(
                Self.machine("octoprint"), engine: try KhaytEngine(), base: Self.base, key: "k",
                fetch: Self.server([
                    "/api/printer": (500, "boom"),
                    "/api/job": (200, #"{"state":"Printing","progress":{}}"#),
                ]))
        }
    }

    @Test("a printing OctoPrint reads through both payloads")
    func octoprintPrinting() async throws {
        let status = try await PrinterWatch.read(
            Self.machine("octoprint"), engine: try KhaytEngine(), base: Self.base, key: "k",
            fetch: Self.server([
                "/api/printer": (200, #"{"state":{"text":"Printing"},"temperature":{"tool0":{"actual":214.9},"bed":{"actual":59.8}}}"#),
                "/api/job": (200, #"{"state":"Printing","job":{"file":{"name":"bracket.gcode"}},"progress":{"completion":42.7,"printTimeLeft":2400}}"#),
            ]))
        #expect(status.state == "Printing")
        #expect(status.progress == 43)
        #expect(status.filename == "bracket.gcode")
        #expect(status.tempNozzle == 214.9)
        #expect(status.timeRemaining == 2400)
    }

    // MARK: - PrusaLink

    @Test("PrusaLink takes the filename from the job endpoint")
    func prusalinkTwoRequests() async throws {
        // /api/v1/status has never carried file information at any firmware
        // version — the job object Buddy renders is exactly {id, progress,
        // time_remaining, filament_change_in, time_printing}.
        var seen: [String] = []
        let status = try await PrinterWatch.read(
            Self.machine("prusalink"), engine: try KhaytEngine(), base: Self.base, key: "k",
            fetch: Self.server([
                "/api/v1/status": (200, #"{"printer":{"state":"PRINTING","temp_nozzle":219.4,"temp_bed":59.9},"job":{"progress":61,"time_remaining":1980}}"#),
                "/api/v1/job": (200, #"{"file":{"name":"SPICE~1.GCO","display_name":"spice rack v2.gcode"}}"#),
            ], asked: { seen.append($0) }))
        #expect(seen.contains("/api/v1/status"))
        #expect(seen.contains("/api/v1/job"))
        #expect(status.filename == "spice rack v2.gcode", "the long name, not the 8.3 short form")
        #expect(status.progress == 61)
    }

    @Test("PrusaLink answering 204 costs the name and nothing else")
    func prusalink204() async throws {
        // It answers 204 No Content when nothing is printing, and a missing
        // name must not cost the temperatures the first request did return.
        let status = try await PrinterWatch.read(
            Self.machine("prusalink"), engine: try KhaytEngine(), base: Self.base, key: "k",
            fetch: Self.server([
                "/api/v1/status": (200, #"{"printer":{"state":"IDLE","temp_nozzle":24.2,"temp_bed":23.9}}"#),
                "/api/v1/job": (204, ""),
            ]))
        #expect(status.state == "IDLE")
        #expect(status.filename == "")
        #expect(status.tempNozzle == 24.2)
    }

    @Test("PrusaLink failing the job request outright still reports the printer")
    func prusalinkJobFails() async throws {
        let status = try await PrinterWatch.read(
            Self.machine("prusalink"), engine: try KhaytEngine(), base: Self.base, key: "k",
            fetch: Self.server([
                "/api/v1/status": (200, #"{"printer":{"state":"IDLE","temp_bed":23.9}}"#),
                "/api/v1/job": (500, "boom"),
            ]))
        #expect(status.state == "IDLE")
    }

    @Test("PrusaLink failing the STATUS request is a failure")
    func prusalinkStatusFails() async throws {
        // The other way round: without the status there is nothing to report.
        await #expect(throws: (any Error).self) {
            try await PrinterWatch.read(
                Self.machine("prusalink"), engine: try KhaytEngine(), base: Self.base, key: "k",
                fetch: Self.server(["/api/v1/status": (500, "boom")]))
        }
    }

    // MARK: - The key

    @Test("the key is sent, and an unset one is sent as nothing at all")
    func theKeyHeader() async throws {
        var headers: [String?] = []
        let record: (URLRequest) async throws -> (Data, URLResponse) = { request in
            headers.append(request.value(forHTTPHeaderField: "X-Api-Key"))
            return (Data(#"{"printer":{"state":"IDLE"}}"#.utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 200,
                                    httpVersion: nil, headerFields: nil)!)
        }
        _ = try await PrinterWatch.read(Self.machine("prusalink"), engine: try KhaytEngine(),
                                        base: Self.base, key: "a-real-key", fetch: record)
        #expect(headers.allSatisfy { $0 == "a-real-key" })

        headers = []
        _ = try await PrinterWatch.read(Self.machine("prusalink"), engine: try KhaytEngine(),
                                        base: Self.base, key: "", fetch: record)
        // NOT the string "undefined", and not an empty header either — Moonraker
        // in trusted-client mode needs no key, and sending a junk one is worse
        // than sending none. main.js records having made exactly that mistake.
        #expect(headers.allSatisfy { $0 == nil })
    }

    @Test("each protocol's default port")
    func defaultPorts() {
        #expect(PrinterWatch.defaultPort("moonraker") == 7125)
        #expect(PrinterWatch.defaultPort("octoprint") == 80)
        #expect(PrinterWatch.defaultPort("prusalink") == 80)
    }
}
