import WidgetKit
import SwiftUI

// Reads the snapshot the web app writes into the shared App Group (see
// ios/AttuneWidget/README.md). Shows calories left, the fasting timer, and a
// water quick-add that deep-links into the app.
private let groupId = "group.com.sriram.attune"

struct Snapshot {
    var caloriesLeft: Int
    var calorieGoal: Int
    var protein: Int, carbs: Int, fat: Int
    var fastStart: Date?
    var fastTargetHours: Double
}

func loadSnapshot() -> Snapshot {
    let d = UserDefaults(suiteName: groupId)
    let fast = d?.double(forKey: "fastStart") ?? 0
    return Snapshot(
        caloriesLeft: d?.integer(forKey: "caloriesLeft") ?? 0,
        calorieGoal: d?.integer(forKey: "calorieGoal") ?? 0,
        protein: d?.integer(forKey: "proteinLeft") ?? 0,
        carbs: d?.integer(forKey: "carbsLeft") ?? 0,
        fat: d?.integer(forKey: "fatLeft") ?? 0,
        fastStart: fast > 0 ? Date(timeIntervalSince1970: fast) : nil,
        fastTargetHours: d?.double(forKey: "fastTargetHours") ?? 16
    )
}

struct SummaryEntry: TimelineEntry { let date: Date; let snap: Snapshot }

struct SummaryProvider: TimelineProvider {
    func placeholder(in context: Context) -> SummaryEntry { SummaryEntry(date: .now, snap: loadSnapshot()) }
    func getSnapshot(in context: Context, completion: @escaping (SummaryEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SummaryEntry>) -> Void) {
        let entry = placeholder(in: context)
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
    }
}

struct AttuneWidgetView: View {
    let entry: SummaryEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        let s = entry.snap
        VStack(alignment: .leading, spacing: 6) {
            Text("\(s.caloriesLeft)").font(.system(size: 34, weight: .bold, design: .rounded))
            Text("calories left").font(.caption).foregroundStyle(.secondary)
            if family != .systemSmall {
                Text("P \(s.protein)g · C \(s.carbs)g · F \(s.fat)g left").font(.footnote)
            }
            if let start = s.fastStart {
                Label { Text(start, style: .timer) } icon: { Image(systemName: "clock") }
                    .font(.footnote)
            }
            Spacer(minLength: 0)
            Link(destination: URL(string: "attune://water")!) {
                Label("Add water", systemImage: "drop.fill").font(.footnote.bold())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(URL(string: "attune://dashboard"))
    }
}

struct AttuneSummaryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AttuneSummaryWidget", provider: SummaryProvider()) { entry in
            if #available(iOS 17.0, *) {
                AttuneWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
            } else {
                AttuneWidgetView(entry: entry).padding()
            }
        }
        .configurationDisplayName("Attune")
        .description("Calories left, fasting timer and quick water.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
