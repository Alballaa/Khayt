import Foundation
import SwiftUI

enum OrderStatus: String, Codable, CaseIterable, Identifiable {
    case pending, printing, post, qc, completed
    case onHold = "on_hold"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .pending: "Pending"
        case .printing: "Printing"
        case .post: "Post-processing"
        case .qc: "QC"
        case .completed: "Completed"
        case .onHold: "On hold"
        }
    }

    var tint: Color {
        switch self {
        case .pending: .gray
        case .printing: .blue
        case .post: .orange
        case .qc: .purple
        case .completed: .green
        case .onHold: .red
        }
    }

    static var kanbanColumns: [OrderStatus] {
        [.pending, .printing, .post, .qc, .completed]
    }
}

struct Order: Codable, Identifiable, Hashable {
    let id: String
    let project: String?
    let client: String?
    var status: OrderStatus
    let material: String?
    let price: Double?
    let dueDate: String?
    let date: String?
    let paymentStatus: String?
    let machine: String?
    let priority: String?

    enum CodingKeys: String, CodingKey {
        case id, project, client, status, material, price, dueDate, date, paymentStatus, machine, priority
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        project = try c.decodeIfPresent(String.self, forKey: .project)
        client = try c.decodeIfPresent(String.self, forKey: .client)
        let raw = try c.decodeIfPresent(String.self, forKey: .status) ?? "pending"
        status = OrderStatus(rawValue: raw) ?? .pending
        material = try c.decodeIfPresent(String.self, forKey: .material)
        price = try? c.decodeIfPresent(Double.self, forKey: .price)
        dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
        date = try c.decodeIfPresent(String.self, forKey: .date)
        paymentStatus = try c.decodeIfPresent(String.self, forKey: .paymentStatus)
        machine = try c.decodeIfPresent(String.self, forKey: .machine)
        priority = try c.decodeIfPresent(String.self, forKey: .priority)
    }
}
