import Foundation

struct QueueStatus: Codable, Equatable {
    let queued: Int
    let pending: Int
    let printing: Int
    let post: Int
    let qc: Int
    let completedToday: Int

    enum CodingKeys: String, CodingKey {
        case queued, pending, printing, post, qc
        case completedToday = "completed_today"
    }

    static let empty = QueueStatus(queued: 0, pending: 0, printing: 0, post: 0, qc: 0, completedToday: 0)
}
