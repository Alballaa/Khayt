import SwiftUI

struct KhaytTabItem: Identifiable {
    let id: Int
    let title: String
    let icon: String
}

struct KhaytTabBar: View {
    @Binding var selection: Int
    let items: [KhaytTabItem]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { selection = item.id }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: item.icon)
                            .font(.system(size: 20, weight: selection == item.id ? .semibold : .regular))
                        Text(item.title)
                            .font(.system(size: 10, weight: selection == item.id ? .bold : .medium))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .foregroundStyle(selection == item.id ? KhaytDesign.accent : KhaytDesign.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(
            KhaytDesign.bg2
                .overlay(alignment: .top) {
                    KhaytDesign.hairline.frame(height: 1)
                }
        )
    }
}
