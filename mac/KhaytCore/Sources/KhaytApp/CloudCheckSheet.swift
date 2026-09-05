import SwiftUI
import KhaytCore

/// Asking the cloud what it holds, and offering to send the half that is only
/// here.
///
/// Two steps, never one. The check is read-only and the sheet says so before it
/// asks for anything — a shop typing its cloud passphrase deserves to know that
/// nothing is about to be sent. Sending is a second, deliberate press, made
/// after the difference is on screen, and it only ever goes one way: what is
/// only here, and what is newer here. See `CloudWriter`.
struct CloudCheckSheet: View {
    let shop: Shop
    @Environment(\.dismiss) private var dismiss
    @State private var passphrase = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(shop.words.callIt("mac.check_cloud")).font(.headline)

            if let result = shop.cloudCheck {
                answer(result)
            } else {
                ask
            }

            if let problem = shop.cloudProblem {
                Text(problem)
                    .font(.callout).foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Spacer()
                Button(shop.words.callIt(shop.cloudCheck == nil ? "common.cancel" : "common.close")) {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
                if shop.cloudCheck == nil {
                    Button(shop.words.callIt("mac.check_cloud_do")) {
                        Task { await shop.checkCloud(passphrase: passphrase) }
                    }
                    .keyboardShortcut(.defaultAction)
                    .disabled(passphrase.isEmpty || shop.cloudBusy)
                } else if shop.canSendToCloud {
                    // Not the default action. Return dismisses this sheet; a
                    // send is a press somebody meant to make.
                    Button(shop.words.callIt("mac.cloud_send")) {
                        Task { await shop.sendToCloud() }
                    }
                    .disabled(shop.cloudBusy)
                }
            }
        }
        .padding(20)
        .frame(width: 520)
        .onAppear { focused = true }
        // The data key is held only while this sheet is up — that is the whole
        // bargain that lets Send work without a second passphrase and a second
        // minute of scrypt.
        .onDisappear { shop.forgetCloudKey() }
    }

    private var ask: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Said before the field, not after it.
            Text(shop.words.callIt("mac.check_cloud_reads"))
                .font(.callout).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            SecureField(shop.words.callIt("mac.cloud_passphrase"), text: $passphrase)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
            Text(shop.words.callIt("mac.cloud_passphrase_why"))
                .font(.caption).foregroundStyle(.tertiary)
                .fixedSize(horizontal: false, vertical: true)
            if shop.cloudBusy {
                // Unwrapping the key is scrypt at N=32768 — deliberately slow,
                // and long enough that a still screen looks like a hung one.
                ProgressView().controlSize(.small)
            }
        }
    }

    @ViewBuilder private func answer(_ result: CloudCompare.Result) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if result.agrees {
                Label(shop.words.callIt("mac.cloud_in_step"), systemImage: "checkmark.circle")
                    .foregroundStyle(.green)
            } else {
                Label(shop.words.callIt("mac.cloud_apart"), systemImage: "arrow.triangle.branch")
                    .foregroundStyle(.orange)
            }
            // What the answer is built on, said out loud. Without it "nineteen
            // jobs are newer here" cannot be told apart from a chain that was
            // never folded.
            Text(shop.words.callIt("mac.cloud_rev") + " \(result.cloudRev)"
                 + " · " + shop.words.callIt("mac.cloud_folded",
                                             ["chain": .number(Double(result.chain)),
                                              "applied": .number(Double(result.applied))]))
                .font(.caption).foregroundStyle(.tertiary).monospacedDigit()

            if !result.differing.isEmpty {
                Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 4) {
                    GridRow {
                        Text("").gridColumnAlignment(.leading)
                        Text(shop.words.callIt("mac.only_here")).gridColumnAlignment(.trailing)
                        Text(shop.words.callIt("mac.only_there")).gridColumnAlignment(.trailing)
                        Text(shop.words.callIt("mac.newer_here")).gridColumnAlignment(.trailing)
                    }
                    .font(.caption).foregroundStyle(.secondary)
                    ForEach(result.differing) { line in
                        GridRow {
                            Text(line.collection).font(.body)
                            Text(line.onlyHere == 0 ? "—" : "\(line.onlyHere)").monospacedDigit()
                            Text(line.onlyThere == 0 ? "—" : "\(line.onlyThere)").monospacedDigit()
                            Text(line.newerHere == 0 ? "—" : "\(line.newerHere)").monospacedDigit()
                        }
                    }
                }
                Text(shop.words.callIt("mac.cloud_apart_why"))
                    .font(.caption).foregroundStyle(.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // Said whether or not there is anything else to send: a setting
            // this app cannot carry is exactly the thing a shop would otherwise
            // assume had gone up with the rest.
            if shop.cloudSettingsStay {
                Label(shop.words.callIt("mac.cloud_settings_stay"), systemImage: "gearshape")
                    .font(.caption).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let sent = shop.cloudSent {
                Label(shop.words.callIt("mac.cloud_sent",
                                        ["n": .number(Double(sent.count)),
                                         "rev": .number(Double(sent.rev))]),
                      systemImage: "arrow.up.circle")
                    .font(.callout).foregroundStyle(.green)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
