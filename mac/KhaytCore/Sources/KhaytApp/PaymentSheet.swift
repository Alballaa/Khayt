import SwiftUI
import KhaytCore

/// What was paid, how, and when.
///
/// Three fields, because that is what Khayt asks for and what a shop actually
/// knows. The amount is capped at the price — an overpayment is a credit note,
/// not a bigger payment, and the field says so by refusing rather than by
/// explaining afterwards.
struct PaymentSheet: View {
    let shop: Shop
    let subject: Shop.PendingHold

    @State private var amount: Double = 0
    @State private var method = "cash"
    @State private var paidAt = Date()
    @State private var started = false
    @FocusState private var focused: Bool

    private var job: Order? { shop.orders.first { $0.id == subject.id } }
    private var price: Double { job?.price ?? 0 }
    private var currency: String { job?.currency ?? "SAR" }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(shop.words.callIt("pay.modal_title")).font(.headline)
            Text(subject.project).font(.callout).foregroundStyle(.secondary).lineLimit(1)

            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    Text(shop.words.callIt("common.total")).foregroundStyle(.secondary)
                    Text(Money.text(price, currency)).monospacedDigit()
                }
                GridRow {
                    Text(shop.words.callIt("pay.amount_paid")).foregroundStyle(.secondary)
                    TextField("", value: $amount, format: .number.precision(.fractionLength(0...2)))
                        .textFieldStyle(.roundedBorder)
                        .monospacedDigit()
                        .focused($focused)
                        .onSubmit(commit)
                }
                GridRow {
                    Text(shop.words.callIt("pay.payment_method")).foregroundStyle(.secondary)
                    Picker("", selection: $method) {
                        ForEach(Shop.paymentMethods, id: \.self) { m in
                            Text(shop.words.callIt("pay.method." + m)).tag(m)
                        }
                    }
                    .labelsHidden()
                }
                GridRow {
                    Text(shop.words.callIt("pay.paid_on")).foregroundStyle(.secondary)
                    // No future date: money is recorded when it arrives, and a
                    // payment dated next week is a promise, not a payment.
                    DatePicker("", selection: $paidAt, in: ...Date(), displayedComponents: .date)
                        .labelsHidden()
                }
            }

            // Said before it is saved, by the same rule every report will read
            // it with — a gift card or a credit note on the order can make a
            // part payment settle it, and the shop should see that here.
            if let job {
                Text(shop.words.callIt("flow.owed") + " " + Money.text(max(0, price - amount), currency))
                    .font(.callout)
                    .foregroundStyle(price - amount > 0.005 ? AnyShapeStyle(Khayt.attention) : AnyShapeStyle(.secondary))
                    .monospacedDigit()
                    .help(job.id)
            }

            HStack {
                if (job?.paidAmount ?? 0) > 0 {
                    Button(shop.words.callIt("mac.clear_payment"), role: .destructive) {
                        let id = subject.id
                        shop.clearQuestion()
                        Task { await shop.clearPayment(id) }
                    }
                }
                Spacer()
                Button(shop.words.callIt("common.cancel")) { shop.clearQuestion() }
                    .keyboardShortcut(.cancelAction)
                Button(shop.words.callIt("common.save"), action: commit)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(18)
        .frame(width: 380)
        .onAppear {
            guard !started else { return }
            started = true
            // Opens on what is already recorded, not on zero: the common edit is
            // "they paid the rest", and a field that starts empty makes that a
            // retype rather than a correction.
            amount = job?.paidAmount ?? 0
            if let m = job?.paymentMethod, Shop.paymentMethods.contains(m) { method = m }
            focused = true
        }
    }

    private func commit() {
        let id = subject.id
        let paid = min(max(0, amount), price)
        let when = paidAt
        let how = method
        shop.clearQuestion()
        Task { await shop.recordPayment(id, amount: paid, method: how, paidAt: when) }
    }
}
