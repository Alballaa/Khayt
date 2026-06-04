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
                    VStack(spacing: 3) {
                        Image(systemName: item.icon)
                            .font(.system(size: 22, weight: selection == item.id ? .semibold : .regular))
                        Text(item.title)
                            .font(.system(size: 10, weight: selection == item.id ? .semibold : .regular))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 9)
                    .padding(.bottom, 4)
                    .foregroundStyle(selection == item.id ? KhaytDesign.brand : KhaytDesign.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
        .background {
            Rectangle()
                .fill(KhaytDesign.tabBg)
                .background(.ultraThinMaterial)
                .overlay(alignment: .top) {
                    Rectangle().fill(KhaytDesign.sep).frame(height: 0.5)
                }
        }
    }
}
