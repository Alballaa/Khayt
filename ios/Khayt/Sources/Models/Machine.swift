import Foundation
import SwiftUI

struct Machine: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let type: String?
    let status: String?

    var statusTint: Color {
        switch (status ?? "").lowercased() {
        case "idle": .green
        case "printing", "busy": .blue
        case "error", "fault": .red
        case "maintenance": .orange
        default: .gray
        }
    }
}
